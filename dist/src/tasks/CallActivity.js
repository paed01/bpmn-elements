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
    behaviour,
    environment,
    broker
  } = activity;
  const loopCharacteristics = behaviour.loopCharacteristics && new behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  const source = {
    id,
    type,
    loopCharacteristics,
    execute
  };
  return source;

  function execute(executeMessage) {
    const content = executeMessage.content;

    if (loopCharacteristics && content.isRootScope) {
      return loopCharacteristics.execute(executeMessage);
    }

    const {
      executionId
    } = content;
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: `_api-${executionId}`
    });
    broker.subscribeTmp('api', '#.signal.*', onDelegatedApiMessage, {
      noAck: true,
      consumerTag: `_api-delegated-${executionId}`
    });

    try {
      var calledElement = environment.resolveExpression(behaviour.calledElement); // eslint-disable-line no-var
    } catch (err) {
      return broker.publish('execution', 'execute.error', (0, _messageHelper.cloneContent)(content, {
        error: new _Errors.ActivityError(err.message, executeMessage, err)
      }, {
        mandatory: true
      }));
    }

    broker.publish('event', 'activity.call', (0, _messageHelper.cloneContent)(content, {
      state: 'wait',
      calledElement
    }), {
      type: 'call'
    });

    function onDelegatedApiMessage(routingKey, message) {
      if (!message.properties.delegate) return;
      const {
        content: delegateContent
      } = message;
      if (!delegateContent || !delegateContent.message) return;
      const {
        id: signalId,
        executionId: signalExecutionId
      } = delegateContent.message;
      if (loopCharacteristics && signalExecutionId !== executionId) return;
      if (signalId !== id && signalExecutionId !== executionId) return;
      const {
        type: messageType,
        correlationId
      } = message.properties;
      broker.publish('event', 'activity.consumed', (0, _messageHelper.cloneContent)(content, {
        message: { ...delegateContent.message
        }
      }), {
        correlationId,
        type: messageType
      });
      return onApiMessage(routingKey, message);
    }

    function onApiMessage(routingKey, message) {
      const {
        type: messageType,
        correlationId
      } = message.properties;

      switch (messageType) {
        case 'stop':
          return stop();

        case 'cancel':
          broker.publish('event', 'activity.call.cancel', (0, _messageHelper.cloneContent)(content, {
            state: 'cancel',
            calledElement
          }), {
            type: 'cancel'
          });

        case 'signal':
          stop();
          return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content, {
            output: message.content.message,
            state: messageType
          }), {
            correlationId
          });

        case 'error':
          stop();
          return broker.publish('execution', 'execute.error', (0, _messageHelper.cloneContent)(content, {
            error: new _Errors.ActivityError(message.content.message, executeMessage, message.content)
          }, {
            mandatory: true,
            correlationId
          }));

        case 'discard':
          stop();
          return broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(content), {
            correlationId
          });
      }
    }

    function stop() {
      broker.cancel(`_api-${executionId}`);
      broker.cancel(`_api-delegated-${executionId}`);
    }
  }
}