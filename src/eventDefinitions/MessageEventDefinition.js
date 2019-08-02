import getPropertyValue from '../getPropertyValue';
import {brokerSafeId} from '../shared';
import {cloneContent, shiftParent} from '../messageHelper';

export default function MessageEventDefinition(activity, eventDefinition) {
  const {id, broker, environment, isThrowing, getActivityById} = activity;
  const {type = 'MessageEventDefinition', behaviour = {}} = eventDefinition;
  const {debug} = environment.Logger(type.toLowerCase());
  const reference = behaviour.messageRef || {name: 'anonymous'};
  const referenceElement = reference.id && getActivityById(reference.id);
  const messageId = referenceElement ? referenceElement.id : 'anonymous';
  const messageQueueName = `message-${brokerSafeId(id)}-${brokerSafeId(messageId)}-q`;

  if (!isThrowing) setupCatch();

  const source = {
    id,
    type,
    reference: {...reference, referenceType: 'message'},
    execute: isThrowing ? executeThrow : executeCatch,
  };

  return source;

  function executeCatch(executeMessage) {
    let completed;

    const messageContent = cloneContent(executeMessage.content);
    const {executionId, parent} = messageContent;
    const parentExecutionId = parent && parent.executionId;

    const {message: referenceMessage, description} = resolveReference(executeMessage);
    broker.consume(messageQueueName, onCatchMessage, {noAck: true, consumerTag: `_onmessage-${executionId}`});

    if (completed) return;

    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {noAck: true, consumerTag: `_api-${executionId}`, priority: 400});
    broker.subscribeTmp('api', `activity.#.${parentExecutionId}`, onApiMessage, {noAck: true, consumerTag: `_api-parent-${executionId}`, priority: 400});

    debug(`<${executionId} (${id})> expect ${description}`);

    broker.publish('event', 'activity.wait', {
      ...messageContent,
      executionId: parentExecutionId,
      parent: shiftParent(parent),
      message: {...referenceMessage},
    });

    function onCatchMessage(routingKey, message) {
      if (getPropertyValue(message, 'content.message.id') !== referenceMessage.id) return;
      complete('caught', message.content.message);
    }

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;
      switch (messageType) {
        case 'message':
        case 'signal': {
          return complete('got signal with', message.content.message);
        }
        case 'discard': {
          completed = true;
          stop();
          return broker.publish('execution', 'execute.discard', {...messageContent});
        }
        case 'stop': {
          return stop();
        }
      }
    }

    function complete(verb, output) {
      completed = true;

      stop();

      debug(`<${executionId} (${id})> ${verb} ${description}`);
      broker.publish('event', 'activity.catch', {
        ...messageContent,
        message: {...output},
        executionId: parentExecutionId,
        parent: shiftParent(executeMessage.content.parent),
      }, {type: 'catch'});

      return broker.publish('execution', 'execute.completed', {...messageContent, output, state: 'catch'});
    }

    function stop() {
      broker.cancel(`_onmessage-${executionId}`);
      broker.cancel(`_api-${executionId}`);
      broker.cancel(`_api-parent-${executionId}`);
      broker.purgeQueue(messageQueueName);
    }
  }

  function executeThrow(executeMessage) {
    const messageContent = cloneContent(executeMessage.content);
    const {executionId, parent} = messageContent;
    const parentExecutionId = parent && parent.executionId;

    const {message: referenceMessage, description} = resolveReference(executeMessage);

    debug(`<${executionId} (${id})> message ${description}`);

    broker.publish('event', 'activity.message', {
      ...cloneContent(messageContent),
      executionId: parentExecutionId,
      parent: shiftParent(parent),
      message: {...referenceMessage},
      state: 'throw',
    }, {type: 'message', delegate: true});

    return broker.publish('execution', 'execute.completed', {...messageContent});
  }

  function resolveReference(message) {
    if (!referenceElement) {
      return {
        message: {...reference},
        description: 'anonymous message',
      };
    }

    const result = {
      message: referenceElement.resolve(message),
    };

    result.description = `${result.message.name} <${result.message.id}>`;

    return result;
  }

  function setupCatch() {
    broker.assertQueue(messageQueueName, {autoDelete: false, durable: true});
    broker.bindQueue(messageQueueName, 'api', '*.message.#', {durable: true});
  }
}
