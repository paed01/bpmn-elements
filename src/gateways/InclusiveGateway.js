import Activity from '../activity/Activity';
import {cloneContent} from '../messageHelper';

export default function InclusiveGateway(activityDef, context) {
  return new Activity(InclusiveGatewayBehaviour, activityDef, context);
}

export function InclusiveGatewayBehaviour(activity) {
  const {id, type, broker} = activity;
  this.id = id;
  this.type = type;
  this.broker = broker;
}

InclusiveGatewayBehaviour.prototype.execute = function execute({content}) {
  this.broker.publish('execution', 'execute.completed', cloneContent(content));
};
