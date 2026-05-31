import { getPropertyValue } from '../getPropertyValue.js';
import { brokerSafeId } from '../shared.js';
import { cloneContent, shiftParent } from '../messageHelper.js';
import { K_COMPLETED, K_EXECUTE_MESSAGE, K_MESSAGE_Q, K_REFERENCE_ELEMENT, K_REFERENCE_INFO } from '../constants.js';

/**
 * Signal event definition
 * @param {import('#types').Activity} activity
 * @param {import('moddle-context-serializer').EventDefinition} eventDefinition
 */
export function SignalEventDefinition(activity, eventDefinition) {
  const { id, broker, environment, isStart, isThrowing } = activity;
  const { type, behaviour = {} } = eventDefinition;

  this.id = id;
  this.type = type;

  /** @type {import('#types').EventReference} */
  this.reference = {
    name: 'anonymous',
    ...behaviour.signalRef,
    referenceType: 'signal',
  };

  this.isThrowing = isThrowing;
  this.activity = activity;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());

  const referenceElement = (this[K_REFERENCE_ELEMENT] = this.reference.id && activity.getActivityById(this.reference.id));
  if (!isThrowing && isStart) {
    this[K_COMPLETED] = false;
    const referenceId = referenceElement ? referenceElement.id : 'anonymous';
    const messageQueueName = `${this.reference.referenceType}-${brokerSafeId(id)}-${brokerSafeId(referenceId)}-q`;
    this[K_MESSAGE_Q] = broker.assertQueue(messageQueueName, { autoDelete: false, durable: true });
    broker.bindQueue(messageQueueName, 'api', `*.${this.reference.referenceType}.#`, { durable: true });
  }
}

Object.defineProperty(SignalEventDefinition.prototype, 'executionId', {
  /** @returns {string} */
  get() {
    return this[K_EXECUTE_MESSAGE]?.content.executionId;
  },
});

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
SignalEventDefinition.prototype.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
SignalEventDefinition.prototype.executeCatch = function executeCatch(executeMessage) {
  this[K_EXECUTE_MESSAGE] = executeMessage;
  this[K_COMPLETED] = false;

  const executeContent = executeMessage.content;
  const { executionId, parent } = executeContent;
  const parentExecutionId = parent?.executionId;

  const info = (this[K_REFERENCE_INFO] = this._getReferenceInfo(executeMessage));
  const broker = this.broker;

  const onCatchMessage = this._onCatchMessage.bind(this);
  if (this.activity.isStart) {
    this[K_MESSAGE_Q].consume(onCatchMessage, {
      noAck: true,
      consumerTag: `_api-signal-${executionId}`,
    });
    if (this[K_COMPLETED]) return;
  }

  const onApiMessage = this._onApiMessage.bind(this);
  broker.subscribeTmp('api', `activity.#.${parentExecutionId}`, onApiMessage, {
    noAck: true,
    consumerTag: `_api-parent-${executionId}`,
  });
  broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
    noAck: true,
    consumerTag: `_api-${executionId}`,
  });
  broker.subscribeTmp('api', '#.signal.*', onCatchMessage, {
    noAck: true,
    consumerTag: `_api-delegated-${executionId}`,
  });

  this._debug(`expect ${info.description}`);

  const waitContent = cloneContent(executeContent, {
    executionId: parent.executionId,
    signal: { ...info.message },
  });
  waitContent.parent = shiftParent(parent);

  broker.publish('event', 'activity.wait', waitContent);
};

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
SignalEventDefinition.prototype.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const { executionId, parent } = executeContent;

  const info = this._getReferenceInfo(executeMessage);

  this.logger.debug(`<${executionId} (${this.activity.id})> throw ${info.description}`);

  const throwContent = cloneContent(executeContent, {
    executionId: parent.executionId,
    message: { ...executeContent.input, ...info.message },
    state: 'throw',
  });
  throwContent.parent = shiftParent(parent);

  const broker = this.broker;
  broker.publish('event', 'activity.signal', throwContent, { type: 'signal', delegate: true });

  return broker.publish('execution', 'execute.completed', cloneContent(executeContent));
};

SignalEventDefinition.prototype._onCatchMessage = function onCatchMessage(routingKey, message) {
  const info = this[K_REFERENCE_INFO];
  if (getPropertyValue(message, 'content.message.id') !== info.message.id) return;
  this[K_COMPLETED] = true;
  this._stop();

  const { type, correlationId } = message.properties;
  this.broker.publish(
    'event',
    'activity.consumed',
    cloneContent(this[K_EXECUTE_MESSAGE].content, {
      message: { ...message.content.message },
    }),
    {
      correlationId,
      type,
    }
  );

  return this._complete(message.content.message, message.properties);
};

SignalEventDefinition.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  const { type, correlationId } = message.properties;

  switch (type) {
    case 'signal': {
      return this._complete(message.content.message, { correlationId });
    }
    case 'discard': {
      this[K_COMPLETED] = true;
      this._stop();
      return this.broker.publish('execution', 'execute.discard', cloneContent(this[K_EXECUTE_MESSAGE].content), { correlationId });
    }
    case 'stop': {
      this._stop();
      break;
    }
  }
};

SignalEventDefinition.prototype._complete = function complete(output, options) {
  this[K_COMPLETED] = true;
  this._stop();
  this._debug(`signaled with ${this[K_REFERENCE_INFO].description}`);
  return this.broker.publish(
    'execution',
    'execute.completed',
    cloneContent(this[K_EXECUTE_MESSAGE].content, {
      output,
      state: 'signal',
    }),
    options
  );
};

SignalEventDefinition.prototype._stop = function stop() {
  const broker = this.broker,
    executionId = this.executionId;
  broker.cancel(`_api-signal-${executionId}`);
  broker.cancel(`_api-parent-${executionId}`);
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_api-delegated-${executionId}`);
  if (this.activity.isStart) this[K_MESSAGE_Q].purge();
};

SignalEventDefinition.prototype._getReferenceInfo = function getReferenceInfo(message) {
  const referenceElement = this[K_REFERENCE_ELEMENT];
  if (!referenceElement) {
    return {
      message: { ...this.reference },
      description: 'anonymous signal',
    };
  }

  const result = {
    message: referenceElement.resolve(message),
  };

  result.description = `${result.message.name} <${result.message.id}>`;

  return result;
};

SignalEventDefinition.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};
