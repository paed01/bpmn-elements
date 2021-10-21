import getPropertyValue from '../getPropertyValue';
import {brokerSafeId} from '../shared';
import {cloneContent, shiftParent} from '../messageHelper';

export default function MessageEventDefinition(activity, eventDefinition) {
  const {id, broker, environment, isStart, isThrowing} = activity;
  const {type = 'MessageEventDefinition', behaviour = {}} = eventDefinition;
  const {debug} = environment.Logger(type.toLowerCase());
  const reference = behaviour.messageRef || {name: 'anonymous'};
  const referenceElement = reference.id && activity.getActivityById(reference.id);
  const messageId = referenceElement ? referenceElement.id : 'anonymous';
  const messageQueueName = `message-${brokerSafeId(id)}-${brokerSafeId(messageId)}-q`;

  if (!isThrowing || isStart) setupCatch();

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
    if (parentExecutionId) broker.subscribeTmp('api', `activity.#.${parentExecutionId}`, onApiMessage, {noAck: true, consumerTag: `_api-parent-${executionId}`, priority: 400});
    broker.subscribeTmp('api', '#.signal.*', onCatchMessage, {noAck: true, consumerTag: `_api-delegated-${executionId}`});

    debug(`<${executionId} (${id})> expect ${description}`);

    broker.publish('event', 'activity.wait', {
      ...messageContent,
      executionId: parentExecutionId || executionId,
      parent: shiftParent(parent),
      message: {...referenceMessage},
    });

    function onCatchMessage(routingKey, message) {
      if (getPropertyValue(message, 'content.message.id') !== referenceMessage.id) return;

      const {type: messageType, correlationId} = message.properties;
      broker.publish('event', 'activity.consumed', cloneContent(messageContent, {message: {...message.content.message}}), {correlationId, type: messageType});

      complete('caught', message.content.message, {correlationId});
    }

    function onApiMessage(routingKey, message) {
      const {type: messageType, correlationId} = message.properties;
      switch (messageType) {
        case 'message':
        case 'signal': {
          return complete('got signal with', message.content.message, {correlationId});
        }
        case 'discard': {
          completed = true;
          stop();
          return broker.publish('execution', 'execute.discard', {...messageContent}, {correlationId});
        }
        case 'stop': {
          return stop();
        }
      }
    }

    function complete(verb, output, options) {
      completed = true;

      stop();

      debug(`<${executionId} (${id})> ${verb} ${description}`);
      broker.publish('event', 'activity.catch', {
        ...messageContent,
        message: {...output},
        executionId: parentExecutionId || executionId,
        parent: shiftParent(executeMessage.content.parent),
      }, {type: 'catch'});

      return broker.publish('execution', 'execute.completed', {...messageContent, output, state: 'catch'}, options);
    }

    function stop() {
      broker.cancel(`_onmessage-${executionId}`);
      broker.cancel(`_api-${executionId}`);
      broker.cancel(`_api-parent-${executionId}`);
      broker.cancel(`_api-delegated-${executionId}`);
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
      executionId: parentExecutionId || executionId,
      parent: shiftParent(parent),
      message: {...messageContent.input, ...referenceMessage},
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
