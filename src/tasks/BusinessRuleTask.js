import { Activity } from '../activity/Activity.js';
import { ServiceTaskBehaviour } from './ServiceTask.js';

/**
 * Business rule task
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function BusinessRuleTask(activityDef, context) {
  // @ts-ignore
  return new Activity(BusinessRuleTaskBehaviour, activityDef, context);
}

/**
 * Business rule task behaviour
 *
 * Shares the service task implementation but owns its own prototype so consumers
 * can override it without affecting `ServiceTaskBehaviour` or its sibling behaviours.
 * @param {import('#types').Activity} activity
 */
export function BusinessRuleTaskBehaviour(activity) {
  ServiceTaskBehaviour.call(this, activity);
}

BusinessRuleTaskBehaviour.prototype = Object.create(ServiceTaskBehaviour.prototype);
BusinessRuleTaskBehaviour.prototype.constructor = BusinessRuleTaskBehaviour;
