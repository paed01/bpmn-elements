# BPMN 2.0 conformance

`bpmn-elements` targets the **Common Executable** conformance sub-class of BPMN 2.0 — the subset the OMG spec defines as the minimum an executing engine must support. This page maps that element set to the library's support status and records the deliberate design decisions behind it.

## Execution philosophy

The library is a **semantic execution engine**, not a service/DMN/forms runtime. Elements whose behaviour is "invoke an external capability" (a service, a decision, a human form) are executed by delegating to a host-supplied implementation rather than by the engine speaking WSDL, DMN or a form language itself. This is the same effective model used by mainstream engines and is how the executable task types below are realised.

Two library-wide primitives are relied on throughout:

- **`.signal([payload])`** — the universal completion primitive for any wait-state (user/manual/receive tasks, message/signal/conditional catches). Available on `DefinitionApi`, `ProcessApi` and `ActivityApi`.
- **No flow discards** — sequence flows are never discarded; joins use cached gateway peers. See `AGENTS.md`.

## Coverage

Legend: **✓** executed natively · **⌁** executed via host delegation (see philosophy) · **—** out of scope for Common Executable.

### Events

| Element                                       | Start | Intermediate catch | Intermediate throw | Boundary        | Status |
| --------------------------------------------- | ----- | ------------------ | ------------------ | --------------- | ------ |
| None                                          | ✓     | —                  | ✓                  | —               | ✓      |
| Message                                       | ✓     | ✓                  | ✓                  | ✓               | ✓      |
| Timer (`timeDate`/`timeDuration`/`timeCycle`) | ✓     | ✓                  | —                  | ✓               | ✓      |
| Signal                                        | ✓     | ✓                  | ✓                  | ✓               | ✓      |
| Conditional                                   | ✓     | ✓                  | —                  | ✓               | ✓      |
| Error                                         | —     | —                  | —                  | ✓               | ✓      |
| Escalation                                    | —     | —                  | ✓                  | ✓               | ✓      |
| Cancel                                        | —     | —                  | —                  | ✓ (Transaction) | ✓      |
| Compensation                                  | —     | —                  | ✓                  | ✓               | ✓      |
| Terminate                                     | —     | —                  | ✓ (End)            | —               | ✓      |
| Link                                          | —     | ✓                  | ✓                  | —               | ✓      |
| Multiple                                      | ✓     | ✓                  | ✓                  | ✓               | ✓      |
| ParallelMultiple                              | ✓     | ✓                  | —                  | ✓               | ✓      |

- Boundary events support both **interrupting** and **non-interrupting** (`cancelActivity`).
- ISO-8601 repeating cycles (`Rn/PT…`) are honoured on non-interrupting boundary timers. Cron/non-ISO cycles require extending `TimerEventDefinition` (see [TimerEventDefinition.md](./TimerEventDefinition.md)).
- Conditional events are evaluated on execute and re-evaluated on an explicit `.signal()`.
- **ParallelMultiple** (an event with several event definitions and `parallelMultiple="true"`) completes only once **every** definition has fired; progress survives stop/resume. A plain **Multiple** event (no flag) still completes on the first.

### Activities / tasks

| Element                       | Status | Notes                                                                                                 |
| ----------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| Task (abstract)               | ✓      | Pass-through                                                                                          |
| Service Task                  | ⌁      | Delegates to `environment.services` / `implementation`                                                |
| Send Task                     | ⌁      | Alias of Service Task; host dispatches the message                                                    |
| Receive Task                  | ✓      | Native message wait keyed on `messageRef`                                                             |
| User Task                     | ⌁      | Wait-state completed via `.signal()`; forms are a host concern                                        |
| Manual Task                   | ⌁      | Wait-state, as User Task                                                                              |
| Script Task                   | ✓      | Via the registered `Scripts` engine                                                                   |
| Business Rule Task            | ⌁      | Alias of Service Task; supply the decision service — e.g. [dmn-elements](#business-rule-task-and-dmn) |
| Sub-Process                   | ✓      | Embedded and event sub-process                                                                        |
| Ad-Hoc Sub-Process            | ✓      | Parallel/Sequential ordering, `completionCondition`, `cancelRemainingInstances`                       |
| Transaction                   | ✓      | Cancel + compensation wired                                                                           |
| Call Activity                 | ✓      | Calls a `Process`; see design notes for unresolved `calledElement`                                    |
| Loop / Multi-Instance markers | ✓      | Standard loop and sequential/parallel multi-instance                                                  |

### Gateways

| Element     | Status              |
| ----------- | ------------------- |
| Exclusive   | ✓                   |
| Inclusive   | ✓                   |
| Parallel    | ✓                   |
| Event-Based | ✓                   |
| Complex     | — (see limitations) |

### Data, flows and swimlanes

| Element                          | Status | Notes                                                          |
| -------------------------------- | ------ | -------------------------------------------------------------- |
| Sequence Flow / Message Flow     | ✓      | Message flows route between processes/pools                    |
| Data Object (+ Reference)        | ✓      | Reference resolves to its target object                        |
| Data Store (+ Reference)         | ✓      |                                                                |
| Data Input/Output + Associations | ✓      | Data-object associations; `Properties` also bridge data stores |
| Pool / Lane                      | ✓      | Multiple processes model participants; lanes are first-class   |

## Design decisions

These are intentional and covered by tests; treat them as part of the contract.

1. **Delegated task types.** Send, Business Rule and User/Manual tasks are executed by delegating to a host service or a `.signal()` wait-state rather than by the engine implementing WSDL/DMN/forms. This is the semantic-engine model above. For Business Rule Tasks the companion DMN engine [dmn-elements](#business-rule-task-and-dmn) fills this role.
2. **`.signal()` completes any wait-state.** A message intermediate catch, a user task, or a signal catch are all completable via `.signal()`. Consequently a broadcast/anonymous signal can satisfy an anonymous message catch — this is the universal-completion design, not a matching bug.
3. **Unresolved `calledElement` waits rather than errors.** A Call Activity whose `calledElement` does not resolve to an executable `Process` (a global task, or a late-bound/typo'd id) becomes a wait-state that the host can resolve with `.signal()`. This supports late binding; add a boundary timer if a deadline is required.

## Business Rule Task and DMN

The engine executes a Business Rule Task as a Service Task (see the delegated task types above): the referenced decision is evaluated by a host-supplied service rather than by the engine itself. The companion package **[dmn-elements](https://github.com/zerodep/dmn-elements)** is the intended decision engine for this — an isomorphic, DMN 1.3 executor (decision tables, literal expressions, FEEL via [feelin](https://github.com/nikku/feelin)) built as a sibling of `bpmn-elements` and sharing its idiom.

Wire it as the task's service: register a service on the [`Environment`](./Environment.md) that runs the referenced decision through `dmn-elements` and returns the result as the activity's output. The Business Rule Task then behaves like any Service Task, with the decision result flowing back through the normal output mapping.

```js
import { Definition as DmnDefinition, Context as DmnContext, Environment as DmnEnvironment } from 'dmn-elements';

// A service that evaluates a DMN decision for a Business Rule Task.
function evaluateDecision(decisionId, dmnModdleContext) {
  return function service(scope, callback) {
    const dmn = new DmnDefinition(DmnContext(dmnModdleContext, new DmnEnvironment()));
    dmn.evaluate(decisionId, scope.environment.variables, (err, decision) => {
      if (err) return callback(err);
      callback(null, decision.output);
    });
  };
}
```

DMN parsing (`dmn-moddle`) is host-side, exactly as BPMN parsing (`bpmn-moddle`) is for this library. See the [dmn-elements](https://github.com/zerodep/dmn-elements) docs for the current decision API.

## Out of scope / limitations

Outside the Common Executable set or deliberately unimplemented:

- **Complex Gateway** — no behaviour; rarely used and semantically ill-defined (most engines omit it).
- **Message correlation** — messages match by `messageRef` id only; no `correlationKey`/`correlationProperty`.
- **ItemDefinition / typed data** — data is untyped.
- **Participant multiplicity** — a pool is modelled by a `Process`; `participantMultiplicity` is not a first-class concept.
- **Choreography / Conversation** — non-executable, not modelled.
- **Global tasks** (`GlobalTask`, `GlobalUserTask`, …) — not executed; a Call Activity referencing one follows the unresolved-`calledElement` rule above.

Scoped extension points for several of these are documented in [Extend.md](./Extend.md) and [Extension.md](./Extension.md).
