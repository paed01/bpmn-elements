"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = IntermediateThrowEvent;
exports.IntermediateThrowEventBehaviour = IntermediateThrowEventBehaviour;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _EventDefinitionExecution = _interopRequireDefault(require("../eventDefinitions/EventDefinitionExecution"));

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function IntermediateThrowEvent(activityDef, context) {
  return new _Activity.default(IntermediateThrowEventBehaviour, { ...activityDef,
    isThrowing: true
  }, context);
}

function IntermediateThrowEventBehaviour(activity) {
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

    return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeMessage.content));
  }
}