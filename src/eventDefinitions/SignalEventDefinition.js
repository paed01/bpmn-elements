import getPropertyValue from '../getPropertyValue.js';
import { brokerSafeId } from '../shared.js';
import { cloneContent, shiftParent } from '../messageHelper.js';

const kCompleted = Symbol.for('completed');
const kMessageQ = Symbol.for('messageQ');
const kExecuteMessage = Symbol.for('executeMessage');
const kReferenceElement = Symbol.for('referenceElement');
const kReferenceInfo = Symbol.for('referenceInfo');

export default function SignalEventDefinition(activity, eventDefinition) {
  const { id, broker, environment, isStart, isThrowing } = activity;
  const { type, behaviour = {} } = eventDefinition;

  this.id = id;
  this.type = type;

  const reference = (this.reference = {
    name: 'anonymous',
    ...behaviour.signalRef,
    referenceType: 'signal',
  });

  this.isThrowing = isThrowing;
  this.activity = activity;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());

  const referenceElement = (this[kReferenceElement] = reference.id && activity.getActivityById(reference.id));
  if (!isThrowing && isStart) {
    this[kCompleted] = false;
    const referenceId = referenceElement ? referenceElement.id : 'anonymous';
    const messageQueueName = `${reference.referenceType}-${brokerSafeId(id)}-${brokerSafeId(referenceId)}-q`;
    this[kMessageQ] = broker.assertQueue(messageQueueName, { autoDelete: false, durable: true });
    broker.bindQueue(messageQueueName, 'api', `*.${reference.referenceType}.#`, { durable: true });
  }
}

Object.defineProperty(SignalEventDefinition.prototype, 'executionId', {
  get() {
    const message = this[kExecuteMessage];
    return message && message.content.executionId;
  },
});

SignalEventDefinition.prototype.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};

SignalEventDefinition.prototype.executeCatch = function executeCatch(executeMessage) {
  this[kExecuteMessage] = executeMessage;
  this[kCompleted] = false;

  const executeContent = executeMessage.content;
  const { executionId, parent } = executeContent;
  const parentExecutionId = parent && parent.executionId;

  const info = (this[kReferenceInfo] = this._getReferenceInfo(executeMessage));
  const broker = this.broker;

  const onCatchMessage = this._onCatchMessage.bind(this);
  if (this.activity.isStart) {
    this[kMessageQ].consume(onCatchMessage, {
      noAck: true,
      consumerTag: `_api-signal-${executionId}`,
    });
    if (this[kCompleted]) return;
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
  broker.publish('event', 'activity.signal', throwContent, { type: 'signal' });

  return broker.publish('execution', 'execute.completed', cloneContent(executeContent));
};

SignalEventDefinition.prototype._onCatchMessage = function onCatchMessage(routingKey, message) {
  const info = this[kReferenceInfo];
  if (getPropertyValue(message, 'content.message.id') !== info.message.id) return;
  this[kCompleted] = true;
  this._stop();

  const { type, correlationId } = message.properties;
  this.broker.publish(
    'event',
    'activity.consumed',
    cloneContent(this[kExecuteMessage].content, {
      message: { ...message.content.message },
    }),
    {
      correlationId,
      type,
    },
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
      this[kCompleted] = true;
      this._stop();
      return this.broker.publish('execution', 'execute.discard', cloneContent(this[kExecuteMessage].content), { correlationId });
    }
    case 'stop': {
      this._stop();
      break;
    }
  }
};

SignalEventDefinition.prototype._complete = function complete(output, options) {
  this[kCompleted] = true;
  this._stop();
  this._debug(`signaled with ${this[kReferenceInfo].description}`);
  return this.broker.publish(
    'execution',
    'execute.completed',
    cloneContent(this[kExecuteMessage].content, {
      output,
      state: 'signal',
    }),
    options,
  );
};

SignalEventDefinition.prototype._stop = function stop() {
  const broker = this.broker,
    executionId = this.executionId;
  broker.cancel(`_api-signal-${executionId}`);
  broker.cancel(`_api-parent-${executionId}`);
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_api-delegated-${executionId}`);
  if (this.activity.isStart) this[kMessageQ].purge();
};

SignalEventDefinition.prototype._getReferenceInfo = function getReferenceInfo(message) {
  const referenceElement = this[kReferenceElement];
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
