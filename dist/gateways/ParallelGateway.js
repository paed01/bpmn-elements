"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParallelGateway = ParallelGateway;
exports.ParallelGatewayBehaviour = ParallelGatewayBehaviour;
var _ConvergingGateway = require("./ConvergingGateway.js");
/**
 * Parallel gateway
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
function ParallelGateway(activityDef, context) {
  return (0, _ConvergingGateway.ConvergingGateway)(ParallelGatewayBehaviour, {
    ...activityDef,
    isParallelGateway: true
  }, context);
}

/**
 * Parallel gateway behaviour
 *
 * Converges by awaiting its upstream peers and takes every outbound flow on completion.
 * @param {import('#types').Activity} activity
 */
function ParallelGatewayBehaviour(activity) {
  _ConvergingGateway.ConvergingGatewayBehaviour.call(this, activity);
}
ParallelGatewayBehaviour.prototype = Object.create(_ConvergingGateway.ConvergingGatewayBehaviour.prototype);
ParallelGatewayBehaviour.prototype.constructor = ParallelGatewayBehaviour;