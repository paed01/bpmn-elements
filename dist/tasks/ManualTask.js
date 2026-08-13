"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ManualTask = ManualTask;
exports.ManualTaskBehaviour = ManualTaskBehaviour;
var _Activity = require("../activity/Activity.js");
var _SignalTask = require("./SignalTask.js");
/**
 * Manual task
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
function ManualTask(activityDef, context) {
  // @ts-ignore
  return new _Activity.Activity(ManualTaskBehaviour, activityDef, context);
}

/**
 * Manual task behaviour
 *
 * Shares the signal task implementation but owns its own prototype so consumers
 * can override it without affecting `SignalTaskBehaviour` or its sibling behaviours.
 * @param {import('#types').Activity} activity
 */
function ManualTaskBehaviour(activity) {
  _SignalTask.SignalTaskBehaviour.call(this, activity);
}
ManualTaskBehaviour.prototype = Object.create(_SignalTask.SignalTaskBehaviour.prototype);
ManualTaskBehaviour.prototype.constructor = ManualTaskBehaviour;