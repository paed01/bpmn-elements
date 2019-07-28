import getPropertyValue from '../getPropertyValue';
import {brokerSafeId} from '../shared';
import {cloneContent, shiftParent} from '../messageHelper';

export default function EscalationEventDefinition(activity, eventDefinition) {
  const {id, broker, environment, isThrowing, getActivityById} = activity;
  const {type, behaviour = {}} = eventDefinition;
  const {debug} = environment.Logger(type.toLowerCase());
  const reference = behaviour.escalationRef || {name: 'anonymous'};
  const referenceElement = reference.id && getActivityById(reference.id);
  const escalationId = referenceElement ? referenceElement.id : 'anonymous';
  const escalationQueueName = `escalate-${brokerSafeId(id)}-${brokerSafeId(escalationId)}-q`;

  if (!isThrowing) setupCatch();

  const source = {
    id,
    type,
    reference: {...reference, referenceType: 'escalate'},
    execute: isThrowing ? executeThrow : executeCatch,
  };

  return source;

  function executeCatch(executeMessage) {
    let completed;

    const messageContent = cloneContent(executeMessage.content);
    const {executionId, parent} = messageContent;
    const parentExecutionId = parent && parent.executionId;

    const {message: referenceMessage, description} = resolveMessage(executeMessage);
    broker.consume(escalationQueueName, onEscalationApiMessage, {noAck: true, consumerTag: `_onescalate-${executionId}`});

    if (completed) return;

    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {noAck: true, consumerTag: `_api-${executionId}`});

    if (completed) return stop();

    debug(`<${executionId} (${id})> expect ${description}`);

    broker.publish('event', 'activity.wait', {
      ...messageContent,
      executionId: parentExecutionId,
      parent: shiftParent(parent),
      escalation: {...referenceMessage},
    });

    function onEscalationApiMessage(routingKey, message) {
      if (getPropertyValue(message, 'content.message.id') !== referenceMessage.id) return;

      const output = message.content.message;
      completed = true;

      stop();

      debug(`<${executionId} (${id})> caught ${description}`);
      broker.publish('event', 'activity.catch', {
        ...messageContent,
        message: {...output},
        executionId: parentExecutionId,
        parent: shiftParent(executeMessage.content.parent),
      }, {type: 'catch'});

      return broker.publish('execution', 'execute.completed', {...messageContent, output, state: 'catch'});
    }

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;

      switch (messageType) {
        case 'escalate': {
          return onEscalationApiMessage(routingKey, message);
        }
        case 'discard': {
          completed = true;
          stop();
          return broker.publish('execution', 'execute.discard', {...messageContent});
        }
        case 'stop': {
          stop();
          break;
        }
      }
    }

    function stop() {
      broker.cancel(`_api-${executionId}`);
      broker.cancel(`_onescalate-${executionId}`);
    }
  }

  function executeThrow(executeMessage) {
    const messageContent = cloneContent(executeMessage.content);
    const {executionId, parent} = messageContent;
    const parentExecutionId = parent && parent.executionId;

    const {message: referenceMessage, description} = resolveMessage(executeMessage);

    debug(`<${executionId} (${id})> escalate ${description}`);

    broker.publish('event', 'activity.escalate', {
      ...cloneContent(messageContent),
      executionId: parentExecutionId,
      parent: shiftParent(parent),
      message: {...referenceMessage},
      state: 'throw',
    }, {type: 'escalate', delegate: true});

    return broker.publish('execution', 'execute.completed', {...messageContent});
  }

  function resolveMessage(message) {
    if (!referenceElement) {
      return {
        message: {...reference},
        description: 'anonymous escalation',
      };
    }

    const result = {
      message: referenceElement.resolve(message),
    };

    result.description = `${result.message.name} <${result.message.id}>`;

    return result;
  }

  function setupCatch() {
    broker.assertQueue(escalationQueueName, {autoDelete: false, durable: true});
    broker.bindQueue(escalationQueueName, 'api', '*.escalate.#', {durable: true, priority: 400});
  }
}
