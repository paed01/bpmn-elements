import { ConvergingGateway, ConvergingGatewayBehaviour } from './ConvergingGateway.js';

/**
 * Parallel gateway
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function ParallelGateway(activityDef, context) {
  return ConvergingGateway(ParallelGatewayBehaviour, { ...activityDef, isParallelGateway: true }, context);
}

/**
 * Parallel gateway behaviour
 *
 * Converges by awaiting its upstream peers and takes every outbound flow on completion.
 * @param {import('#types').Activity} activity
 */
export function ParallelGatewayBehaviour(activity) {
  ConvergingGatewayBehaviour.call(this, activity);
}

ParallelGatewayBehaviour.prototype = Object.create(ConvergingGatewayBehaviour.prototype);
ParallelGatewayBehaviour.prototype.constructor = ParallelGatewayBehaviour;
