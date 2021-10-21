import Activity from '../activity/Activity';
import EventDefinitionExecution from '../eventDefinitions/EventDefinitionExecution';
import {cloneContent} from '../messageHelper';

export default function IntermediateCatchEvent(activityDef, context) {
  return new Activity(IntermediateCatchEventBehaviour, activityDef, context);
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

    const content = cloneContent(executeMessage.content);
    const {executionId} = content;
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {noAck: true, consumerTag: `_api-${executionId}`});

    return broker.publish('event', 'activity.wait', cloneContent(content));

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;
      switch (messageType) {
        case 'message':
        case 'signal': {
          return complete(message.content.message);
        }
        case 'discard': {
          stop();
          return broker.publish('execution', 'execute.discard', cloneContent(content));
        }
        case 'stop': {
          return stop();
        }
      }
    }

    function complete(output) {
      stop();
      return broker.publish('execution', 'execute.completed', cloneContent(content, {output}));
    }

    function stop() {
      broker.cancel(`_api-${executionId}`);
    }
  }
}
