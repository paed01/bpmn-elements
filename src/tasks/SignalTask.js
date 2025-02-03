import Activity from '../activity/Activity.js';
import { ActivityError } from '../error/Errors.js';
import { cloneContent } from '../messageHelper.js';

export default function SignalTask(activityDef, context) {
  return new Activity(SignalTaskBehaviour, activityDef, context);
}

export function SignalTaskBehaviour(activity) {
  const { id, type, behaviour } = activity;

  this.id = id;
  this.type = type;
  this.loopCharacteristics =
    behaviour.loopCharacteristics && new behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  this.activity = activity;
  this.broker = activity.broker;
}

SignalTaskBehaviour.prototype.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;
  const loopCharacteristics = this.loopCharacteristics;
  if (loopCharacteristics && executeContent.isRootScope) {
    return loopCharacteristics.execute(executeMessage);
  }

  const executionId = executeContent.executionId;

  const broker = this.broker;
  broker.subscribeTmp('api', `activity.#.${executionId}`, (...args) => this._onApiMessage(executeMessage, ...args), {
    noAck: true,
    consumerTag: `_api-${executionId}`,
  });
  broker.subscribeTmp('api', '#.signal.*', (...args) => this._onDelegatedApiMessage(executeMessage, ...args), {
    noAck: true,
    consumerTag: `_api-delegated-${executionId}`,
  });
  broker.publish('event', 'activity.wait', cloneContent(executeContent, { state: 'wait' }));
};

SignalTaskBehaviour.prototype._onDelegatedApiMessage = function onDelegatedApiMessage(executeMessage, routingKey, message) {
  if (!message.properties.delegate) return;

  const { content: delegateContent } = message;
  if (!delegateContent || !delegateContent.message) return;

  const executeContent = executeMessage.content;
  const { id: signalId, executionId: signalExecutionId } = delegateContent.message;
  if (this.loopCharacteristics && signalExecutionId !== executeContent.executionId) return;
  if (signalId !== this.id && signalExecutionId !== executeContent.executionId) return;

  const { type: messageType, correlationId } = message.properties;
  this.broker.publish(
    'event',
    'activity.consumed',
    cloneContent(executeContent, {
      message: { ...delegateContent.message },
    }),
    {
      correlationId,
      type: messageType,
    }
  );

  return this._onApiMessage(executeMessage, routingKey, message);
};

SignalTaskBehaviour.prototype._onApiMessage = function onApiMessage(executeMessage, routingKey, message) {
  const { type: messageType, correlationId } = message.properties;
  const executeContent = executeMessage.content;
  switch (messageType) {
    case 'stop':
      return this._stop(executeContent.executionId);
    case 'signal':
      this._stop(executeContent.executionId);
      return this.broker.publish(
        'execution',
        'execute.completed',
        cloneContent(executeContent, {
          output: message.content.message,
          state: 'signal',
        }),
        {
          correlationId,
        }
      );
    case 'error':
      this._stop(executeContent.executionId);
      return this.broker.publish(
        'execution',
        'execute.error',
        cloneContent(
          executeContent,
          {
            error: new ActivityError(message.content.message, executeMessage, message.content),
          },
          {
            mandatory: true,
            correlationId,
          }
        )
      );
    case 'discard':
      this._stop(executeContent.executionId);
      return this.broker.publish('execution', 'execute.discard', cloneContent(executeContent), { correlationId });
  }
};

SignalTaskBehaviour.prototype._stop = function stop(executionId) {
  const broker = this.broker;
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_api-delegated-${executionId}`);
};
