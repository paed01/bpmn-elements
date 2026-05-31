import { Activity } from '../activity/Activity.js';
import { cloneContent } from '../messageHelper.js';

/**
 * Task
 * @param {import('moddle-context-serializer').Activity} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function Task(activityDef, context) {
  return new Activity(TaskBehaviour, activityDef, context);
}

/**
 * Task behaviour
 * @param {import('#types').Activity} activity
 */
export function TaskBehaviour(activity) {
  const { id, type, behaviour, broker } = activity;
  this.id = id;
  this.type = type;
  /** @type {import('./LoopCharacteristics.js').LoopCharacteristics | undefined} */
  this.loopCharacteristics =
    behaviour.loopCharacteristics && new behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  this.broker = broker;
}

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
TaskBehaviour.prototype.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;
  const loopCharacteristics = this.loopCharacteristics;
  if (loopCharacteristics && executeContent.isRootScope) {
    return loopCharacteristics.execute(executeMessage);
  }

  return this.broker.publish('execution', 'execute.completed', cloneContent(executeContent));
};
