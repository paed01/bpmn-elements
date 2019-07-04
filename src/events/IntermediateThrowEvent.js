import Activity from '../activity/Activity';
import EventDefinitionExecution from '../eventDefinitions/EventDefinitionExecution';
import {cloneContent} from '../messageHelper';

export default function IntermediateThrowEvent(activityDef, context) {
  return Activity(IntermediateThrowEventBehaviour, {...activityDef, isThrowing: true}, context);
}

export function IntermediateThrowEventBehaviour(activity) {
  const {id, type, broker, behaviour = {}} = activity;
  const {eventDefinitions} = behaviour;
  const eventDefinitionExecution = eventDefinitions && EventDefinitionExecution(activity, eventDefinitions);

  const source = {
    id,
    type,
    execute,
  };

  return source;

  function execute(executeMessage) {
    const content = executeMessage.content;
    if (eventDefinitionExecution) {
      return eventDefinitionExecution.execute(executeMessage);
    }

    return broker.publish('execution', 'execute.completed', cloneContent(content));
  }
}
