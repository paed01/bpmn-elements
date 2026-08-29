# Upgrade guide

## v17 → v18

Version 18 refactors parallel gateway convergence and removes sequence flow discards altogether. Most diagrams run unchanged, but hosts that listen for discard events, assert `discarded` counters, or rely on multiple start events all running need attention.

- [`Definition` requires `new`](#definition-requires-new)
- [No more flow discards](#no-more-flow-discards)
- [Parallel gateways](#parallel-gateways)
- [Multiple start events are mutually exclusive](#multiple-start-events-are-mutually-exclusive)
- [Starting activities that are not start events](#starting-activities-that-are-not-start-events)
- [Conditional outbound flows on non-gateway activities](#conditional-outbound-flows-on-non-gateway-activities)
- [Shake output has changed](#shake-output-has-changed)
- [Distinct task behaviours](#distinct-task-behaviours)
- [Resuming state saved by v17](#resuming-state-saved-by-v17)
- [Types](#types)
- [Notable additions](#notable-additions)

### `Definition` requires `new`

`Definition` no longer news itself up when called as a function.

```javascript
// v17
const definition = Definition(context, options);

// v18
const definition = new Definition(context, options);
```

### No more flow discards

In v17 an untaken branch was propagated as a chain of discards: the untaken sequence flow published `flow.discard`, the downstream activity ran a discard run, discarded its own outbound flows, and so on until the tokens met at a join. In v18 an untaken branch is simply left untouched — no discard token travels the diagram.

Consequences for a host:

- sequence flow `discard` events and downstream `activity.discard` cascades from branching decisions no longer occur. Listeners waiting for them never fire.
- sequence flow and activity `discarded` counters stay at `0` for untaken branches. Do not assert on them to detect which path was not taken — track `flow.take`/`activity.end` instead.
- an activity discarded through the api (`api.discard()`) still runs a discard and increments its own `discarded` counter; it is only the flow-driven propagation that is gone.
- exclusive and inclusive gateways touch only the taken flow(s); the untaken conditional flows still have their conditions evaluated, but produce no events.
- compensation associations follow the same rule: a compensation target only observes `association.take`, and the association `discard` counter stays `0` when a transaction completes without compensating.

The mechanics behind the removal — how parallel joins complete without discard tokens — are described in [ParallelGateway](/docs/ParallelGateway.md).

### Parallel gateways

- a converging parallel gateway enters execution as soon as the first inbound sequence flow is touched, instead of waiting for all inbound flows. It discovers its upstream peers with a shake and completes when all peers have reported. Discovered peers are cached per runtime instance, so loops and stop/resume skip the start-up shake; the cache is rebuilt on recover.
- a new `activity.converge` event is published when the gateway evaluates convergence.
- during a shake a converging parallel gateway publishes `activity.shake.converge` (previously `activity.shake.join`).
- new activity readonly property `isParallelGateway` indicates a parallel gateway.

### Multiple start events are mutually exclusive

Start events in the same process are now mutually exclusive entry points: the first start event to fire discards the others still armed. Two start branches can never both run.

A v17 diagram that relied on multiple start events running in parallel — e.g. two start events converging into a parallel join, or a joining task taken twice — must be redesigned, typically with a single start event forking through a parallel gateway.

### Starting activities that are not start events

- an `IntermediateCatchEvent` without inbound sequence flows is no longer started by default. Give it an inbound flow, or run it explicitly.
- start activities that are not start events (e.g. a starting receive task, or any activity without inbound flows) are no longer auto-discarded when a start event fires. They are armed as genuine tokens and must be signalled, completed, or discarded — otherwise they keep the process running.

### Conditional outbound flows on non-gateway activities

When all conditional outbound flows of a non-gateway activity evaluate falsy, the branch now ends quietly instead of the activity throwing. Only exclusive and inclusive gateways still require a taken or default flow and emit an error when none is.

If you relied on the thrown error to detect a dead end, listen for the activity `end` event and inspect taken outbound flows instead.

### Shake output has changed

The shake sequence differs from v17:

- a throwing link `IntermediateThrowEvent` is no longer marked as an end (`isEnd`); it has no outbound sequence flows but continues at its catch, so a shake no longer records it as a dead-end sequence.
- converging parallel gateways report `activity.shake.converge` as noted above.

Hosts persisting or diffing shake results should re-run and re-baseline them.

### Distinct task behaviours

`UserTask`, `ManualTask`, `SendTask`, and `BusinessRuleTask` (and `TextAnnotation`, `Group`, `Category`) are distinct exports with their own behaviour instead of aliases of `SignalTask`/`ServiceTask`/`Dummy`. Identity checks like `UserTask.Behaviour === SignalTask.Behaviour` no longer hold, and overriding one behaviour's prototype no longer leaks into its base or siblings. Element type overrides passed via `options.types` are unaffected — they are keyed per BPMN type as before.

### Resuming state saved by v17

States saved by v17 can be recovered and resumed. v18 stamps saved state with a `stateVersion` (the package major); a recovered state with an older version — legacy unstamped states are treated as version `0` — triggers migrations on resume:

- start events are reconciled to the mutually-exclusive rule: if one entry point already won, the start events still armed are discarded instead of resumed as live entry points.
- in-flight `flow.discard`, `flow.looped`, and `association.discard` tokens left on process queues by the old discard propagation are acked on sight, so they no longer strand process completion.

No action is required beyond resuming with v18; saving again stamps the current version.

### Types

Runtime type declarations are now generated from JSDoc and bundled into `types/index.d.ts`. The shipped surface is self-contained — it no longer references `moddle-context-serializer` — and declares the serialized-definition contracts locally (`SerializableContext`, `ActivityDefinition`, …). Recompile a TypeScript host against the new declarations; some previously loose (`any`) spots are now typed and may surface pre-existing mismatches.

### Notable additions

Not breaking, but new since v17 and useful when upgrading:

- throwable error classes are exposed via the `bpmn-elements/errors` subpath: `import { ActivityError, BpmnError, RunError } from 'bpmn-elements/errors'`.
- postponed activity content declares `accepts` — the api message types the waiting run acts on beyond `stop` and `discard` (e.g. `['signal', 'error']` for a user task, `['cancel']` for a timer). Readable from `getPostponed()` api content and wait events, see [SharedApi](/docs/SharedApi.md).
- a conditional event and a timer can be cancelled through the api: `cancel()` completes the event without the condition being met / the timer timing out.
- `AdHocSubProcess` has a dedicated behaviour honouring `ordering` and `completionCondition`.
- catch, boundary, and start events with `parallelMultiple="true"` wait for all their event definitions.
- called processes and sub processes are seeded with `environment.variables.input`; multi-instance loops pass their loop context as input.
- `ActivityExecution`, `ProcessExecution`, `DefinitionExecution`, `EventDefinitionExecution`, and `Expressions` are exported from the package root.
- new activity readonly properties `isStartEvent` and `isParallelGateway`.
