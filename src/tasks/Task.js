import Activity from '../activity/Activity.js';
import {cloneContent} from '../messageHelper.js';

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
  const executeContent = executeMessage.content;
  const loopCharacteristics = this.loopCharacteristics;
  if (loopCharacteristics && executeContent.isRootScope) {
    return loopCharacteristics.execute(executeMessage);
  }

  return this.broker.publish('execution', 'execute.completed', cloneContent(executeContent));
};
