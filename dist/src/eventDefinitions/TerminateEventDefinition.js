"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = TerminateEventDefinition;

var _messageHelper = require("../messageHelper");

function TerminateEventDefinition(activity, eventDefinition = {}) {
  const {
    id,
    broker,
    environment
  } = activity;
  const {
    type = 'terminateeventdefinition'
  } = eventDefinition;
  const {
    debug
  } = environment.Logger(type.toLowerCase());
  const source = {
    id,
    type,
    execute
  };
  return source;

  function execute(executeMessage) {
    const content = (0, _messageHelper.cloneContent)(executeMessage.content);
    const terminateContent = (0, _messageHelper.cloneContent)(content);
    terminateContent.parent = (0, _messageHelper.shiftParent)(terminateContent.parent);
    terminateContent.state = 'terminate';
    debug(`<${content.executionId} (${content.id})> terminate`);
    broker.publish('event', 'process.terminate', terminateContent, {
      type: 'terminate'
    });
    broker.publish('execution', 'execute.completed', content);
  }
}