import { brokerSafeId } from '../shared.js';
import { cloneContent, cloneMessage, shiftParent } from '../messageHelper.js';
import { K_COMPLETED, K_EXECUTE_MESSAGE, K_MESSAGE_Q } from '../constants.js';

const K_COMPENSATE_Q = Symbol.for('compensateQ');
const K_ASSOCIATIONS = Symbol.for('associations');

export function CompensateEventDefinition(activity, eventDefinition, context) {
  const { id, broker, environment, isThrowing } = activity;

  this.id = id;
  const type = (this.type = eventDefinition.type);
  const reference = (this.reference = { referenceType: 'compensate' });
  this.isThrowing = isThrowing;
  this.activity = activity;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());

  if (!isThrowing) {
    this[K_COMPLETED] = false;
    this[K_ASSOCIATIONS] = context.getOutboundAssociations(id);
    const messageQueueName = `${reference.referenceType}-${brokerSafeId(id)}-q`;
    this[K_MESSAGE_Q] = broker.assertQueue(messageQueueName, { autoDelete: false, durable: true });
    this[K_COMPENSATE_Q] = broker.assertQueue('compensate-q', { autoDelete: false, durable: true });
    broker.bindQueue(messageQueueName, 'api', `*.${reference.referenceType}.#`, { durable: true, priority: 400 });
  }
}

Object.defineProperty(CompensateEventDefinition.prototype, 'executionId', {
  get() {
    return this[K_EXECUTE_MESSAGE]?.content.executionId;
  },
});

CompensateEventDefinition.prototype.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};

CompensateEventDefinition.prototype.executeCatch = function executeCatch(executeMessage) {
  this[K_EXECUTE_MESSAGE] = executeMessage;
  this[K_COMPLETED] = false;
  if (executeMessage.fields.routingKey === 'execute.compensating') {
    this._debug('resumed at compensating');
    this[K_COMPLETED] = true;
    return this._compensate();
  }

  const executeContent = executeMessage.content;
  const { executionId, parent } = executeContent;

  this._debug('expect compensate');

  const broker = this.broker;
  broker.cancel('_convey-messages');
  broker.assertExchange('compensate', 'topic');
  broker.subscribeTmp('compensate', 'execute.#', this._onCollect.bind(this), {
    noAck: true,
    consumerTag: '_oncollect-messages',
  });

  this[K_MESSAGE_Q].consume(this._onCompensateApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_oncompensate-${executionId}`,
  });

  if (this[K_COMPLETED]) return;

  broker.subscribeTmp('api', `activity.#.${parent.executionId}#`, this._onApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-${executionId}`,
  });

  broker.publish(
    'execution',
    'execute.detach',
    cloneContent(executeContent, {
      sourceExchange: 'execution',
      bindExchange: 'compensate',
      expect: 'compensate',
    })
  );
};

CompensateEventDefinition.prototype.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const { parent } = executeContent;
  const parentExecutionId = parent?.executionId;

  this.logger.debug(`<${parentExecutionId} (${this.id})> throw compensate`);

  const broker = this.broker;
  const throwContent = cloneContent(executeContent, {
    executionId: parentExecutionId,
    state: 'throw',
  });
  throwContent.parent = shiftParent(parent);
  broker.publish('event', 'activity.compensate', throwContent, { type: 'compensate', delegate: true });

  return broker.publish('execution', 'execute.completed', cloneContent(executeContent));
};

CompensateEventDefinition.prototype._onCollect = function onCollect(routingKey, message) {
  switch (routingKey) {
    case 'execute.error':
    case 'execute.completed': {
      return this[K_COMPENSATE_Q].queueMessage(message.fields, cloneContent(message.content), message.properties);
    }
  }
};

CompensateEventDefinition.prototype._onCompensateApiMessage = function onCompensateApiMessage(routingKey, message) {
  this[K_COMPLETED] = true;
  const output = message.content.message;
  const broker = this.broker;
  const executeContent = this[K_EXECUTE_MESSAGE].content;

  this._stopCollect();

  this._debug('caught compensate event');

  const catchContent = cloneContent(executeContent, {
    message: { ...output },
    executionId: executeContent.parent.executionId,
  });
  catchContent.parent = shiftParent(catchContent.parent);

  this[K_COMPENSATE_Q].queueMessage({ routingKey: 'execute.compensated' }, cloneContent(executeContent));

  broker.publish('execution', 'execute.compensating', cloneContent(executeContent, { message: { ...output } }));
  broker.publish('event', 'activity.catch', catchContent, { type: 'catch' });

  return this._compensate();
};

CompensateEventDefinition.prototype._compensate = function compensate() {
  return this[K_COMPENSATE_Q].consume(this._onCollected.bind(this), { noAck: true, consumerTag: '_convey-messages' });
};

CompensateEventDefinition.prototype._onCollected = function onCollected(routingKey, message) {
  if (routingKey === 'execute.compensated') {
    const broker = this.broker;
    broker.cancel('_convey-messages');
    return this.broker.publish('execution', 'execute.completed', cloneContent(message.content, { cancelActivity: false }));
  }
  for (const association of this[K_ASSOCIATIONS]) association.take(cloneMessage(message));
};

CompensateEventDefinition.prototype._onDiscardApiMessage = function onDiscardApiMessage(routingKey, message) {
  this[K_COMPLETED] = true;
  this._stop();
  this[K_COMPENSATE_Q].purge();
  for (const association of this[K_ASSOCIATIONS]) association.discard(cloneMessage(message));
  return this.broker.publish('execution', 'execute.discard', cloneContent(this[K_EXECUTE_MESSAGE].content));
};

CompensateEventDefinition.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;
  switch (messageType) {
    case 'compensate': {
      return this._onCompensateApiMessage(routingKey, message);
    }
    case 'discard': {
      return this._onDiscardApiMessage(routingKey, message);
    }
    case 'stop': {
      return this._stop();
    }
  }
};

CompensateEventDefinition.prototype._stopCollect = function stopCollect() {
  const broker = this.broker,
    executionId = this.executionId;
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_oncompensate-${executionId}`);
  broker.cancel('_oncollect-messages');
  this[K_MESSAGE_Q].purge();
};

CompensateEventDefinition.prototype._stop = function stop() {
  this._stopCollect();
  this.broker.cancel('_convey-messages');
};

CompensateEventDefinition.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};
