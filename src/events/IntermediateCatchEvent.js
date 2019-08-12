import Activity from '../activity/Activity';
import EventDefinitionExecution from '../eventDefinitions/EventDefinitionExecution';
import {cloneContent} from '../messageHelper';

export default function IntermediateCatchEvent(activityDef, context) {
  return Activity(IntermediateCatchEventBehaviour, activityDef, context);
}

export function IntermediateCatchEventBehaviour(activity) {
  const {id, type, broker, eventDefinitions} = activity;
  const eventDefinitionExecution = eventDefinitions && EventDefinitionExecution(activity, eventDefinitions);

  const source = {
    id,
    type,
    execute,
  };

  return source;

  function execute(executeMessage) {
    if (eventDefinitionExecution) {
      return eventDefinitionExecution.execute(executeMessage);
    }

    const messageContent = cloneContent(executeMessage.content);
    const {executionId} = messageContent;
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {noAck: true, consumerTag: `_api-${executionId}`});

    return broker.publish('event', 'activity.wait', cloneContent(messageContent));

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;
      switch (messageType) {
        case 'message':
        case 'signal': {
          return complete(message.content.message);
        }
        case 'discard': {
          stop();
          return broker.publish('execution', 'execute.discard', {...messageContent});
        }
        case 'stop': {
          return stop();
        }
      }
    }

    function complete(output) {
      stop();
      return broker.publish('execution', 'execute.completed', {...messageContent, output});
    }

    function stop() {
      broker.cancel(`_api-${executionId}`);
    }
  }
}
