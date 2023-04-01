"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EndEventBehaviour = EndEventBehaviour;
exports.default = EndEvent;
var _Activity = _interopRequireDefault(require("../activity/Activity.js"));
var _EventDefinitionExecution = _interopRequireDefault(require("../eventDefinitions/EventDefinitionExecution.js"));
var _messageHelper = require("../messageHelper.js");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const kExecution = Symbol.for('execution');
function EndEvent(activityDef, context) {
  return new _Activity.default(EndEventBehaviour, {
    ...activityDef,
    isThrowing: true
  }, context);
}
function EndEventBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.broker = activity.broker;
  this[kExecution] = activity.eventDefinitions && new _EventDefinitionExecution.default(activity, activity.eventDefinitions);
}
EndEventBehaviour.prototype.execute = function execute(executeMessage) {
  const execution = this[kExecution];
  if (execution) {
    return execution.execute(executeMessage);
  }
  return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeMessage.content));
};