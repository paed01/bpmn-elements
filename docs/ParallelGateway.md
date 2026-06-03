# ParallelGateway

Join or fork gateway.

## Converging behaviour

A parallel gateway — fork or join — monitors its upstream peer activities and completes once they have all settled, rather than completing as soon as the expected number of inbound flows have been touched. Peers are discovered during the process shake.

This avoids stalls in the edge case where the same inbound flow may be touched more than once before all peers have reported, and lets a single-inbound fork correctly wait for parallel upstream branches before taking its outbound flows. The outcome is `taken` if any inbound flow was taken, otherwise `discarded`.

## Events

- `activity.converge`: The parallel gateway is collecting inbound and monitoring peers
