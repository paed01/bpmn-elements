"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SignalTaskBehaviour = SignalTaskBehaviour;
exports.default = SignalTask;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _Errors = require("../error/Errors");

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function SignalTask(activityDef, context) {
  return new _Activity.default(SignalTaskBehaviour, activityDef, context);
}

function SignalTaskBehaviour(activity) {
  const {
    id,
    type,
    behaviour
  } = activity;
  this.id = id;
  this.type = type;
  this.loopCharacteristics = behaviour.loopCharacteristics && new behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  this.activity = activity;
  this.broker = activity.broker;
}

const proto = SignalTaskBehaviour.prototype;

proto.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;
  const loopCharacteristics = this.loopCharacteristics;

  if (loopCharacteristics && executeContent.isRootScope) {
    return loopCharacteristics.execute(executeMessage);
  }

  const executionId = executeContent.executionId;
  const broker = this.broker;
  broker.subscribeTmp('api', `activity.#.${executionId}`, (...args) => this._onApiMessage(executeMessage, ...args), {
    noAck: true,
    consumerTag: `_api-${executionId}`
  });
  broker.subscribeTmp('api', '#.signal.*', (...args) => this._onDelegatedApiMessage(executeMessage, ...args), {
    noAck: true,
    consumerTag: `_api-delegated-${executionId}`
  });
  broker.publish('event', 'activity.wait', (0, _messageHelper.cloneContent)(executeContent, {
    state: 'wait'
  }));
};

proto._onDelegatedApiMessage = function onDelegatedApiMessage(executeMessage, routingKey, message) {
  if (!message.properties.delegate) return;
  const {
    content: delegateContent
  } = message;
  if (!delegateContent || !delegateContent.message) return;
  const executeContent = executeMessage.content;
  const {
    id: signalId,
    executionId: signalExecutionId
  } = delegateContent.message;
  if (this.loopCharacteristics && signalExecutionId !== executeContent.executionId) return;
  if (signalId !== this.id && signalExecutionId !== executeContent.executionId) return;
  const {
    type: messageType,
    correlationId
  } = message.properties;
  this.broker.publish('event', 'activity.consumed', (0, _messageHelper.cloneContent)(executeContent, {
    message: { ...delegateContent.message
    }
  }), {
    correlationId,
    type: messageType
  });
  return this._onApiMessage(executeMessage, routingKey, message);
};

proto._onApiMessage = function onApiMessage(executeMessage, routingKey, message) {
  const {
    type: messageType,
    correlationId
  } = message.properties;
  const executeContent = executeMessage.content;

  switch (messageType) {
    case 'stop':
      return this._stop(executeContent.executionId);

    case 'signal':
      this._stop(executeContent.executionId);

      return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
        output: message.content.message,
        state: 'signal'
      }), {
        correlationId
      });

    case 'error':
      this._stop(executeContent.executionId);

      return this.broker.publish('execution', 'execute.error', (0, _messageHelper.cloneContent)(executeContent, {
        error: new _Errors.ActivityError(message.content.message, executeMessage, message.content)
      }, {
        mandatory: true,
        correlationId
      }));

    case 'discard':
      this._stop(executeContent.executionId);

      return this.broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(executeContent), {
        correlationId
      });
  }
};

proto._stop = function stop(executionId) {
  const broker = this.broker;
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_api-delegated-${executionId}`);
};