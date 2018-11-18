"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = SignalTask;
exports.SignalTaskBehaviour = SignalTaskBehaviour;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function SignalTask(activityDef, context) {
  return (0, _Activity.default)(SignalTaskBehaviour, activityDef, context);
}

function SignalTaskBehaviour(activity) {
  const {
    id,
    type,
    behaviour,
    broker
  } = activity;
  const loopCharacteristics = behaviour.loopCharacteristics && behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
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
    broker.publish('event', 'activity.wait', { ...content,
      state: 'wait'
    });

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;

      switch (messageType) {
        case 'stop':
          return broker.cancel(`_api-${executionId}`);

        case 'signal':
          broker.cancel(`_api-${executionId}`);
          return broker.publish('execution', 'execute.completed', { ...content,
            output: message.content.message,
            state: 'signal'
          });

        case 'discard':
          broker.cancel(`_api-${executionId}`);
          return broker.publish('execution', 'execute.discard', { ...content
          });
      }
    }
  }
}