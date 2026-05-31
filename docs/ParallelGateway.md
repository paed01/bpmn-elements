# ParallelGateway

Join or fork gateway.

## Converging behaviour

A parallel gateway is converging when its inbound sequence flows originate from more than one source. Instead of completing as soon as the expected number of inbound flows have been touched, the gateway monitors its upstream peer activities and completes once they have all settled.

This avoids stalls in the edge case where the same inbound flow may be touched more than once before all peers have reported. The outcome is `taken` if any inbound flow was taken, otherwise `discarded`.

## Events

- `activity.converge`: The converging parallel gateway is collecting inbound and monitoring peers
