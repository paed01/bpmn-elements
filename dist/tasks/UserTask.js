"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UserTask = UserTask;
exports.UserTaskBehaviour = UserTaskBehaviour;
var _Activity = require("../activity/Activity.js");
var _SignalTask = require("./SignalTask.js");
/**
 * User task
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
function UserTask(activityDef, context) {
  // @ts-ignore
  return new _Activity.Activity(UserTaskBehaviour, activityDef, context);
}

/**
 * User task behaviour
 *
 * Shares the signal task implementation but owns its own prototype so consumers
 * can override it without affecting `SignalTaskBehaviour` or its sibling behaviours.
 * @param {import('#types').Activity} activity
 */
function UserTaskBehaviour(activity) {
  _SignalTask.SignalTaskBehaviour.call(this, activity);
}
UserTaskBehaviour.prototype = Object.create(_SignalTask.SignalTaskBehaviour.prototype);
UserTaskBehaviour.prototype.constructor = UserTaskBehaviour;