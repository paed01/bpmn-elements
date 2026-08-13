"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CompensateEventDefinition = CompensateEventDefinition;
var _shared = require("../shared.js");
var _messageHelper = require("../messageHelper.js");
var _constants = require("../constants.js");
const K_COMPENSATE_Q = Symbol.for('compensateQ');
const K_ASSOCIATIONS = Symbol.for('associations');

/**
 * Compensate event definition
 * @param {import('#types').Activity} activity
 * @param {import('#types').SerializableElement} eventDefinition
 * @param {import('#types').ContextInstance} context
 */
function CompensateEventDefinition(activity, eventDefinition, context) {
  const {
    id,
    broker,
    environment,
    isThrowing
  } = activity;
  this.id = id;
  const type = this.type = eventDefinition.type;
  const referenceType = 'compensate';
  /** @type {import('#types').EventReference} */
  this.reference = {
    referenceType
  };
  this.isThrowing = isThrowing;
  this.activity = activity;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());

  /** @internal */
  this[_constants.K_COMPLETED] = false;
  /** @internal */
  this[_constants.K_EXECUTE_MESSAGE] = undefined;
  if (!isThrowing) {
    /** @internal */
    this[K_ASSOCIATIONS] = context.getOutboundAssociations(id);
    const messageQueueName = `${referenceType}-${(0, _shared.brokerSafeId)(id)}-q`;
    /** @internal */
    this[_constants.K_MESSAGE_Q] = broker.assertQueue(messageQueueName, {
      autoDelete: false,
      durable: true
    });
    /** @internal */
    this[K_COMPENSATE_Q] = broker.assertQueue('compensate-q', {
      autoDelete: false,
      durable: true
    });
    broker.bindQueue(messageQueueName, 'api', `*.${referenceType}.#`, {
      durable: true,
      priority: 400
    });
  }
}
Object.defineProperty(CompensateEventDefinition.prototype, 'executionId', {
  /** @returns {string} */
  get() {
    return this[_constants.K_EXECUTE_MESSAGE]?.content.executionId;
  }
});

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
CompensateEventDefinition.prototype.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
CompensateEventDefinition.prototype.executeCatch = function executeCatch(executeMessage) {
  this[_constants.K_EXECUTE_MESSAGE] = executeMessage;
  this[_constants.K_COMPLETED] = false;
  if (executeMessage.fields.routingKey === 'execute.compensating') {
    this._debug('resumed at compensating');
    this[_constants.K_COMPLETED] = true;
    // @ts-ignore
    return this._compensate();
  }
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  this._debug('expect compensate');
  const broker = this.broker;
  broker.cancel('_convey-messages');
  broker.assertExchange('compensate', 'topic');
  broker.subscribeTmp('compensate', 'execute.#', this._onCollect.bind(this), {
    noAck: true,
    consumerTag: '_oncollect-messages'
  });
  this[_constants.K_MESSAGE_Q].consume(this._onCompensateApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_oncompensate-${executionId}`
  });
  if (this[_constants.K_COMPLETED]) return;
  broker.subscribeTmp('api', `activity.#.${parent.executionId}#`, this._onApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-${executionId}`
  });
  broker.publish('execution', 'execute.detach', (0, _messageHelper.cloneContent)(executeContent, {
    sourceExchange: 'execution',
    bindExchange: 'compensate',
    expect: 'compensate'
  }));
};

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
CompensateEventDefinition.prototype.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const {
    parent
  } = executeContent;
  const parentExecutionId = parent?.executionId;
  this.logger.debug(`<${parentExecutionId} (${this.id})> throw compensate`);
  const broker = this.broker;
  const throwContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parentExecutionId,
    state: 'throw'
  });
  throwContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.compensate', throwContent, {
    type: 'compensate',
    delegate: true
  });
  broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent));
};
CompensateEventDefinition.prototype._onCollect = function onCollect(routingKey, message) {
  switch (routingKey) {
    case 'execute.error':
    case 'execute.completed':
      {
        return this[K_COMPENSATE_Q].queueMessage(message.fields, (0, _messageHelper.cloneContent)(message.content), message.properties);
      }
  }
};
CompensateEventDefinition.prototype._onCompensateApiMessage = function onCompensateApiMessage(_routingKey, message) {
  this[_constants.K_COMPLETED] = true;
  const output = message.content.message;
  const broker = this.broker;
  const executeContent = this[_constants.K_EXECUTE_MESSAGE].content;
  this._stopCollect();
  this._debug('caught compensate event');
  const catchContent = (0, _messageHelper.cloneContent)(executeContent, {
    message: {
      ...output
    },
    executionId: executeContent.parent.executionId
  });
  catchContent.parent = (0, _messageHelper.shiftParent)(catchContent.parent);
  this[K_COMPENSATE_Q].queueMessage({
    routingKey: 'execute.compensated'
  }, (0, _messageHelper.cloneContent)(executeContent));
  broker.publish('execution', 'execute.compensating', (0, _messageHelper.cloneContent)(executeContent, {
    message: {
      ...output
    }
  }));
  broker.publish('event', 'activity.catch', catchContent, {
    type: 'catch'
  });
  return this._compensate();
};
CompensateEventDefinition.prototype._compensate = function compensate() {
  return this[K_COMPENSATE_Q].consume(this._onCollected.bind(this), {
    noAck: true,
    consumerTag: '_convey-messages'
  });
};
CompensateEventDefinition.prototype._onCollected = function onCollected(routingKey, message) {
  if (routingKey === 'execute.compensated') {
    const broker = this.broker;
    broker.cancel('_convey-messages');
    return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(message.content, {
      cancelActivity: false
    }));
  }
  for (const association of this[K_ASSOCIATIONS]) association.take((0, _messageHelper.cloneMessage)(message));
};
CompensateEventDefinition.prototype._onDiscardApiMessage = function onDiscardApiMessage(_routingKey, message) {
  this[_constants.K_COMPLETED] = true;
  this._stop();
  this[K_COMPENSATE_Q].purge();
  for (const association of this[K_ASSOCIATIONS]) association.discard((0, _messageHelper.cloneMessage)(message));
  return this.broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(this[_constants.K_EXECUTE_MESSAGE].content));
};
CompensateEventDefinition.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;
  switch (messageType) {
    case 'compensate':
      {
        return this._onCompensateApiMessage(routingKey, message);
      }
    case 'discard':
      {
        return this._onDiscardApiMessage(routingKey, message);
      }
    case 'stop':
      {
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
  this[_constants.K_MESSAGE_Q].purge();
};
CompensateEventDefinition.prototype._stop = function stop() {
  this._stopCollect();
  this.broker.cancel('_convey-messages');
};
CompensateEventDefinition.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};