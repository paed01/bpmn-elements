"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = CompensateEventDefinition;
var _shared = require("../shared");
var _messageHelper = require("../messageHelper");
const kCompleted = Symbol.for('completed');
const kExecuteMessage = Symbol.for('executeMessage');
const kMessageQ = Symbol.for('messageQ');
const kCompensateQ = Symbol.for('compensateQ');
const kAssociations = Symbol.for('associations');
function CompensateEventDefinition(activity, eventDefinition, context) {
  const {
    id,
    broker,
    environment,
    isThrowing
  } = activity;
  this.id = id;
  const type = this.type = eventDefinition.type;
  const reference = this.reference = {
    referenceType: 'compensate'
  };
  this.isThrowing = isThrowing;
  this.activity = activity;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());
  if (!isThrowing) {
    this[kCompleted] = false;
    this[kAssociations] = context.getOutboundAssociations(id) || [];
    const messageQueueName = `${reference.referenceType}-${(0, _shared.brokerSafeId)(id)}-q`;
    this[kMessageQ] = broker.assertQueue(messageQueueName, {
      autoDelete: false,
      durable: true
    });
    broker.bindQueue(messageQueueName, 'api', `*.${reference.referenceType}.#`, {
      durable: true,
      priority: 400
    });
  }
}
const proto = CompensateEventDefinition.prototype;
Object.defineProperty(proto, 'executionId', {
  get() {
    const message = this[kExecuteMessage];
    return message && message.content.executionId;
  }
});
proto.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};
proto.executeCatch = function executeCatch(executeMessage) {
  this[kExecuteMessage] = executeMessage;
  this[kCompleted] = false;
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  this._debug('expect compensate');
  const broker = this.broker;
  broker.assertExchange('compensate', 'topic');
  this[kCompensateQ] = broker.assertQueue('compensate-q', {
    durable: true,
    autoDelete: false
  });
  broker.subscribeTmp('compensate', 'execute.#', this._onCollect.bind(this), {
    noAck: true,
    consumerTag: '_oncollect-messages'
  });
  broker.publish('execution', 'execute.detach', (0, _messageHelper.cloneContent)(executeContent, {
    sourceExchange: 'execution',
    bindExchange: 'compensate'
  }));
  this[kMessageQ].consume(this._onCompensateApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_oncompensate-${executionId}`
  });
  if (this[kCompleted]) return;
  const onApiMessage = this._onApiMessage.bind(this);
  broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
    noAck: true,
    consumerTag: `_api-${executionId}`
  });
  const detachContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parent.executionId,
    bindExchange: 'compensate'
  });
  detachContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.detach', detachContent);
};
proto.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  const parentExecutionId = parent && parent.executionId;
  this.logger.debug(`<${executionId} (${this.activity.id})> throw compensate`);
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
  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent));
};
proto._onCollect = function onCollect(routingKey, message) {
  switch (routingKey) {
    case 'execute.error':
    case 'execute.completed':
      {
        return this[kCompensateQ].queueMessage(message.fields, (0, _messageHelper.cloneContent)(message.content), message.properties);
      }
  }
};
proto._onCompensateApiMessage = function onCompensateApiMessage(routingKey, message) {
  const output = message.content.message;
  this[kCompleted] = true;
  this._stop();
  this._debug('caught compensate event');
  const broker = this.broker;
  const executeContent = this[kExecuteMessage].content;
  const catchContent = (0, _messageHelper.cloneContent)(executeContent, {
    message: {
      ...output
    },
    executionId: executeContent.parent.executionId
  });
  catchContent.parent = (0, _messageHelper.shiftParent)(catchContent.parent);
  broker.publish('event', 'activity.catch', catchContent, {
    type: 'catch'
  });
  const compensateQ = this[kCompensateQ];
  compensateQ.on('depleted', onDepleted);
  compensateQ.consume(this._onCollected.bind(this), {
    noAck: true,
    consumerTag: '_convey-messages'
  });
  for (const association of this[kAssociations]) association.complete((0, _messageHelper.cloneMessage)(message));
  function onDepleted() {
    compensateQ.off('depleted', onDepleted);
    return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
      output,
      state: 'catch'
    }));
  }
};
proto._onCollected = function onCollected(routingKey, message) {
  for (const association of this[kAssociations]) association.take((0, _messageHelper.cloneMessage)(message));
};
proto._onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;
  switch (messageType) {
    case 'compensate':
      {
        return this._onCompensateApiMessage(routingKey, message);
      }
    case 'discard':
      {
        this[kCompleted] = true;
        this._stop();
        for (const association of this[kAssociations]) association.discard((0, _messageHelper.cloneMessage)(message));
        return this.broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(this[kExecuteMessage].content));
      }
    case 'stop':
      {
        this._stop();
        break;
      }
  }
};
proto._stop = function stop() {
  const broker = this.broker,
    executionId = this.executionId;
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_oncompensate-${executionId}`);
  broker.cancel('_oncollect-messages');
  broker.cancel('_convey-messages');
  this[kMessageQ].purge();
};
proto._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};