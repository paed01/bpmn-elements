import Activity from '../activity/Activity';
import ExecutionScope from '../activity/ExecutionScope';
import { ActivityError } from '../error/Errors';
import {cloneContent, cloneMessage} from '../messageHelper';

export default function ScriptTask(activityDef, context) {
  return new Activity(ScriptTaskBehaviour, activityDef, context);
}

export function ScriptTaskBehaviour(activity) {
  const {id, type, behaviour, broker, logger, environment, emitFatal} = activity;

  const {scriptFormat} = activity.behaviour;

  const loopCharacteristics = behaviour.loopCharacteristics && behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);

  environment.registerScript(activity);

  const source = {
    id,
    type,
    loopCharacteristics,
    execute,
  };

  return source;

  function execute(executeMessage) {
    const content = executeMessage.content;
    if (loopCharacteristics && content.isRootScope) {
      return loopCharacteristics.execute(executeMessage);
    }

    const script = environment.getScript(scriptFormat, activity, cloneMessage(executeMessage));
    if (!script) {
      return emitFatal(new ActivityError(`Script format ${scriptFormat} is unsupported or was not registered for <${activity.id}>`, executeMessage), content);
    }

    return script.execute(ExecutionScope(activity, executeMessage), scriptCallback);

    function scriptCallback(err, output) {
      if (err) {
        logger.error(`<${content.executionId} (${id})>`, err);
        return broker.publish('execution', 'execute.error', cloneContent(content, {error: new ActivityError(err.message, executeMessage, err)}, {mandatory: true}));
      }
      return broker.publish('execution', 'execute.completed', cloneContent(content, {output}));
    }
  }
}
