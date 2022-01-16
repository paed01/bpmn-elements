"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ScriptTaskBehaviour = ScriptTaskBehaviour;
exports.default = ScriptTask;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _ExecutionScope = _interopRequireDefault(require("../activity/ExecutionScope"));

var _Errors = require("../error/Errors");

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ScriptTask(activityDef, context) {
  return new _Activity.default(ScriptTaskBehaviour, activityDef, context);
}

function ScriptTaskBehaviour(activity) {
  const {
    id,
    type,
    behaviour = {}
  } = activity;
  this.id = id;
  this.type = type;
  this.scriptFormat = behaviour.scriptFormat;
  this.loopCharacteristics = behaviour.loopCharacteristics && new behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  this.activity = activity;
  const environment = this.environment = activity.environment;
  environment.registerScript(activity);
}

ScriptTaskBehaviour.prototype.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;
  const loopCharacteristics = this.loopCharacteristics;

  if (loopCharacteristics && executeContent.isRootScope) {
    return loopCharacteristics.execute(executeMessage);
  }

  const activity = this.activity,
        scriptFormat = this.scriptFormat;
  const script = this.environment.getScript(scriptFormat, activity, (0, _messageHelper.cloneMessage)(executeMessage));

  if (!script) {
    return activity.emitFatal(new _Errors.ActivityError(`Script format ${scriptFormat} is unsupported or was not registered for <${activity.id}>`, executeMessage), executeContent);
  }

  return script.execute((0, _ExecutionScope.default)(activity, executeMessage), scriptCallback);

  function scriptCallback(err, output) {
    if (err) {
      activity.logger.error(`<${executeContent.executionId} (${activity.id})>`, err);
      return activity.broker.publish('execution', 'execute.error', (0, _messageHelper.cloneContent)(executeContent, {
        error: new _Errors.ActivityError(err.message, executeMessage, err)
      }, {
        mandatory: true
      }));
    }

    return activity.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
      output
    }));
  }
};