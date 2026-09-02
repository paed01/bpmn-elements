import { Activity } from '../activity/Activity.js';
import { ServiceTaskBehaviour } from './ServiceTask.js';

/**
 * Send task
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function SendTask(activityDef, context) {
  // @ts-ignore
  return new Activity(SendTaskBehaviour, activityDef, context);
}

/**
 * Send task behaviour
 *
 * Shares the service task implementation but owns its own prototype so consumers
 * can override it without affecting `ServiceTaskBehaviour` or its sibling behaviours.
 * @param {import('#types').Activity} activity
 */
export function SendTaskBehaviour(activity) {
  ServiceTaskBehaviour.call(this, activity);
}

SendTaskBehaviour.prototype = Object.create(ServiceTaskBehaviour.prototype);
SendTaskBehaviour.prototype.constructor = SendTaskBehaviour;
