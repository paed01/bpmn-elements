import Activity from '../activity/Activity';
import ExecutionScope from '../activity/ExecutionScope';
import { ActivityError } from '../error/Errors';
import {cloneContent} from '../messageHelper';

export default function ScriptTask(activityDef, context) {
  return Activity(ScriptTaskBehaviour, activityDef, context);
}

export function ScriptTaskBehaviour(activity) {
  const {id, type, behaviour, broker, logger, environment, emitFatal} = activity;

  const {scriptFormat, script: scriptBody} = activity.behaviour;

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
    const content = cloneContent(executeMessage.content);
    if (loopCharacteristics && content.isRootScope) {
      return loopCharacteristics.execute(executeMessage);
    }

    if (!scriptBody) return broker.publish('execution', 'execute.completed', content);

    const script = environment.getScript(scriptFormat, activity);
    if (!script) {
      return emitFatal(new ActivityError(`Script format ${scriptFormat} is unsupported or was not registered for <${activity.id}>`, executeMessage));
    }

    return script.execute(ExecutionScope(activity, executeMessage), scriptCallback);

    function scriptCallback(err, output) {
      if (err) {
        logger.error(`<${content.executionId} (${id})>`, err);
        return broker.publish('execution', 'execute.error', {...content, error: new ActivityError(err.message, executeMessage, err)}, {mandatory: true});
      }
      return broker.publish('execution', 'execute.completed', {...content, output});
    }
  }
}
