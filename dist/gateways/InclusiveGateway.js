"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.InclusiveGateway = InclusiveGateway;
exports.InclusiveGatewayBehaviour = InclusiveGatewayBehaviour;
var _ConvergingGateway = require("./ConvergingGateway.js");
/**
 * Inclusive gateway
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
function InclusiveGateway(activityDef, context) {
  return (0, _ConvergingGateway.ConvergingGateway)(InclusiveGatewayBehaviour, activityDef, context);
}

/**
 * Inclusive gateway behaviour
 *
 * Converges by awaiting the upstream peers that were actually activated and requires at least one
 * conditional or default outbound flow to be taken on completion.
 * @param {import('#types').Activity} activity
 */
function InclusiveGatewayBehaviour(activity) {
  _ConvergingGateway.ConvergingGatewayBehaviour.call(this, activity);
}
InclusiveGatewayBehaviour.prototype = Object.create(_ConvergingGateway.ConvergingGatewayBehaviour.prototype);
InclusiveGatewayBehaviour.prototype.constructor = InclusiveGatewayBehaviour;

/**
 * Completed execute message content requiring an outbound flow to be taken
 * @returns {import('#types').ElementMessageContent}
 */
InclusiveGatewayBehaviour.prototype._getCompletedContent = function getCompletedContent() {
  const content = _ConvergingGateway.ConvergingGatewayBehaviour.prototype._getCompletedContent.call(this);
  content.requireOutbound = true;
  return content;
};