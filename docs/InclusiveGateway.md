# InclusiveGateway

Join or fork gateway with conditional outbound flows.

<!-- toc -->

- [Converging behaviour](#converging-behaviour)
- [Outbound flows](#outbound-flows)
- [Events](#events)

<!-- /toc -->

## Converging behaviour

A converging inclusive gateway waits for the upstream branches that were actually activated and completes once, as BPMN 2.0 prescribes. It does not wait for inbound flows that nothing upstream can reach, so a branch skipped by a diverging inclusive or exclusive gateway does not hold the join.

The gateway reuses the [parallel gateway](/docs/ParallelGateway.md) peer monitoring: its upstream peers are discovered during the process shake, it enters execution as soon as the first inbound flow is touched, publishes `activity.converge`, and completes when all monitored peers have settled. The performance notes in [ParallelGateway](/docs/ParallelGateway.md#performance-and-trade-offs) apply.

An inclusive gateway with a single incoming sequence flow has nothing to converge: it fires on every inbound token without awaiting upstream peers, does not publish `activity.converge`, and does not trigger the process shake.

## Outbound flows

On completion the conditional outbound flows are evaluated and every truthy flow is taken. The default flow is taken when no condition is met. Without a default flow, and no condition met, the gateway emits an `<id> no conditional flow taken` error.

## Events

- `activity.converge`: The converging inclusive gateway is collecting inbound and monitoring peers
