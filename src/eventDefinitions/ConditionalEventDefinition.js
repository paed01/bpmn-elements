import {cloneContent, shiftParent} from '../messageHelper';

export default function ConditionalEventDefinition(activity, eventDefinition) {
  const {id, broker, environment, attachedTo} = activity;
  const {type = 'ConditionalEventDefinition', behaviour = {}} = eventDefinition;
  const {debug} = environment.Logger(type.toLowerCase());
  const condition = behaviour.condition && behaviour.condition.body;
  const isWaiting = !attachedTo;

  const source = {
    type,
    condition,
    execute,
  };

  return source;

  function execute(executeMessage) {
    return isWaiting ? executeWait(executeMessage) : executeCatch(executeMessage);
  }

  function executeCatch(executeMessage) {
    const attachedToBroker = attachedTo.broker;
    const messageContent = cloneContent(executeMessage.content);

    const {executionId, index} = messageContent;
    messageContent.condition = condition;

    const apiConsumerTag = `_api-${executionId}_${index}`;
    const endConsumerTag = `_onend-${executionId}_${index}`;

    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {noAck: true, consumerTag: apiConsumerTag});

    debug(`<${executionId} (${id})> listen for end from <${attachedTo.id}>`);
    attachedToBroker.subscribeOnce('execution', 'execute.completed', onAttachedCompleted, {priority: 200, consumerTag: endConsumerTag});

    function onAttachedCompleted(routingKey, endMessage) {
      stop();

      const output = environment.resolveExpression(condition, endMessage);
      debug(`<${executionId} (${id})> condition from <${endMessage.content.executionId}> evaluated to`, !!output);

      if (output) {
        broker.publish('event', 'activity.condition', {
          ...cloneContent(messageContent),
          output,
        });

        broker.publish('execution', 'execute.completed', {
          ...messageContent,
          output,
        });
      }
    }

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;
      switch (messageType) {
        case 'discard': {
          stop();
          debug(`<${executionId} (${id})> discarded`);
          return broker.publish('execution', 'execute.discard', {...messageContent, state: 'discard'});
        }
        case 'stop': {
          stop();
          return debug(`<${executionId} (${id})> stopped`);
        }
      }
    }

    function stop() {
      attachedToBroker.cancel(endConsumerTag);
      broker.cancel(apiConsumerTag);
    }
  }

  function executeWait(executeMessage) {
    const messageContent = cloneContent(executeMessage.content);
    messageContent.condition = condition;
    const {executionId, parent} = messageContent;
    const parentExecutionId = parent && parent.executionId;

    if (evaluate(executeMessage)) return;

    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {noAck: true, consumerTag: `_api-${executionId}`});
    broker.subscribeTmp('api', `activity.signal.${parentExecutionId}`, onApiMessage, {noAck: true, consumerTag: `_parent-signal-${executionId}`});

    broker.publish('event', 'activity.wait', {...cloneContent(messageContent), executionId: parentExecutionId, parent: shiftParent(parent)});

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;
      switch (messageType) {
        case 'signal': {
          return evaluate({...executeMessage, message, state: 'signal'});
        }
        case 'discard': {
          stop();
          return broker.publish('execution', 'execute.discard', {...messageContent, state: 'discard'});
        }
        case 'stop': {
          stop();
          break;
        }
      }
    }

    function evaluate(message) {
      const output = environment.resolveExpression(condition, message);
      debug(`<${executionId} (${id})> condition evaluated to`, !!output);
      if (!output) return;

      broker.publish('event', 'activity.condition', {
        ...cloneContent(messageContent),
        output,
      });

      return broker.publish('execution', 'execute.completed', {...messageContent, output});
    }

    function stop() {
      broker.cancel(`_message-${executionId}`);
      broker.cancel(`_api-${executionId}`);
      broker.cancel(`_parent-signal-${executionId}`);
    }
  }
}
