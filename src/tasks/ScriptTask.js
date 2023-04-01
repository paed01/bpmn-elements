import Activity from '../activity/Activity.js';
import ExecutionScope from '../activity/ExecutionScope.js';
import { ActivityError } from '../error/Errors.js';
import {cloneContent, cloneMessage} from '../messageHelper.js';

export default function ScriptTask(activityDef, context) {
  return new Activity(ScriptTaskBehaviour, activityDef, context);
}

export function ScriptTaskBehaviour(activity) {
  const {id, type, behaviour} = activity;

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

  const activity = this.activity, scriptFormat = this.scriptFormat;
  const script = this.environment.getScript(scriptFormat, activity, cloneMessage(executeMessage));
  if (!script) {
    return activity.emitFatal(new ActivityError(`Script format ${scriptFormat} is unsupported or was not registered for <${activity.id}>`, executeMessage), executeContent);
  }

  return script.execute(ExecutionScope(activity, executeMessage), scriptCallback);

  function scriptCallback(err, output) {
    if (err) {
      activity.logger.error(`<${executeContent.executionId} (${activity.id})>`, err);
      return activity.broker.publish('execution', 'execute.error', cloneContent(executeContent, {error: new ActivityError(err.message, executeMessage, err)}, {mandatory: true}));
    }
    return activity.broker.publish('execution', 'execute.completed', cloneContent(executeContent, {output}));
  }
};
