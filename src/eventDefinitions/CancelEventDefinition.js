import {brokerSafeId} from '../shared';
import {cloneContent, shiftParent} from '../messageHelper';

export default function CancelEventDefinition(activity, eventDefinition) {
  const {id, broker, environment, isThrowing} = activity;
  const {type} = eventDefinition;
  const {debug} = environment.Logger(type.toLowerCase());
  const cancelQueueName = `cancel-${brokerSafeId(id)}-q`;

  if (!isThrowing) setupCatch();

  const source = {
    id,
    type,
    reference: {referenceType: 'cancel'},
    execute: isThrowing ? executeThrow : executeCatch,
  };

  return source;

  function executeCatch(executeMessage) {
    let completed;

    const messageContent = cloneContent(executeMessage.content);
    const {executionId, parent, attachedTo} = messageContent;
    const parentExecutionId = parent && parent.executionId;

    broker.consume(cancelQueueName, onCatchMessage, {noAck: true, consumerTag: `_oncancel-${executionId}`});

    if (completed) return;

    broker.subscribeTmp('api', `activity.#.${parentExecutionId}`, onApiMessage, {noAck: true, consumerTag: `_api-parent-${parentExecutionId}`});
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {noAck: true, consumerTag: `_api-${executionId}`});

    debug(`<${executionId} (${id})> expect cancel`);

    const exchangeKey = `execute.canceled.${executionId}`;
    broker.subscribeOnce('execution', exchangeKey, onCatchMessage, {consumerTag: `_onattached-cancel-${executionId}`});
    broker.publish('execution', 'execute.expect', cloneContent(messageContent, {
      pattern: '#.cancel',
      exchange: 'execution',
      exchangeKey,
    }));

    function onCatchMessage(_, message) {
      if (message.content && message.content.isTransaction) return onCancelTransaction(_, message);

      debug(`<${executionId} (${id})> cancel caught from <${message.content.id}>`);
      return complete(message.content.message);
    }

    function onCancelTransaction(_, message) {
      broker.cancel(`_oncancel-${executionId}`);

      debug(`<${executionId} (${id})> cancel transaction thrown by <${message.content.id}>`);

      broker.assertExchange('cancel', 'topic');
      broker.publish('execution', 'execute.detach', cloneContent(messageContent, {
        pattern: '#',
        bindExchange: 'cancel',
        sourceExchange: 'event',
        sourcePattern: '#',
      }));

      broker.publish('event', 'activity.compensate', cloneContent(message.content, {
        state: 'throw',
      }), {type: 'compensate', delegate: true});

      broker.subscribeTmp('cancel', 'activity.leave', (__, {content: msg}) => {
        if (msg.id !== attachedTo) return;
        return complete(message.content.message);
      }, {noAck: true, consumerTag: `_oncancelend-${executionId}`});
    }

    function complete(output) {
      completed = true;
      stop();
      debug(`<${executionId} (${id})> completed`);
      return broker.publish('execution', 'execute.completed', {...messageContent, output, state: 'cancel'});
    }

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;
      switch (messageType) {
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
      broker.cancel(`_api-parent-${parentExecutionId}`);
      broker.cancel(`_api-${executionId}`);
      broker.cancel(`_oncancel-${executionId}`);
      broker.cancel(`_oncancelend-${executionId}`);
      broker.cancel(`_onattached-cancel-${executionId}`);
      broker.purgeQueue(cancelQueueName);
    }
  }

  function executeThrow(executeMessage) {
    const {isTransaction} = environment.variables.content || {};
    const messageContent = cloneContent(executeMessage.content);
    const {executionId, parent} = messageContent;
    const parentExecutionId = parent && parent.executionId;

    debug(`<${executionId} (${id})> throw cancel${isTransaction ? ' transaction' : ''}`);

    broker.publish('event', 'activity.cancel', {
      ...cloneContent(messageContent),
      isTransaction,
      executionId: parentExecutionId,
      parent: shiftParent(parent),
      state: 'throw',
    }, {type: 'cancel', delegate: isTransaction});

    return broker.publish('execution', 'execute.completed', {...messageContent});
  }

  function setupCatch() {
    broker.assertQueue(cancelQueueName, {autoDelete: false, durable: true});
    broker.bindQueue(cancelQueueName, 'api', '*.cancel.#', {durable: true, priority: 400});
  }
}
