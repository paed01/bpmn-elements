import getPropertyValue from '../getPropertyValue';
import {brokerSafeId} from '../shared';
import {cloneContent, shiftParent} from '../messageHelper';

const completedSymbol = Symbol.for('completed');
const messageQSymbol = Symbol.for('messageQ');
const executeMessageSymbol = Symbol.for('executeMessage');
const referenceElementSymbol = Symbol.for('referenceElement');
const referenceInfoSymbol = Symbol.for('referenceInfo');

export default function SignalEventDefinition(activity, eventDefinition) {
  const {id, broker, environment, isStart, isThrowing} = activity;
  const {type, behaviour = {}} = eventDefinition;

  this.id = id;
  this.type = type;

  const reference = this.reference = {
    name: 'anonymous',
    ...behaviour.signalRef,
    referenceType: 'signal',
  };

  this.isThrowing = isThrowing;
  this.activity = activity;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());

  const referenceElement = this[referenceElementSymbol] = reference.id && activity.getActivityById(reference.id);
  if (!isThrowing && isStart) {
    this[completedSymbol] = false;
    const referenceId = referenceElement ? referenceElement.id : 'anonymous';
    const messageQueueName = `${reference.referenceType}-${brokerSafeId(id)}-${brokerSafeId(referenceId)}-q`;
    this[messageQSymbol] = broker.assertQueue(messageQueueName, {autoDelete: false, durable: true});
    broker.bindQueue(messageQueueName, 'api', `*.${reference.referenceType}.#`, {durable: true});
  }
}

const proto = SignalEventDefinition.prototype;

Object.defineProperty(proto, 'executionId', {
  get() {
    const message = this[executeMessageSymbol];
    return message && message.content.executionId;
  },
});

proto.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};

proto.executeCatch = function executeCatch(executeMessage) {
  this[executeMessageSymbol] = executeMessage;
  this[completedSymbol] = false;

  const executeContent = executeMessage.content;
  const {executionId, parent} = executeContent;
  const parentExecutionId = parent && parent.executionId;

  const info = this[referenceInfoSymbol] = this._getReferenceInfo(executeMessage);
  const broker = this.broker;

  const onCatchMessage = this._onCatchMessage.bind(this);
  if (this.activity.isStart) {
    this[messageQSymbol].consume(onCatchMessage, {
      noAck: true,
      consumerTag: `_api-signal-${executionId}`,
    });
    if (this[completedSymbol]) return;
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
    signal: {...info.message},
  });
  waitContent.parent = shiftParent(parent);

  broker.publish('event', 'activity.wait', waitContent);
};

proto.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const {executionId, parent} = executeContent;

  const info = this._getReferenceInfo(executeMessage);

  this.logger.debug(`<${executionId} (${this.activity.id})> throw ${info.description}`);

  const throwContent = cloneContent(executeContent, {
    executionId: parent.executionId,
    message: {...executeContent.input, ...info.message},
    state: 'throw',
  });
  throwContent.parent = shiftParent(parent);

  const broker = this.broker;
  broker.publish('event', 'activity.signal', throwContent, {type: 'signal'});

  return broker.publish('execution', 'execute.completed', cloneContent(executeContent));
};

proto._onCatchMessage = function onCatchMessage(routingKey, message) {
  const info = this[referenceInfoSymbol];
  if (getPropertyValue(message, 'content.message.id') !== info.message.id) return;
  this[completedSymbol] = true;
  this._stop();

  const {type, correlationId} = message.properties;
  this.broker.publish('event', 'activity.consumed', cloneContent(this[executeMessageSymbol].content, {
    message: { ...message.content.message},
  }), {
    correlationId,
    type,
  });

  return this._complete(message.content.message, message.properties);
};

proto._onApiMessage = function onApiMessage(routingKey, message) {
  const {type, correlationId} = message.properties;

  switch (type) {
    case 'signal': {
      return this._complete(message.content.message, {correlationId});
    }
    case 'discard': {
      this[completedSymbol] = true;
      this._stop();
      return this.broker.publish('execution', 'execute.discard', cloneContent(this[executeMessageSymbol].content), {correlationId});
    }
    case 'stop': {
      this._stop();
      break;
    }
  }
};

proto._complete = function complete(output, options) {
  this[completedSymbol] = true;
  this._stop();
  this._debug(`signaled with ${this[referenceInfoSymbol].description}`);
  return this.broker.publish('execution', 'execute.completed', cloneContent(this[executeMessageSymbol].content, {
    output,
    state: 'signal',
  }), options);
};

proto._stop = function stop() {
  const broker = this.broker, executionId = this.executionId;
  broker.cancel(`_api-signal-${executionId}`);
  broker.cancel(`_api-parent-${executionId}`);
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_api-delegated-${executionId}`);
  if (this.activity.isStart) this[messageQSymbol].purge();
};

proto._getReferenceInfo = function getReferenceInfo(message) {
  const referenceElement = this[referenceElementSymbol];
  if (!referenceElement) {
    return {
      message: {...this.reference},
      description: 'anonymous signal',
    };
  }

  const result = {
    message: referenceElement.resolve(message),
  };

  result.description = `${result.message.name} <${result.message.id}>`;

  return result;
};

proto._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};
