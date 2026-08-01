"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SendTask = SendTask;
exports.SendTaskBehaviour = SendTaskBehaviour;
var _Activity = require("../activity/Activity.js");
var _ServiceTask = require("./ServiceTask.js");
/**
 * Send task
 * @param {import('moddle-context-serializer').Activity} activityDef
 * @param {import('#types').ContextInstance} context
 */
function SendTask(activityDef, context) {
  return new _Activity.Activity(SendTaskBehaviour, activityDef, context);
}

/**
 * Send task behaviour
 *
 * Shares the service task implementation but owns its own prototype so consumers
 * can override it without affecting `ServiceTaskBehaviour` or its sibling behaviours.
 * @param {import('#types').Activity} activity
 */
function SendTaskBehaviour(activity) {
  _ServiceTask.ServiceTaskBehaviour.call(this, activity);
}
SendTaskBehaviour.prototype = Object.create(_ServiceTask.ServiceTaskBehaviour.prototype);
SendTaskBehaviour.prototype.constructor = SendTaskBehaviour;