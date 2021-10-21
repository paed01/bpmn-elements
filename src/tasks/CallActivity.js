import Activity from '../activity/Activity';
import {ActivityError} from '../error/Errors';
import {cloneContent} from '../messageHelper';

export default function CallActivity(activityDef, context) {
  return new Activity(CallActivityBehaviour, activityDef, context);
}

export function CallActivityBehaviour(activity) {
  const {id, type, behaviour, environment, broker} = activity;
  const loopCharacteristics = behaviour.loopCharacteristics && behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);

  const source = {
    id,
    type,
    loopCharacteristics,
    execute,
  };

  return source;

  function execute(executeMessage) {
    const content = executeMessage.content;
    if (loopCharacteristics && content.isRootScope) {
      return loopCharacteristics.execute(executeMessage);
    }

    const {executionId} = content;

    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {noAck: true, consumerTag: `_api-${executionId}`});
    broker.subscribeTmp('api', '#.signal.*', onDelegatedApiMessage, {noAck: true, consumerTag: `_api-delegated-${executionId}`});

    try {
      var calledElement = environment.resolveExpression(behaviour.calledElement); // eslint-disable-line no-var
    } catch (err) {
      return broker.publish('execution', 'execute.error', cloneContent(content, {error: new ActivityError(err.message, executeMessage, err)}, {mandatory: true}));
    }

    broker.publish('event', 'activity.call', cloneContent(content, {state: 'wait', calledElement}), {type: 'call'});

    function onDelegatedApiMessage(routingKey, message) {
      if (!message.properties.delegate) return;
      const {content: delegateContent} = message;
      if (!delegateContent || !delegateContent.message) return;

      const {id: signalId, executionId: signalExecutionId} = delegateContent.message;
      if (loopCharacteristics && signalExecutionId !== executionId) return;
      if (signalId !== id && signalExecutionId !== executionId) return;

      const {type: messageType, correlationId} = message.properties;
      broker.publish('event', 'activity.consumed', cloneContent(content, {message: {...delegateContent.message}}), {correlationId, type: messageType});
      return onApiMessage(routingKey, message);
    }

    function onApiMessage(routingKey, message) {
      const {type: messageType, correlationId} = message.properties;

      switch (messageType) {
        case 'stop':
          return stop();
        case 'cancel':
          broker.publish('event', 'activity.call.cancel', cloneContent(content, {state: 'cancel', calledElement}), {type: 'cancel'});
        case 'signal':
          stop();
          return broker.publish('execution', 'execute.completed', cloneContent(content, {output: message.content.message, state: messageType}), {correlationId});
        case 'error':
          stop();
          return broker.publish('execution', 'execute.error', cloneContent(content, {error: new ActivityError(message.content.message, executeMessage, message.content)}, {mandatory: true, correlationId}));
        case 'discard':
          stop();
          return broker.publish('execution', 'execute.discard', cloneContent(content), {correlationId});
      }
    }

    function stop() {
      broker.cancel(`_api-${executionId}`);
      broker.cancel(`_api-delegated-${executionId}`);
    }
  }
}
