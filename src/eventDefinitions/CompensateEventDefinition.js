import {brokerSafeId} from '../shared';
import {cloneContent, cloneMessage, shiftParent} from '../messageHelper';

const completedSymbol = Symbol.for('completed');
const executeMessageSymbol = Symbol.for('executeMessage');
const messageQSymbol = Symbol.for('messageQ');
const compensateQSymbol = Symbol.for('compensateQ');
const associationsSymbol = Symbol.for('associations');

export default function CompensateEventDefinition(activity, eventDefinition, context) {
  const {id, broker, environment, isThrowing} = activity;

  this.id = id;
  const type = this.type = eventDefinition.type;
  const reference = this.reference = {referenceType: 'compensate'};
  this.isThrowing = isThrowing;
  this.activity = activity;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());

  if (!isThrowing) {
    this[completedSymbol] = false;
    this[associationsSymbol] = context.getOutboundAssociations(id) || [];
    const messageQueueName = `${reference.referenceType}-${brokerSafeId(id)}-q`;
    this[messageQSymbol] = broker.assertQueue(messageQueueName, {autoDelete: false, durable: true});
    broker.bindQueue(messageQueueName, 'api', `*.${reference.referenceType}.#`, {durable: true, priority: 400});
  }
}

const proto = CompensateEventDefinition.prototype;

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

  this._debug('expect compensate');

  const broker = this.broker;
  broker.assertExchange('compensate', 'topic');
  this[compensateQSymbol] = broker.assertQueue('compensate-q', {durable: true, autoDelete: false});
  broker.subscribeTmp('compensate', 'execute.#', this._onCollect.bind(this), {
    noAck: true,
    consumerTag: '_oncollect-messages',
  });

  broker.publish('execution', 'execute.detach', cloneContent(executeContent, {
    sourceExchange: 'execution',
    bindExchange: 'compensate',
  }));

  this[messageQSymbol].consume(this._onCompensateApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_oncompensate-${executionId}`,
  });

  if (this[completedSymbol]) return;

  const onApiMessage = this._onApiMessage.bind(this);
  broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
    noAck: true,
    consumerTag: `_api-${executionId}`,
  });

  const detachContent = cloneContent(executeContent, {
    executionId: parent.executionId,
    bindExchange: 'compensate',
  });
  detachContent.parent = shiftParent(parent);

  broker.publish('event', 'activity.detach', detachContent);
};

proto.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const {executionId, parent} = executeContent;
  const parentExecutionId = parent && parent.executionId;

  this.logger.debug(`<${executionId} (${this.activity.id})> throw compensate`);

  const broker = this.broker;
  const throwContent = cloneContent(executeContent, {
    executionId: parentExecutionId,
    state: 'throw',
  });
  throwContent.parent = shiftParent(parent);
  broker.publish('event', 'activity.compensate', throwContent, {type: 'compensate', delegate: true});

  return broker.publish('execution', 'execute.completed', cloneContent(executeContent));
};

proto._onCollect = function onCollect(routingKey, message) {
  switch (routingKey) {
    case 'execute.error':
    case 'execute.completed': {
      return this[compensateQSymbol].queueMessage(message.fields, cloneContent(message.content), message.properties);
    }
  }
};

proto._onCompensateApiMessage = function onCompensateApiMessage(routingKey, message) {
  const output = message.content.message;
  this[completedSymbol] = true;

  this._stop();

  this._debug('caught compensate event');
  const broker = this.broker;
  const executeContent = this[executeMessageSymbol].content;
  const catchContent = cloneContent(executeContent, {
    message: {...output},
    executionId: executeContent.parent.executionId,
  });
  catchContent.parent = shiftParent(catchContent.parent);

  broker.publish('event', 'activity.catch', catchContent, {type: 'catch'});

  const compensateQ = this[compensateQSymbol];
  compensateQ.on('depleted', onDepleted);
  compensateQ.consume(this._onCollected.bind(this), {noAck: true, consumerTag: '_convey-messages'});

  for (const association of this[associationsSymbol]) association.complete(cloneMessage(message));

  function onDepleted() {
    compensateQ.off('depleted', onDepleted);
    return broker.publish('execution', 'execute.completed', cloneContent(executeContent, {output, state: 'catch'}));
  }
};

proto._onCollected = function onCollected(routingKey, message) {
  for (const association of this[associationsSymbol]) association.take(cloneMessage(message));
};

proto._onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;

  switch (messageType) {
    case 'compensate': {
      return this._onCompensateApiMessage(routingKey, message);
    }
    case 'discard': {
      this[completedSymbol] = true;
      this._stop();
      for (const association of this[associationsSymbol]) association.discard(cloneMessage(message));
      return this.broker.publish('execution', 'execute.discard', cloneContent(this[executeMessageSymbol].content));
    }
    case 'stop': {
      this._stop();
      break;
    }
  }
};

proto._stop = function stop() {
  const broker = this.broker, executionId = this.executionId;
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_oncompensate-${executionId}`);
  broker.cancel('_oncollect-messages');
  broker.cancel('_convey-messages');
  this[messageQSymbol].purge();
};

proto._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};
