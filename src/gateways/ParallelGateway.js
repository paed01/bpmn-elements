import Activity from '../activity/Activity';
import {cloneContent} from '../messageHelper';

export default function ParallelGateway(activityDef, context) {
  return new Activity(ParallelGatewayBehaviour, {...activityDef, isParallelGateway: true}, context);
}

export function ParallelGatewayBehaviour(activity) {
  const {id, type, broker} = activity;
  this.id = id;
  this.type = type;
  this.broker = broker;
}

ParallelGatewayBehaviour.prototype.execute = function execute({content}) {
  this.broker.publish('execution', 'execute.completed', cloneContent(content));
};
