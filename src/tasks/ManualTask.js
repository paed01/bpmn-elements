import { Activity } from '../activity/Activity.js';
import { SignalTaskBehaviour } from './SignalTask.js';

/**
 * Manual task
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function ManualTask(activityDef, context) {
  // @ts-ignore
  return new Activity(ManualTaskBehaviour, activityDef, context);
}

/**
 * Manual task behaviour
 *
 * Shares the signal task implementation but owns its own prototype so consumers
 * can override it without affecting `SignalTaskBehaviour` or its sibling behaviours.
 * @param {import('#types').Activity} activity
 */
export function ManualTaskBehaviour(activity) {
  SignalTaskBehaviour.call(this, activity);
}

ManualTaskBehaviour.prototype = Object.create(SignalTaskBehaviour.prototype);
ManualTaskBehaviour.prototype.constructor = ManualTaskBehaviour;
