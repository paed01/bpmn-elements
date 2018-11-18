import Activity from '../activity/Activity';

export default function ParallelGateway(activityDef, context) {
  return Activity(ParallelGatewayBehaviour, {...activityDef, isParallelGateway: true}, context);
}

export function ParallelGatewayBehaviour(activity) {
  const {id, type, broker} = activity;

  const source = {
    id,
    type,
    execute,
  };

  return source;

  function execute({content}) {
    broker.publish('execution', 'execute.completed', content);
  }
}
