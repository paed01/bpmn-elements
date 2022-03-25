import Activity from '../activity/Activity';
import EventDefinitionExecution from '../eventDefinitions/EventDefinitionExecution';
import {cloneContent} from '../messageHelper';

const kExecution = Symbol.for('execution');

export default function EndEvent(activityDef, context) {
  return new Activity(EndEventBehaviour, {...activityDef, isThrowing: true}, context);
}

export function EndEventBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.broker = activity.broker;
  this[kExecution] = activity.eventDefinitions && new EventDefinitionExecution(activity, activity.eventDefinitions);
}

EndEventBehaviour.prototype.execute = function execute(executeMessage) {
  const execution = this[kExecution];
  if (execution) {
    return execution.execute(executeMessage);
  }

  return this.broker.publish('execution', 'execute.completed', cloneContent(executeMessage.content));
};
