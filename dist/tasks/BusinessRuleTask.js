"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.BusinessRuleTask = BusinessRuleTask;
exports.BusinessRuleTaskBehaviour = BusinessRuleTaskBehaviour;
var _Activity = require("../activity/Activity.js");
var _ServiceTask = require("./ServiceTask.js");
/**
 * Business rule task
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
function BusinessRuleTask(activityDef, context) {
  // @ts-ignore
  return new _Activity.Activity(BusinessRuleTaskBehaviour, activityDef, context);
}

/**
 * Business rule task behaviour
 *
 * Shares the service task implementation but owns its own prototype so consumers
 * can override it without affecting `ServiceTaskBehaviour` or its sibling behaviours.
 * @param {import('#types').Activity} activity
 */
function BusinessRuleTaskBehaviour(activity) {
  _ServiceTask.ServiceTaskBehaviour.call(this, activity);
}
BusinessRuleTaskBehaviour.prototype = Object.create(_ServiceTask.ServiceTaskBehaviour.prototype);
BusinessRuleTaskBehaviour.prototype.constructor = BusinessRuleTaskBehaviour;