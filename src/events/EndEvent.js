import { Activity } from '../activity/Activity.js';
import { EventDefinitionExecution } from '../eventDefinitions/EventDefinitionExecution.js';
import { cloneContent } from '../messageHelper.js';
import { K_EXECUTION } from '../constants.js';

/**
 * End event
 * @param {import('moddle-context-serializer').Activity} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function EndEvent(activityDef, context) {
  return new Activity(EndEventBehaviour, { ...activityDef, isThrowing: true }, context);
}

/**
 * End event behaviour
 * @param {import('#types').Activity} activity
 */
export function EndEventBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.broker = activity.broker;
  this[K_EXECUTION] = activity.eventDefinitions && new EventDefinitionExecution(activity, activity.eventDefinitions);
}

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
EndEventBehaviour.prototype.execute = function execute(executeMessage) {
  const execution = this[K_EXECUTION];
  if (execution) {
    return execution.execute(executeMessage);
  }

  return this.broker.publish('execution', 'execute.completed', cloneContent(executeMessage.content));
};
