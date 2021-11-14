"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IntermediateCatchEventBehaviour = IntermediateCatchEventBehaviour;
exports.default = IntermediateCatchEvent;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _EventDefinitionExecution = _interopRequireDefault(require("../eventDefinitions/EventDefinitionExecution"));

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function IntermediateCatchEvent(activityDef, context) {
  return new _Activity.default(IntermediateCatchEventBehaviour, activityDef, context);
}

function IntermediateCatchEventBehaviour(activity) {
  const {
    id,
    type,
    broker,
    eventDefinitions
  } = activity;
  const eventDefinitionExecution = eventDefinitions && (0, _EventDefinitionExecution.default)(activity, eventDefinitions);
  const source = {
    id,
    type,
    execute
  };
  return source;

  function execute(executeMessage) {
    if (eventDefinitionExecution) {
      return eventDefinitionExecution.execute(executeMessage);
    }

    const content = (0, _messageHelper.cloneContent)(executeMessage.content);
    const {
      executionId
    } = content;
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: `_api-${executionId}`
    });
    return broker.publish('event', 'activity.wait', (0, _messageHelper.cloneContent)(content));

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;

      switch (messageType) {
        case 'message':
        case 'signal':
          {
            return complete(message.content.message);
          }

        case 'discard':
          {
            stop();
            return broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(content));
          }

        case 'stop':
          {
            return stop();
          }
      }
    }

    function complete(output) {
      stop();
      return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content, {
        output
      }));
    }

    function stop() {
      broker.cancel(`_api-${executionId}`);
    }
  }
}