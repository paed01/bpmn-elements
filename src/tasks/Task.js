import Activity from '../activity/Activity';

export default function Task(activityDef, context) {
  return new Activity(TaskBehaviour, activityDef, context);
}

export function TaskBehaviour(activity) {
  const {id, type, behaviour, broker} = activity;
  this.id = id;
  this.type = type;
  this.loopCharacteristics = behaviour.loopCharacteristics && new behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  this.broker = broker;
}

TaskBehaviour.prototype.execute = function execute(executeMessage) {
  const content = executeMessage.content;
  const loopCharacteristics = this.loopCharacteristics;
  if (loopCharacteristics && content.isRootScope) {
    return loopCharacteristics.execute(executeMessage);
  }

  return this.broker.publish('execution', 'execute.completed', {...content});
};
