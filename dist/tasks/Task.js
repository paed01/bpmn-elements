"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Task = Task;
exports.TaskBehaviour = TaskBehaviour;
var _Activity = require("../activity/Activity.js");
var _messageHelper = require("../messageHelper.js");
/**
 * Task
 * @param {import('moddle-context-serializer').Activity} activityDef
 * @param {import('#types').ContextInstance} context
 */
function Task(activityDef, context) {
  return new _Activity.Activity(TaskBehaviour, activityDef, context);
}

/**
 * Task behaviour
 * @param {import('#types').Activity} activity
 */
function TaskBehaviour(activity) {
  const {
    id,
    type,
    behaviour,
    broker
  } = activity;
  this.id = id;
  this.type = type;
  /** @type {import('./LoopCharacteristics.js').LoopCharacteristics | undefined} */
  this.loopCharacteristics = behaviour.loopCharacteristics && new behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  this.broker = broker;
}

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
TaskBehaviour.prototype.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;
  const loopCharacteristics = this.loopCharacteristics;
  if (loopCharacteristics && executeContent.isRootScope) {
    return loopCharacteristics.execute(executeMessage);
  }
  return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent));
};