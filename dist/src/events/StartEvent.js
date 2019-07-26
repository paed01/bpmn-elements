"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = StartEvent;
exports.StartEventBehaviour = StartEventBehaviour;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _EventDefinitionExecution = _interopRequireDefault(require("../eventDefinitions/EventDefinitionExecution"));

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function StartEvent(activityDef, context) {
  return (0, _Activity.default)(StartEventBehaviour, activityDef, context);
}

function StartEventBehaviour(activity) {
  const {
    id,
    type = 'startevent',
    broker,
    eventDefinitions
  } = activity;
  const eventDefinitionExecution = eventDefinitions && (0, _EventDefinitionExecution.default)(activity, eventDefinitions);
  const event = {
    id,
    type,
    execute
  };
  return event;

  function execute(executeMessage) {
    const content = (0, _messageHelper.cloneContent)(executeMessage.content);

    if (eventDefinitionExecution) {
      return eventDefinitionExecution.execute(executeMessage);
    }

    if (!content.form) {
      return broker.publish('execution', 'execute.completed', content);
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