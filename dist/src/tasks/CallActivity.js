"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CallActivityBehaviour = CallActivityBehaviour;
exports.default = CallActivity;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _Errors = require("../error/Errors");

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function CallActivity(activityDef, context) {
  return new _Activity.default(CallActivityBehaviour, activityDef, context);
}

function CallActivityBehaviour(activity) {
  const {
    id,
    type,
    behaviour = {}
  } = activity;
  this.id = id;
  this.type = type;
  this.calledElement = behaviour.calledElement;
  this.loopCharacteristics = behaviour.loopCharacteristics && new behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  this.activity = activity;
  this.broker = activity.broker;
  this.environment = activity.environment;
}

const proto = CallActivityBehaviour.prototype;

proto.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;
  const loopCharacteristics = this.loopCharacteristics;

  if (loopCharacteristics && executeContent.isRootScope) {
    return loopCharacteristics.execute(executeMessage);
  }

  try {
    var calledElement = this.environment.resolveExpression(this.calledElement); // eslint-disable-line no-var
  } catch (err) {
    return broker.publish('execution', 'execute.error', (0, _messageHelper.cloneContent)(executeContent, {
      error: new _Errors.ActivityError(err.message, executeMessage, err)
    }, {
      mandatory: true
    }));
  }

  const executionId = executeContent.executionId;
  const broker = this.broker;
  broker.subscribeTmp('api', `activity.#.${executionId}`, (...args) => {
    this._onApiMessage(calledElement, executeMessage, ...args);
  }, {
    noAck: true,
    consumerTag: `_api-${executionId}`
  });
  broker.subscribeTmp('api', '#.signal.*', (...args) => this._onDelegatedApiMessage(calledElement, executeMessage, ...args), {
    noAck: true,
    consumerTag: `_api-delegated-${executionId}`
  });
  broker.publish('event', 'activity.call', (0, _messageHelper.cloneContent)(executeContent, {
    state: 'wait',
    calledElement
  }), {
    type: 'call'
  });
};

proto._onDelegatedApiMessage = function onDelegatedApiMessage(calledElement, executeMessage, routingKey, message) {
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
  return this._onApiMessage(calledElement, executeMessage, routingKey, message);
};

proto._onApiMessage = function onApiMessage(calledElement, executeMessage, routingKey, message) {
  const {
    type: messageType,
    correlationId
  } = message.properties;
  const executeContent = executeMessage.content;

  switch (messageType) {
    case 'stop':
      return this._stop(executeContent.executionId);

    case 'cancel':
      this.broker.publish('event', 'activity.call.cancel', (0, _messageHelper.cloneContent)(executeContent, {
        state: 'cancel',
        calledElement
      }), {
        type: 'cancel'
      });

    case 'signal':
      this._stop(executeContent.executionId);

      return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
        output: message.content.message,
        state: messageType
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