"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IntermediateCatchEvent = IntermediateCatchEvent;
exports.IntermediateCatchEventBehaviour = IntermediateCatchEventBehaviour;
var _Activity = require("../activity/Activity.js");
var _EventDefinitionExecution = require("../eventDefinitions/EventDefinitionExecution.js");
var _messageHelper = require("../messageHelper.js");
var _constants = require("../constants.js");
function IntermediateCatchEvent(activityDef, context) {
  return new _Activity.Activity(IntermediateCatchEventBehaviour, {
    ...activityDef,
    isCatching: true
  }, context);
}
function IntermediateCatchEventBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.broker = activity.broker;
  /** @private */
  this[_constants.K_EXECUTION] = activity.eventDefinitions && new _EventDefinitionExecution.EventDefinitionExecution(activity, activity.eventDefinitions);
}
IntermediateCatchEventBehaviour.prototype.execute = function execute(executeMessage) {
  const execution = this[_constants.K_EXECUTION];
  if (execution) {
    return execution.execute(executeMessage);
  }
  const executeContent = executeMessage.content;
  const executionId = executeContent.executionId;
  const broker = this.broker;
  broker.subscribeTmp('api', `activity.#.${executionId}`, this._onApiMessage.bind(this, executeMessage), {
    noAck: true,
    consumerTag: '_api-behaviour-execution'
  });
  return broker.publish('event', 'activity.wait', (0, _messageHelper.cloneContent)(executeContent));
};
IntermediateCatchEventBehaviour.prototype._onApiMessage = function onApiMessage(executeMessage, routingKey, message) {
  switch (message.properties.type) {
    case 'message':
    case 'signal':
      {
        const broker = this.broker;
        broker.cancel('_api-behaviour-execution');
        return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeMessage.content, {
          output: message.content.message
        }));
      }
    case 'discard':
      {
        const broker = this.broker;
        broker.cancel('_api-behaviour-execution');
        return broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(executeMessage.content));
      }
    case 'stop':
      {
        return this.broker.cancel('_api-behaviour-execution');
      }
  }
};