import { Activity } from '../activity/Activity.js';
import { SignalTaskBehaviour } from './SignalTask.js';

/**
 * User task
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function UserTask(activityDef, context) {
  // @ts-ignore
  return new Activity(UserTaskBehaviour, activityDef, context);
}

/**
 * User task behaviour
 *
 * Shares the signal task implementation but owns its own prototype so consumers
 * can override it without affecting `SignalTaskBehaviour` or its sibling behaviours.
 * @param {import('#types').Activity} activity
 */
export function UserTaskBehaviour(activity) {
  SignalTaskBehaviour.call(this, activity);
}

UserTaskBehaviour.prototype = Object.create(SignalTaskBehaviour.prototype);
UserTaskBehaviour.prototype.constructor = UserTaskBehaviour;
