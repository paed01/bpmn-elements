"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IntermediateCatchEventBehaviour = IntermediateCatchEventBehaviour;
exports.default = IntermediateCatchEvent;
var _Activity = _interopRequireDefault(require("../activity/Activity.js"));
var _EventDefinitionExecution = _interopRequireDefault(require("../eventDefinitions/EventDefinitionExecution.js"));
var _messageHelper = require("../messageHelper.js");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const kExecution = Symbol.for('execution');
function IntermediateCatchEvent(activityDef, context) {
  return new _Activity.default(IntermediateCatchEventBehaviour, activityDef, context);
}
function IntermediateCatchEventBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.broker = activity.broker;
  this[kExecution] = activity.eventDefinitions && new _EventDefinitionExecution.default(activity, activity.eventDefinitions);
}
IntermediateCatchEventBehaviour.prototype.execute = function execute(executeMessage) {
  const execution = this[kExecution];
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