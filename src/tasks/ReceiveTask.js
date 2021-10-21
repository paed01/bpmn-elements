import Activity from '../activity/Activity';
import {cloneContent} from '../messageHelper';

export default function ReceiveTask(activityDef, context) {
  const task = new Activity(ReceiveTaskBehaviour, activityDef, context);

  task.broker.assertQueue('message', {autoDelete: false, durable: true});
  task.broker.bindQueue('message', 'api', '*.message.#', {durable: true});

  return task;
}

export function ReceiveTaskBehaviour(activity) {
  const {id, type, broker, logger, behaviour = {}} = activity;
  const reference = behaviour.messageRef || {name: 'anonymous'};

  const referenceElement = reference.id && activity.getActivityById(reference.id);
  const loopCharacteristics = behaviour.loopCharacteristics && behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);

  const source = {
    id,
    type,
    reference: {...reference, referenceType: 'message'},
    execute,
  };

  return source;

  function execute(executeMessage) {
    const content = executeMessage.content;
    const {executionId} = content;

    if (content.isRootScope) setupMessageHandling(executionId);
    if (loopCharacteristics && content.isRootScope) {
      return loopCharacteristics.execute(executeMessage);
    }

    let completed;

    const {message: referenceMessage, description} = resolveReference(executeMessage);
    broker.consume('message', onCatchMessage, {noAck: true, consumerTag: `_onmessage-${executionId}`});

    if (completed) return;

    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {noAck: true, consumerTag: `_api-${executionId}`, priority: 400});

    logger.debug(`<${executionId} (${id})> expect ${description}`);

    broker.publish('event', 'activity.wait', cloneContent(content, {message: {...referenceMessage}}));

    function onCatchMessage(routingKey, message) {
      const {content: delegateContent} = message;

      const {id: signalId, executionId: signalExecutionId} = delegateContent.message || {};
      if (!referenceMessage.id && signalId || signalExecutionId) {
        if (loopCharacteristics && signalExecutionId !== executionId) return;
        if (signalId !== id && signalExecutionId !== executionId) return;
        logger.debug(`<${executionId} (${id})> caught direct message`);
      } else if (referenceMessage.id !== signalId) return;
      else {
        logger.debug(`<${executionId} (${id})> caught ${description}`);
      }

      const {type: messageType, correlationId} = message.properties;
      broker.publish('event', 'activity.consumed', cloneContent(content, {message: {...message.content.message}}), {correlationId, type: messageType});
      broker.publish('event', 'activity.catch', cloneContent(content, {message: message.content.message}), {type: 'catch', correlationId});

      complete(message.content.message, {correlationId});
    }

    function onApiMessage(routingKey, message) {
      const {type: messageType, correlationId} = message.properties;
      switch (messageType) {
        case 'message':
        case 'signal': {
          return complete(message.content.message, {correlationId});
        }
        case 'discard': {
          completed = true;
          stop();
          return broker.publish('execution', 'execute.discard', cloneContent(content), {correlationId});
        }
        case 'stop': {
          return stop();
        }
      }
    }

    function complete(output, options) {
      completed = true;
      stop();
      return broker.publish('execution', 'execute.completed', cloneContent(content, {output}), options);
    }

    function stop() {
      broker.cancel(`_onmessage-${executionId}`);
      broker.cancel(`_api-${executionId}`);
    }
  }

  function setupMessageHandling(executionId) {
    broker.subscribeTmp('api', '#.signal.*', onDelegateMessage, {noAck: true, consumerTag: `_api-delegated-${executionId}`}, {noAck: true});
    broker.subscribeTmp('api', `activity.stop.${executionId}`, onStopApiMessage, {noAck: true, consumerTag: `_api-stop-${executionId}`, priority: 400});
    broker.subscribeTmp('execution', 'execute.#', onComplete, {noAck: true, consumerTag: `_execution-complete-${executionId}`}, {noAck: true});

    function onDelegateMessage(_, message) {
      if (!message.properties.delegate) return;
      broker.sendToQueue('message', message.content, message.properties);
    }

    function onStopApiMessage() {
      stop(true);
    }

    function onComplete(routingKey, {content}) {
      if (!content.isRootScope) return;
      switch (routingKey) {
        case 'execute.completed':
        case 'execute.error':
        case 'execute.discard':
          stop();
          break;
      }
    }

    function stop(keepMessageQ) {
      broker.cancel(`_api-delegated-${executionId}`);
      broker.cancel(`_api-stop-${executionId}`);
      broker.cancel(`_execution-complete-${executionId}`);
      if (!keepMessageQ) broker.purgeQueue('message');
    }
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
}
