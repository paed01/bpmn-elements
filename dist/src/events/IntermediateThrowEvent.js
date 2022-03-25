"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IntermediateThrowEventBehaviour = IntermediateThrowEventBehaviour;
exports.default = IntermediateThrowEvent;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _EventDefinitionExecution = _interopRequireDefault(require("../eventDefinitions/EventDefinitionExecution"));

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const kExecution = Symbol.for('execution');

function IntermediateThrowEvent(activityDef, context) {
  return new _Activity.default(IntermediateThrowEventBehaviour, { ...activityDef,
    isThrowing: true
  }, context);
}

function IntermediateThrowEventBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.broker = activity.broker;
  this[kExecution] = activity.eventDefinitions && new _EventDefinitionExecution.default(activity, activity.eventDefinitions);
}

IntermediateThrowEventBehaviour.prototype.execute = function execute(executeMessage) {
  const execution = this[kExecution];

  if (execution) {
    return execution.execute(executeMessage);
  }

  return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeMessage.content));
};