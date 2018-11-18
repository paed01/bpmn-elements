import Activity from '../activity/Activity';
import EventDefinitionExecution from '../eventDefinitions/EventDefinitionExecution';

export default function BoundaryEvent(activityDef, context) {
  return Activity(BoundaryEventBehaviour, activityDef, context);
}

export function BoundaryEventBehaviour(activity) {
  const {id, type = 'BoundaryEvent', broker, attachedTo, behaviour = {}} = activity;
  const cancelActivity = 'cancelActivity' in behaviour ? behaviour.cancelActivity : true;
  const {eventDefinitions} = behaviour;
  const eventDefinitionExecution = eventDefinitions && EventDefinitionExecution(activity, eventDefinitions, 'execute.bound.completed');

  return {
    id,
    type,
    attachedTo,
    cancelActivity,
    execute,
  };

  function execute(executeMessage) {
    const content = executeMessage.content;
    const {isRootScope, executionId, inbound} = content;

    let completeContent;

    if (isRootScope) {
      attachedTo.broker.subscribeTmp('event', 'activity.#', onAttachedComplete, {noAck: true, consumerTag: `_bound-listener-${executionId}`});
      broker.subscribeOnce('api', `activity.stop.${executionId}`, stop, {noAck: true, consumerTag: `_api-stop-${executionId}`});
      broker.subscribeOnce('execution', 'execute.bound.completed', onCompleted, {noAck: true, consumerTag: `_execution-completed-${executionId}`});
    }

    if (eventDefinitionExecution) eventDefinitionExecution.execute(executeMessage);

    function onCompleted(_, message) {
      if (!cancelActivity) {
        stop();
        return broker.publish('execution', 'execute.completed', {...message.content});
      }

      completeContent = message.content;

      const attachedToContent = inbound && inbound[0];
      attachedTo.getApi({content: attachedToContent}).discard();
    }

    function onAttachedComplete(routingKey) {
      switch (routingKey) {
        case 'activity.end':
          discard();
          break;
        case 'activity.leave':
          if (!completeContent) return discard();
          stop();
          broker.publish('execution', 'execute.completed', {...completeContent});
          break;
      }
    }

    function discard() {
      stop();
      if (eventDefinitionExecution) eventDefinitionExecution.discard();
      return broker.publish('execution', 'execute.discard', {...content, state: 'discard'});
    }

    function stop() {
      attachedTo.broker.cancel(`_bound-listener-${executionId}`);
      broker.cancel(`_api-stop-${executionId}`);
      broker.cancel(`_execution-completed-${executionId}`);
    }
  }
}
