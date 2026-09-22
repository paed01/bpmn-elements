import { ConvergingGateway, ParallelGatewayBehaviour } from './ParallelGateway.js';

/**
 * Inclusive gateway behaviour
 *
 * Converges like the parallel gateway, awaiting the upstream peers that were actually activated, but requires
 * at least one conditional or default outbound flow to be taken on completion.
 */
export class InclusiveGatewayBehaviour extends ParallelGatewayBehaviour {
  /**
   * @param {import('#types').Activity} activity
   */
  constructor(activity) {
    super(activity);
  }

  /**
   * Completed execute message content requiring an outbound flow to be taken
   * @returns {import('#types').ElementMessageContent}
   */
  _getCompletedContent() {
    const content = super._getCompletedContent();
    content.requireOutbound = true;
    return content;
  }
}

/**
 * Inclusive gateway
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function InclusiveGateway(activityDef, context) {
  return ConvergingGateway(InclusiveGatewayBehaviour, activityDef, context);
}
