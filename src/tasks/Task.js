import Activity from '../activity/Activity';

export default function Task(activityDef, context) {
  return new Activity(TaskBehaviour, activityDef, context);
}

export function TaskBehaviour(activity) {
  const {id, type, behaviour, broker} = activity;
  const loopCharacteristics = behaviour.loopCharacteristics && behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);

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

    return broker.publish('execution', 'execute.completed', {...content});
  }
}
