import Activity from '../activity/Activity';
import EventDefinitionExecution from '../eventDefinitions/EventDefinitionExecution';

export default function StartEvent(activityDef, context) {
  return Activity(StartEventBehaviour, activityDef, context);
}

export function StartEventBehaviour(activity) {
  const {id, type, broker, behaviour = {}} = activity;
  const {eventDefinitions} = behaviour;
  const eventDefinitionExecution = eventDefinitions && EventDefinitionExecution(activity, eventDefinitions);

  const event = {
    id,
    type,
    execute,
  };

  return event;

  function execute(executeMessage) {
    const content = executeMessage.content;
    if (eventDefinitionExecution) {
      return eventDefinitionExecution.execute(executeMessage);
    }

    if (!content.form) {
      return broker.publish('execution', 'execute.completed', {...content});
    }

    const {executionId} = content;
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {noAck: true, consumerTag: `_api-${executionId}`});
    broker.publish('event', 'activity.wait', {...content, state: 'wait'});

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;
      switch (messageType) {
        case 'stop':
          return broker.cancel(`_api-${executionId}`);
        case 'signal':
          broker.cancel(`_api-${executionId}`);
          return broker.publish('execution', 'execute.completed', {...content, output: message.content.message, state: 'signal'});
        case 'discard':
          broker.cancel(`_api-${executionId}`);
          return broker.publish('execution', 'execute.discard', {...content});
      }
    }
  }
}
