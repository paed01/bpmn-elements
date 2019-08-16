import getPropertyValue from '../getPropertyValue';
import {brokerSafeId} from '../shared';
import {cloneContent, shiftParent} from '../messageHelper';

export default function LinkEventDefinition(activity, eventDefinition) {
  const {id, broker, environment, isThrowing} = activity;
  const {type} = eventDefinition;
  const {debug} = environment.Logger(type.toLowerCase());
  const reference = {linkName: eventDefinition.behaviour.name};
  const linkQueueName = `link-${brokerSafeId(id)}-${brokerSafeId(reference.linkName)}-q`;

  if (!isThrowing) setupCatch();
  else setupThrow();

  const source = {
    id,
    type,
    reference: {...reference, referenceType: 'link'},
    execute: isThrowing ? executeThrow : executeCatch,
  };

  return source;

  function executeCatch(executeMessage) {
    let completed;

    const messageContent = cloneContent(executeMessage.content);
    const {executionId, parent} = messageContent;
    const parentExecutionId = parent && parent.executionId;

    const description = messageDescription();
    broker.consume(linkQueueName, onCatchLink, {noAck: true, consumerTag: `_api-link-${executionId}`});

    if (completed) return;

    broker.subscribeTmp('api', `activity.stop.${parentExecutionId}`, onApiMessage, {noAck: true, consumerTag: `_api-parent-${parentExecutionId}`});
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {noAck: true, consumerTag: `_api-${executionId}`});

    debug(`<${executionId} (${id})> expect ${description}`);

    broker.publish('event', 'activity.wait', {
      ...messageContent,
      executionId: parentExecutionId,
      parent: shiftParent(parent),
      link: {...reference},
    });

    function onCatchLink(routingKey, message) {
      if (getPropertyValue(message, 'content.message.linkName') !== reference.linkName) return;
      if (message.content.state === 'discard') return discard();
      return complete('caught', message.content.message);
    }

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;

      switch (messageType) {
        case 'link': {
          return complete('got link with', message.content.message);
        }
        case 'discard': {
          return discard();
        }
        case 'stop': {
          stop();
          break;
        }
      }
    }

    function complete(verb, output) {
      completed = true;

      stop();

      debug(`<${executionId} (${id})> ${verb} ${description}`);

      broker.publish('event', 'activity.catch', {
        ...messageContent,
        link: {...reference},
        message: {...output},
        executionId: parentExecutionId || executionId,
        parent: shiftParent(executeMessage.content.parent),
      }, {type: 'catch'});

      return broker.publish('execution', 'execute.completed', {...messageContent, output, state: 'catch'});
    }

    function discard() {
      completed = true;
      stop();
      return broker.publish('execution', 'execute.discard', {...messageContent});
    }

    function stop() {
      broker.cancel(`_api-link-${executionId}`);
      broker.cancel(`_api-parent-${parentExecutionId}`);
      broker.cancel(`_api-${executionId}`);
      broker.purgeQueue(linkQueueName);
    }
  }

  function executeThrow(executeMessage) {
    const messageContent = cloneContent(executeMessage.content);
    const {executionId, parent} = messageContent;
    const parentExecutionId = parent && parent.executionId;

    const description = messageDescription();

    debug(`<${executionId} (${id})> throw ${description}`);

    broker.publish('event', 'activity.link', {
      ...cloneContent(messageContent),
      executionId: parentExecutionId,
      parent: shiftParent(parent),
      message: {...reference},
      state: 'throw',
    }, {type: 'link', delegate: true});

    return broker.publish('execution', 'execute.completed', messageContent);
  }

  function messageDescription() {
    return `link ${reference.linkName}`;
  }

  function setupCatch() {
    broker.assertQueue(linkQueueName, {autoDelete: false, durable: true});
    broker.bindQueue(linkQueueName, 'api', '*.link.#', {durable: true});
  }

  function setupThrow() {
    broker.subscribeTmp('event', 'activity.discard', onDiscard, {noAck: true, consumerTag: '_link-parent-discard'});

    function onDiscard(_, message) {
      broker.publish('event', 'activity.link.discard', {
        ...cloneContent(message.content),
        message: {...reference},
        state: 'discard',
      }, {type: 'link', delegate: true});
    }
  }
}
