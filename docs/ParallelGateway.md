# ParallelGateway

Join or fork gateway.

## Converging behaviour

A parallel gateway — fork or join — monitors its upstream peer activities and completes once they have all settled, rather than completing as soon as the expected number of inbound flows have been touched. Peers are discovered during the process shake.

This avoids stalls in the edge case where the same inbound flow may be touched more than once before all peers have reported, and lets a single-inbound fork correctly wait for parallel upstream branches before taking its outbound flows. The outcome is `taken` if any inbound flow was taken, otherwise `discarded`.

## When to use a parallel gateway

A parallel gateway is the only element that gives true **barrier** semantics: a converging parallel gateway waits for _every_ concurrent upstream branch to settle before it continues. Reach for it when you must converge all flows before proceeding — e.g. two parallel branches that both have to finish before the next step may start.

If you do **not** need that guarantee, prefer a cheaper construct:

- An exclusive gateway or an uncontrolled merge (an activity with multiple incoming flows) continues as soon as _any_ inbound flow is taken — it does not wait, and does not trigger the costs below.
- For "first one wins" semantics use an event-based gateway.

Picking a parallel join only when you genuinely need the barrier keeps the common path on the cheaper machinery.

## Performance and trade-offs

A converging parallel gateway is more expensive than the other gateways, by design:

- **Process shake on start.** To learn which upstream activities are its peers, the presence of a converging parallel gateway forces a graph shake when the process starts. Exclusive, inclusive and event-based joins do not. The shake walks the reachable graph, so its cost grows with graph size, and on graphs with many branching gateways in series it can grow super-linearly (it enumerates paths). The shake result is cached on the context and reused, so it runs **once per context** rather than once per run — reuse the same `Context`/`Definition` source across executions so the shake amortizes instead of repeating.
- **Peer monitoring at runtime.** While converging, the gateway watches all of its discovered peer activities until they settle (see _Converging behaviour_ above), which is more work than counting inbound flows.

The upside is correctness on hard topologies and a large win elsewhere: because joins no longer rely on discarded flows arriving, dead branches are not propagated as discards. On branchy or looping diagrams that is dramatically cheaper than discarding every dead-path flow on every run.

Rule of thumb: a parallel join is the right tool when you must synchronise all branches; avoid it on hot paths where an exclusive merge would do, and reuse the context so the one-time shake is paid once.

## Events

- `activity.converge`: The parallel gateway is collecting inbound and monitoring peers
