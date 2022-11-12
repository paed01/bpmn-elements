"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = TerminateEventDefinition;
var _messageHelper = require("../messageHelper");
function TerminateEventDefinition(activity, eventDefinition) {
  const {
    id,
    broker,
    environment
  } = activity;
  const {
    type = 'TerminateEventDefinition'
  } = eventDefinition;
  this.id = id;
  this.type = type;
  this.activity = activity;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());
}
TerminateEventDefinition.prototype.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;
  const throwContent = (0, _messageHelper.cloneContent)(executeContent, {
    state: 'terminate'
  });
  throwContent.parent = (0, _messageHelper.shiftParent)(executeContent.parent);
  this.logger.debug(`<${executeContent.executionId} (${executeContent.id})> terminate`);
  const broker = this.broker;
  broker.publish('event', 'process.terminate', throwContent, {
    type: 'terminate'
  });
  broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent));
};