"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ErrorEventDefinition;
var _shared = require("../shared.js");
var _messageHelper = require("../messageHelper.js");
const kCompleted = Symbol.for('completed');
const kMessageQ = Symbol.for('messageQ');
const kExecuteMessage = Symbol.for('executeMessage');
const kReferenceElement = Symbol.for('referenceElement');
const kReferenceInfo = Symbol.for('referenceInfo');
function ErrorEventDefinition(activity, eventDefinition) {
  const {
    id,
    broker,
    environment,
    isThrowing
  } = activity;
  const {
    type = 'ErrorEventDefinition',
    behaviour = {}
  } = eventDefinition;
  this.id = id;
  this.type = type;
  const reference = this.reference = {
    name: 'anonymous',
    ...behaviour.errorRef,
    referenceType: 'throw'
  };
  this.isThrowing = isThrowing;
  this.activity = activity;
  this.environment = environment;
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
      durable: true,
      priority: 300
    });
  }
}
Object.defineProperty(ErrorEventDefinition.prototype, 'executionId', {
  get() {
    const message = this[kExecuteMessage];
    return message && message.content.executionId;
  }
});
ErrorEventDefinition.prototype.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};
ErrorEventDefinition.prototype.executeCatch = function executeCatch(executeMessage) {
  this[kExecuteMessage] = executeMessage;
  this[kCompleted] = false;
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  const parentExecutionId = parent && parent.executionId;
  const info = this[kReferenceInfo] = this._getReferenceInfo(executeMessage);
  this[kMessageQ].consume(this._onThrowApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_onthrow-${executionId}`
  });
  if (this[kCompleted]) return;
  this._debug(`expect ${info.description}`);
  const broker = this.broker;
  broker.subscribeTmp('api', `activity.#.${executionId}`, this._onApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-${executionId}`
  });
  if (!this.environment.settings.strict) {
    const expectRoutingKey = `execute.throw.${executionId}`;
    broker.subscribeTmp('execution', expectRoutingKey, this._onErrorMessage.bind(this), {
      noAck: true,
      consumerTag: `_onerror-${executionId}`
    });
    broker.publish('execution', 'execute.expect', (0, _messageHelper.cloneContent)(executeContent, {
      expectRoutingKey,
      expect: {
        ...info.message
      }
    }));
    if (this[kCompleted]) return this._stop();
  }
  const waitContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parentExecutionId,
    expect: {
      ...info.message
    }
  });
  waitContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.wait', waitContent);
};
ErrorEventDefinition.prototype.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  const info = this._getReferenceInfo(executeMessage);
  this.logger.debug(`<${executionId} (${this.activity.id})> throw ${info.description}`);
  const broker = this.broker;
  const throwContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parent.executionId,
    message: {
      ...info.message
    },
    state: 'throw'
  });
  throwContent.parent = (0, _messageHelper.shiftParent)(parent);
  this.broker.publish('event', 'activity.throw', throwContent, {
    type: 'throw',
    delegate: true
  });
  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
    message: {
      ...info.message
    }
  }));
};
ErrorEventDefinition.prototype._onErrorMessage = function onErrorMessage(routingKey, message) {
  const error = message.content.error;
  if (!this[kReferenceElement]) return this._catchError(routingKey, message, error);
  if (!error) return;
  const info = this[kReferenceInfo];
  if ('' + error.code !== '' + info.message.code) return;
  return this._catchError(routingKey, message, error);
};
ErrorEventDefinition.prototype._onThrowApiMessage = function onThrowApiMessage(routingKey, message) {
  const error = message.content.message;
  if (!this[kReferenceElement]) return this._catchError(routingKey, message, error);
  const info = this[kReferenceInfo];
  if (info.message.id !== (error && error.id)) return;
  return this._catchError(routingKey, message, error);
};
ErrorEventDefinition.prototype._catchError = function catchError(routingKey, message, error) {
  this[kCompleted] = true;
  this._stop();
  this._debug(`caught ${this[kReferenceInfo].description}`);
  const executeContent = this[kExecuteMessage].content;
  const parent = executeContent.parent;
  const catchContent = (0, _messageHelper.cloneContent)(executeContent, {
    source: {
      id: message.content.id,
      type: message.content.type,
      executionId: message.content.executionId
    },
    error,
    executionId: parent.executionId
  });
  catchContent.parent = (0, _messageHelper.shiftParent)(parent);
  const broker = this.broker;
  broker.publish('event', 'activity.catch', catchContent, {
    type: 'catch'
  });
  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
    output: error,
    cancelActivity: true,
    state: 'catch'
  }));
};
ErrorEventDefinition.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;
  switch (messageType) {
    case 'discard':
      {
        this[kCompleted] = true;
        this._stop();
        return this.broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(this[kExecuteMessage].content));
      }
    case 'stop':
      {
        this._stop();
        break;
      }
  }
};
ErrorEventDefinition.prototype._stop = function stop() {
  const broker = this.broker,
    executionId = this.executionId;
  broker.cancel(`_onthrow-${executionId}`);
  broker.cancel(`_onerror-${executionId}`);
  broker.cancel(`_api-${executionId}`);
  this[kMessageQ].purge();
};
ErrorEventDefinition.prototype._getReferenceInfo = function getReferenceInfo(message) {
  const referenceElement = this[kReferenceElement];
  if (!referenceElement) {
    return {
      message: {
        ...this.reference
      },
      description: 'anonymous error'
    };
  }
  const result = {
    message: referenceElement.resolve(message)
  };
  result.description = `${result.message.name} <${result.message.id}>`;
  if (result.message.code) result.description += ` code ${result.message.code}`;
  return result;
};
ErrorEventDefinition.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};