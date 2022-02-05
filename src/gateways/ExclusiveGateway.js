import Activity from '../activity/Activity';
import {cloneContent} from '../messageHelper';

export default function ExclusiveGateway(activityDef, context) {
  return new Activity(ExclusiveGatewayBehaviour, activityDef, context);
}

export function ExclusiveGatewayBehaviour(activity) {
  const {id, type, broker} = activity;
  this.id = id;
  this.type = type;
  this.broker = broker;
}

ExclusiveGatewayBehaviour.prototype.execute = function execute({content}) {
  this.broker.publish('execution', 'execute.completed', cloneContent(content, {outboundTakeOne: true}));
};
