import { Activity } from '../activity/Activity.js';
import { cloneContent } from '../messageHelper.js';

/**
 * Inclusive gateway
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function InclusiveGateway(activityDef, context) {
  return new Activity(InclusiveGatewayBehaviour, activityDef, context);
}

/**
 * Inclusive gateway behaviour
 * @param {import('#types').Activity} activity
 */
export function InclusiveGatewayBehaviour(activity) {
  const { id, type, broker } = activity;
  this.id = id;
  this.type = type;
  this.broker = broker;
}

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
InclusiveGatewayBehaviour.prototype.execute = function execute({ content }) {
  this.broker.publish('execution', 'execute.completed', cloneContent(content, { requireOutbound: true }));
};
