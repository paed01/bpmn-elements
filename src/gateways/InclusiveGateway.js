import Activity from '../activity/Activity';
import {cloneContent} from '../messageHelper';

export default function InclusiveGateway(activityDef, context) {
  return Activity(InclusiveGatewayBehaviour, activityDef, context);
}

export function InclusiveGatewayBehaviour(activity) {
  const {id, type, broker} = activity;

  const source = {
    id,
    type,
    execute,
  };

  return source;

  function execute({content}) {
    broker.publish('execution', 'execute.completed', cloneContent(content));
  }
}
