"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Task = Task;
exports.TaskBehaviour = TaskBehaviour;
var _Activity = require("../activity/Activity.js");
var _messageHelper = require("../messageHelper.js");
function Task(activityDef, context) {
  return new _Activity.Activity(TaskBehaviour, activityDef, context);
}
function TaskBehaviour(activity) {
  const {
    id,
    type,
    behaviour,
    broker
  } = activity;
  this.id = id;
  this.type = type;
  this.loopCharacteristics = behaviour.loopCharacteristics && new behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  this.broker = broker;
}
TaskBehaviour.prototype.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;
  const loopCharacteristics = this.loopCharacteristics;
  if (loopCharacteristics && executeContent.isRootScope) {
    return loopCharacteristics.execute(executeMessage);
  }
  return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent));
};