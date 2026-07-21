"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IntermediateThrowEvent = IntermediateThrowEvent;
exports.IntermediateThrowEventBehaviour = IntermediateThrowEventBehaviour;
var _Activity = require("../activity/Activity.js");
var _EventDefinitionExecution = require("../eventDefinitions/EventDefinitionExecution.js");
var _messageHelper = require("../messageHelper.js");
var _constants = require("../constants.js");
/**
 * Intermediate throw event
 * @param {import('moddle-context-serializer').Activity} activityDef
 * @param {import('#types').ContextInstance} context
 */
function IntermediateThrowEvent(activityDef, context) {
  return new _Activity.Activity(IntermediateThrowEventBehaviour, {
    ...activityDef,
    isThrowing: true,
    ...context.getLinkEventDefinitionInfo(activityDef)
  }, context);
}

/**
 * Intermediate throw event behaviour
 * @param {import('#types').Activity} activity
 */
function IntermediateThrowEventBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.broker = activity.broker;
  /** @internal */
  this[_constants.K_EXECUTION] = activity.eventDefinitions && new _EventDefinitionExecution.EventDefinitionExecution(activity, activity.eventDefinitions);
}

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
IntermediateThrowEventBehaviour.prototype.execute = function execute(executeMessage) {
  const execution = this[_constants.K_EXECUTION];
  if (execution) {
    return execution.execute(executeMessage);
  }
  return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeMessage.content));
};