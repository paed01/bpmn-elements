"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ScriptTask = ScriptTask;
exports.ScriptTaskBehaviour = ScriptTaskBehaviour;
var _Activity = require("../activity/Activity.js");
var _ExecutionScope = require("../activity/ExecutionScope.js");
var _Errors = require("../error/Errors.js");
var _messageHelper = require("../messageHelper.js");
/**
 * Script task
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
function ScriptTask(activityDef, context) {
  return new _Activity.Activity(ScriptTaskBehaviour, activityDef, context);
}

/**
 * Script task behaviour
 * @param {import('#types').Activity} activity
 */
function ScriptTaskBehaviour(activity) {
  const {
    id,
    type,
    behaviour
  } = activity;
  this.id = id;
  this.type = type;
  this.scriptFormat = behaviour.scriptFormat;

  /** @type {import('./LoopCharacteristics.js').LoopCharacteristics | undefined} */
  this.loopCharacteristics = behaviour.loopCharacteristics && new behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  this.activity = activity;
  const environment = this.environment = activity.environment;
  environment.registerScript(activity);
}

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
ScriptTaskBehaviour.prototype.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;
  const loopCharacteristics = this.loopCharacteristics;
  if (loopCharacteristics && executeContent.isRootScope) {
    return loopCharacteristics.execute(executeMessage);
  }
  const activity = this.activity;
  const scriptFormat = this.scriptFormat;
  // @ts-ignore
  const script = this.environment.getScript(scriptFormat, activity, (0, _messageHelper.cloneMessage)(executeMessage));
  if (!script) {
    return activity.emitFatal(new _Errors.ActivityError(`Script format ${scriptFormat} is unsupported or was not registered for <${activity.id}>`, executeMessage), executeContent);
  }

  // @ts-ignore
  return script.execute((0, _ExecutionScope.ExecutionScope)(activity, executeMessage), scriptCallback);
  function scriptCallback(err, output) {
    if (err) {
      activity.logger.error(`<${executeContent.executionId} (${activity.id})>`, err);
      return activity.broker.publish('execution', 'execute.error', (0, _messageHelper.cloneContent)(executeContent, {
        error: new _Errors.ActivityError(err.message, executeMessage, err)
      },
      // @ts-ignore
      {
        mandatory: true
      }));
    }
    return activity.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
      output
    }));
  }
};