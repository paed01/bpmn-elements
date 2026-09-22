"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.InclusiveGateway = InclusiveGateway;
exports.InclusiveGatewayBehaviour = void 0;
var _ParallelGateway = require("./ParallelGateway.js");
/**
 * Inclusive gateway behaviour
 *
 * Converges like the parallel gateway, awaiting the upstream peers that were actually activated, but requires
 * at least one conditional or default outbound flow to be taken on completion.
 */
class InclusiveGatewayBehaviour extends _ParallelGateway.ParallelGatewayBehaviour {
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
exports.InclusiveGatewayBehaviour = InclusiveGatewayBehaviour;
function InclusiveGateway(activityDef, context) {
  return (0, _ParallelGateway.ConvergingGateway)(InclusiveGatewayBehaviour, activityDef, context);
}