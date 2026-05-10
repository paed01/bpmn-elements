"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EndEvent = EndEvent;
exports.EndEventBehaviour = EndEventBehaviour;
var _Activity = require("../activity/Activity.js");
var _EventDefinitionExecution = require("../eventDefinitions/EventDefinitionExecution.js");
var _messageHelper = require("../messageHelper.js");
var _constants = require("../constants.js");
function EndEvent(activityDef, context) {
  return new _Activity.Activity(EndEventBehaviour, {
    ...activityDef,
    isThrowing: true
  }, context);
}
function EndEventBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.broker = activity.broker;
  /** @private */
  this[_constants.K_EXECUTION] = activity.eventDefinitions && new _EventDefinitionExecution.EventDefinitionExecution(activity, activity.eventDefinitions);
}
EndEventBehaviour.prototype.execute = function execute(executeMessage) {
  const execution = this[_constants.K_EXECUTION];
  if (execution) {
    return execution.execute(executeMessage);
  }
  return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeMessage.content));
};