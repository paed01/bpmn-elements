"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = MessageEventDefinition;
var _getPropertyValue = _interopRequireDefault(require("../getPropertyValue.js"));
var _shared = require("../shared.js");
var _messageHelper = require("../messageHelper.js");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const kCompleted = Symbol.for('completed');
const kMessageQ = Symbol.for('messageQ');
const kExecuteMessage = Symbol.for('executeMessage');
const kReferenceElement = Symbol.for('referenceElement');
const kReferenceInfo = Symbol.for('referenceInfo');
function MessageEventDefinition(activity, eventDefinition) {
  const {
    id,
    broker,
    environment,
    isThrowing
  } = activity;
  const {
    type = 'MessageEventDefinition',
    behaviour = {}
  } = eventDefinition;
  this.id = id;
  this.type = type;
  const reference = this.reference = {
    name: 'anonymous',
    ...behaviour.messageRef,
    referenceType: 'message'
  };
  this.isThrowing = isThrowing;
  this.activity = activity;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());
  const referenceElement = this[kReferenceElement] = reference.id && activity.getActivityById(reference.id);
  if (!isThrowing) {
    this[kCompleted] = false;
    const referenceId = referenceElement ? referenceElement.id : 'anonymous';
    const messageQueueName = `${reference.referenceType}-${(0, _shared.brokerSafeId)(id)}-${(0, _shared.brokerSafeId)(referenceId)}-q`;
    this[kMessageQ] = broker.assertQueue(messageQueueName, {
      autoDelete: false,
      durable: true
    });
    broker.bindQueue(messageQueueName, 'api', `*.${reference.referenceType}.#`, {
      durable: true
    });
  }
}
Object.defineProperty(MessageEventDefinition.prototype, 'executionId', {
  get() {
    return this[kExecuteMessage]?.content.executionId;
  }
});
MessageEventDefinition.prototype.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};
MessageEventDefinition.prototype.executeCatch = function executeCatch(executeMessage) {
  this[kExecuteMessage] = executeMessage;
  this[kCompleted] = false;
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  const parentExecutionId = parent?.executionId;
  const info = this[kReferenceInfo] = this._getReferenceInfo(executeMessage);
  this._debug(`expect ${info.description}`);
  const broker = this.broker;
  const onCatchMessage = this._onCatchMessage.bind(this);
  this[kMessageQ].consume(onCatchMessage, {
    noAck: true,
    consumerTag: `_api-message-${executionId}`
  });
  if (this[kCompleted]) return;
  const onApiMessage = this._onApiMessage.bind(this);
  broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
    noAck: true,
    consumerTag: `_api-${executionId}`,
    priority: 400
  });
  broker.subscribeTmp('api', `activity.#.${parentExecutionId}`, onApiMessage, {
    noAck: true,
    consumerTag: `_api-parent-${executionId}`,
    priority: 400
  });
  broker.subscribeTmp('api', '#.signal.*', onCatchMessage, {
    noAck: true,
    consumerTag: `_api-delegated-${executionId}`
  });
  const waitContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parentExecutionId,
    message: {
      ...info.message
    }
  });
  waitContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.wait', waitContent);
};
MessageEventDefinition.prototype.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  const info = this._getReferenceInfo(executeMessage);
  this.logger.debug(`<${executionId} (${this.activity.id})> message ${info.description}`);
  const broker = this.broker;
  const throwContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parent.executionId,
    message: {
      ...executeContent.input,
      ...info.message
    },
    state: 'throw'
  });
  throwContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.message', throwContent, {
    type: 'message',
    delegate: true
  });
  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent));
};
MessageEventDefinition.prototype._onCatchMessage = function onCatchMessage(routingKey, message) {
  if ((0, _getPropertyValue.default)(message, 'content.message.id') !== this[kReferenceInfo].message.id) return;
  const {
    type,
    correlationId
  } = message.properties;
  this.broker.publish('event', 'activity.consumed', (0, _messageHelper.cloneContent)(this[kExecuteMessage].content, {
    message: {
      ...message.content.message
    }
  }), {
    correlationId,
    type
  });
  this._complete('caught', message.content.message, {
    correlationId
  });
};
MessageEventDefinition.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  const {
    type,
    correlationId
  } = message.properties;
  switch (type) {
    case 'message':
    case 'signal':
      {
        return this._complete('got signal with', message.content.message, {
          correlationId
        });
      }
    case 'discard':
      {
        this[kCompleted] = true;
        this._stop();
        return this.broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(this[kExecuteMessage].content), {
          correlationId
        });
      }
    case 'stop':
      {
        return this._stop();
      }
  }
};
MessageEventDefinition.prototype._complete = function complete(verb, output, options) {
  this[kCompleted] = true;
  this._stop();
  this._debug(`${verb} ${this[kReferenceInfo].description}`);
  const broker = this.broker;
  const executeContent = this[kExecuteMessage].content;
  const catchContent = (0, _messageHelper.cloneContent)(executeContent, {
    message: {
      ...output
    },
    executionId: executeContent.parent.executionId
  });
  catchContent.parent = (0, _messageHelper.shiftParent)(executeContent.parent);
  broker.publish('event', 'activity.catch', catchContent, {
    type: 'catch'
  });
  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
    output,
    state: 'catch'
  }), options);
};
MessageEventDefinition.prototype._stop = function stop() {
  const broker = this.broker,
    executionId = this.executionId;
  broker.cancel(`_api-message-${executionId}`);
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_api-parent-${executionId}`);
  broker.cancel(`_api-delegated-${executionId}`);
  this[kMessageQ].purge();
};
MessageEventDefinition.prototype._getReferenceInfo = function getReferenceInfo(message) {
  const referenceElement = this[kReferenceElement];
  if (!referenceElement) {
    return {
      message: {
        ...this.reference
      },
      description: 'anonymous message'
    };
  }
  const result = {
    message: referenceElement.resolve(message)
  };
  result.description = `${result.message.name} <${result.message.id}>`;
  return result;
};
MessageEventDefinition.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};