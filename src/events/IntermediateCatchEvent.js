import { Activity } from '../activity/Activity.js';
import { EventDefinitionExecution } from '../eventDefinitions/EventDefinitionExecution.js';
import { cloneContent } from '../messageHelper.js';
import { K_EXECUTION } from '../constants.js';

/**
 * Intermediate catch event
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function IntermediateCatchEvent(activityDef, context) {
  return new Activity(
    IntermediateCatchEventBehaviour,
    { ...activityDef, isCatching: true, ...context.getLinkEventDefinitionInfo(activityDef) },
    context
  );
}

/**
 * Intermediate catch event behaviour
 * @param {import('#types').Activity} activity
 */
export function IntermediateCatchEventBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.broker = activity.broker;
  /** @internal */
  this[K_EXECUTION] = activity.eventDefinitions && new EventDefinitionExecution(activity, activity.eventDefinitions);
}

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
IntermediateCatchEventBehaviour.prototype.execute = function execute(executeMessage) {
  const execution = this[K_EXECUTION];
  if (execution) {
    return execution.execute(executeMessage);
  }

  const executeContent = executeMessage.content;
  const executionId = executeContent.executionId;
  const broker = this.broker;
  broker.subscribeTmp('api', `activity.#.${executionId}`, this._onApiMessage.bind(this, executeMessage), {
    noAck: true,
    consumerTag: '_api-behaviour-execution',
  });

  // @ts-ignore
  return broker.publish('event', 'activity.wait', cloneContent(executeContent));
};

IntermediateCatchEventBehaviour.prototype._onApiMessage = function onApiMessage(executeMessage, _routingKey, message) {
  switch (message.properties.type) {
    case 'message':
    case 'signal': {
      const broker = this.broker;
      broker.cancel('_api-behaviour-execution');
      return broker.publish(
        'execution',
        'execute.completed',
        cloneContent(executeMessage.content, {
          output: message.content.message,
        })
      );
    }
    case 'discard': {
      const broker = this.broker;
      broker.cancel('_api-behaviour-execution');
      return broker.publish('execution', 'execute.discard', cloneContent(executeMessage.content));
    }
    case 'stop': {
      return this.broker.cancel('_api-behaviour-execution');
    }
  }
};
