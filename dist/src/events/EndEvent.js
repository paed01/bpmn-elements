"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = EndEvent;
exports.EndEventBehaviour = EndEventBehaviour;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _EventDefinitionExecution = _interopRequireDefault(require("../eventDefinitions/EventDefinitionExecution"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function EndEvent(activityDef, context) {
  return (0, _Activity.default)(EndEventBehaviour, activityDef, context);
}

function EndEventBehaviour(activity) {
  const {
    id,
    type,
    broker,
    behaviour = {}
  } = activity;
  const {
    eventDefinitions
  } = behaviour;
  const eventDefinitionExecution = eventDefinitions && (0, _EventDefinitionExecution.default)(activity, eventDefinitions);
  const source = {
    id,
    type,
    execute
  };
  return source;

  function execute(executeMessage) {
    const content = executeMessage.content;

    if (eventDefinitionExecution) {
      return eventDefinitionExecution.execute(executeMessage);
    }

    return broker.publish('execution', 'execute.completed', { ...content
    });
  }
}