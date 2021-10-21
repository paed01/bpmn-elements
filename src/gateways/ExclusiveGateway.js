import Activity from '../activity/Activity';
import {cloneContent} from '../messageHelper';

export default function ExclusiveGateway(activityDef, context) {
  return new Activity(ExclusiveGatewayBehaviour, activityDef, context);
}

export function ExclusiveGatewayBehaviour(activity) {
  const {id, type, broker} = activity;

  const source = {
    id,
    type,
    execute,
  };

  return source;

  function execute({content}) {
    broker.publish('execution', 'execute.completed', cloneContent(content, {outboundTakeOne: true}));
  }
}
