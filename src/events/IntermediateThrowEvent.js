import { Activity } from '../activity/Activity.js';
import { EventDefinitionExecution } from '../eventDefinitions/EventDefinitionExecution.js';
import { cloneContent } from '../messageHelper.js';
import { K_EXECUTION } from '../constants.js';

/**
 * Intermediate throw event
 * @param {import('moddle-context-serializer').Activity} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function IntermediateThrowEvent(activityDef, context) {
  return new Activity(
    IntermediateThrowEventBehaviour,
    { ...activityDef, isThrowing: true, ...context.getLinkEventDefinitionInfo(activityDef) },
    context
  );
}

/**
 * Intermediate throw event behaviour
 * @param {import('#types').Activity} activity
 */
export function IntermediateThrowEventBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.broker = activity.broker;
  this[K_EXECUTION] = activity.eventDefinitions && new EventDefinitionExecution(activity, activity.eventDefinitions);
}

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
IntermediateThrowEventBehaviour.prototype.execute = function execute(executeMessage) {
  const execution = this[K_EXECUTION];
  if (execution) {
    return execution.execute(executeMessage);
  }

  return this.broker.publish('execution', 'execute.completed', cloneContent(executeMessage.content));
};
