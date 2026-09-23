import { ConvergingGateway, ConvergingGatewayBehaviour } from './ConvergingGateway.js';

/**
 * Inclusive gateway
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function InclusiveGateway(activityDef, context) {
  return ConvergingGateway(InclusiveGatewayBehaviour, activityDef, context);
}

/**
 * Inclusive gateway behaviour
 *
 * Converges by awaiting the upstream peers that were actually activated and requires at least one
 * conditional or default outbound flow to be taken on completion.
 * @param {import('#types').Activity} activity
 */
export function InclusiveGatewayBehaviour(activity) {
  ConvergingGatewayBehaviour.call(this, activity);
}

InclusiveGatewayBehaviour.prototype = Object.create(ConvergingGatewayBehaviour.prototype);
InclusiveGatewayBehaviour.prototype.constructor = InclusiveGatewayBehaviour;

/**
 * Completed execute message content requiring an outbound flow to be taken
 * @returns {import('#types').ElementMessageContent}
 */
InclusiveGatewayBehaviour.prototype._getCompletedContent = function getCompletedContent() {
  const content = ConvergingGatewayBehaviour.prototype._getCompletedContent.call(this);
  content.requireOutbound = true;
  return content;
};
