# AGENTS.md

This file provides guidance to coding agents (Claude Code, and any tool that reads `AGENTS.md`) when working with code in this repository.

## Workflow

- **TDD is the default.** Red → green → refactor: write or adjust a failing test before changing implementation. Don't delete or weaken existing assertions to land a change — extend them.
- **Performance and coverage are the project's USP.** Avoid regressions in either. On hot paths (broker dispatch, flow traversal, activity activation, joins, multi-instance loops), prefer existing `Context` Maps/refs over rebuilt scans, and avoid per-message allocations/closures where they can be hoisted.
- **JSDoc is concise.** Short intent descriptions are fine; never describe internal implementation.
- Before declaring done: `npm test` (full suite + lint + `dist` rebuild). For coverage-sensitive work, also `npm run cov:html`.

## Commands

- `npm test` — run the full suite in parallel (mocha, `mocha-cakes-2` UI, hot-bev reporter, 3000ms timeout). `posttest` then runs lint and rebuilds `dist/`.
- `npm run lint` — `eslint . --cache && prettier . --check --cache`.
- `npm run dist` — Babel transpile `src/` → `dist/` (also runs on `prepack`).
- `npm run cov:html` — c8 HTML coverage report.
- `npm run test:md` — run texample against code blocks in the documentation markdown files.
- Single test file: `npx mocha test/feature/activity-feature.js`. `.mocharc.json` auto-loads `mocha-cakes-2` and `test/helpers/setup.js` (which registers chai `expect` globally and sets `NODE_ENV=test`).
- Single scenario: add `-g "scenario name"` to the mocha invocation above.
- Note: default mocharc timeout is 1000ms; the `npm test` script bumps it to 3000ms. Long-running scenarios may need `-t 3000` when run standalone.

## Architecture

The library executes BPMN 2.0 workflows. The execution model is message-driven — almost nothing happens by direct method call — so this section focuses on what you cannot learn from any single file.

### Execution hierarchy: Definition → Process → Activity

Each layer pairs a structural wrapper with a dedicated execution orchestrator:

- `src/definition/Definition.js` + `src/definition/DefinitionExecution.js` — top-level, manages executable processes and inter-process messaging.
- `src/process/Process.js` + `src/process/ProcessExecution.js` — owns one `<bpmn:process>`, handles flow traversal, joins, and parallel activation.
- `src/activity/Activity.js` + `src/activity/ActivityExecution.js` — wraps any element (task, event, gateway), tracks postponed/waiting state, drives a per-run behavior instance.

### Message-driven core via `smqp`

All coordination is async message passing on an in-memory AMQP-like broker (`smqp`, a runtime dependency). Each element owns its own `EventBroker` (`src/EventBroker.js`) with exchanges named `event`, `run`, `format`, `execution`, and `api`. Per-element factories wire these up: `DefinitionBroker`, `ProcessBroker`, `ActivityBroker`, `MessageFlowBroker`.

Execution is driven by publishing routing keys like `execute.start`, `execute.completed`, `execute.error`, `run.enter`, `run.end`, `run.discard`, and subscribing via `broker.subscribeTmp()` / `subscribeOnce()`. Messages with `mandatory: true` surface errors if undelivered. The `EventBroker` exposes convenience methods: `on`, `once`, `waitFor`, `emit`, `emitFatal`. If you try to read `ActivityExecution` or `ProcessExecution` as imperative code you will get lost — keep the publish/subscribe model in mind.

**Do not read synchronous queue/exchange state off the broker** (`queue.messageCount`, `consumerCount`, `peek`, etc.). These are `smqp` conveniences a host that swaps in a real AMQP-compliant broker will not provide. Track what you need in execution state instead — e.g. `consumeInbound` keys the consumer assertion off the `initialized` counter, not a pending-message count on `inbound-q`. Publishing, subscribing, asserting/cancelling consumers, and `queueMessage` are all fine; reading queue depth is not.

### Activity vs Behaviour

An element type like `ServiceTask` is not a class. It is a factory function that returns an `Activity` constructed with a `Behaviour` class:

- `Activity` holds structural info: id, type, inbound/outbound flows, broker, lifecycle state.
- `Behaviour` implements the element-specific `execute(executeMessage)` logic, publishing results back through the broker.

When an activity is activated, `ActivityExecution` instantiates the Behaviour and calls its `execute`. To replace an element type entirely, supply a new Behaviour — see `docs/Extend.md`.

To identify an element's kind at runtime, compare its `Behaviour` (`entity.Behaviour === StartEvent`) rather than the `type` string — type strings can be customized via the `types` extension.

### `Context` and `Environment`

- `src/Context.js` is a per-execution **registry and lazy factory**. It stores activities, flows, and processes in `refs` Maps and instantiates them on first access via `upsertActivity` / `upsertSequenceFlow` / `upsertProcess`. It bridges the parsed moddle context (from `bpmn-moddle` via `moddle-context-serializer`) to runtime instances and wires extensions through `ExtensionsMapper`. Contexts are cheap to clone and are isolated per execution scope.
- `src/Environment.js` holds global execution config: `variables`, injected `services`, `timers`, `Scripts` engine, `expressions`, `Logger` factory, and settings such as `batchSize`. Cloned and merged per Definition.

### Api objects

`src/Api.js` produces `ActivityApi` / `ProcessApi` / `DefinitionApi` / `FlowApi`. These are lightweight wrappers over broker messages that event listeners receive (e.g. `definition.on('end', api => …)`). They expose `.signal()`, `.cancel()`, `.fail()`, `.stop()`, `.discard()`, `.resolveExpression()` and serialize running state via `content` and `messageProperties`.

### Extension models

Documented in `docs/Extend.md` and `docs/Extension.md`:

1. **Replace a Behaviour** by passing `{ types: { 'bpmn:StartEvent': MyStartEvent } }` to `Definition`. Use when you need full control over an element's execution.
2. **Non-invasive extension hooks** via `{ extensions: { myExt(activity, context) { … } } }`. Each extension runs once per element after instantiation (every activity **and** the owning process — both call `context.loadExtensions(this)`) and typically attaches listeners or publishes format messages — used for cross-cutting concerns (forms, logging, output capture). An extension may return `{ activate(message), deactivate(message) }` lifecycle hooks; return falsy to only subscribe to events. Gate process-only or activity-only extensions on the element (e.g. `element.type === 'bpmn:Process'`) — the function is called for both.

### State & behavioral invariants

- **No flow discards.** Outbound sequence flows are never discarded; flow and activity `discarded` counters stay `0`. There is no `skipDiscard` setting. Parallel joins rely on cached gateway peers, not on discarded flows.
- **Activities are armed through the inbound queue, then run consumer-driven.** Both start activities (`isStart`, no inbound trigger) and link catch events are armed by `Activity.init()`: it mints an executionId, emits the `init` event (whose placeholder in the process's `postponed` set blocks premature completion), increments an `initialized` counter, and queues a non-persistent `activity.init` message carrying that id (plus the activity `id`) on the activity's own `inbound-q`. The run is then driven by the inbound consumer: the idempotent `consumeInbound()` asserts the consumer when there are inbound triggers, or — even without sequence-flow triggers — when the activity is `initialized` (it reads the `initialized` counter rather than probing `inbound-q` for a pending-message count, so no synchronous smqp-only property is touched), and `_onInbound`'s `activity.init` case decrements the counter and calls `run()` with the carried id. `ProcessExecution._start` arms start activities this way (`init()` then `consumeInbound()`, no direct `run()`). A throwing link publishes `activity.link`; the catch's construction-time inbound-trigger handler calls the catch's own `init()` to arm it identically — there is no `activity.relink`. The `initialized` getter reads the counter (exec-state, not persisted); since the `activity.init` trigger is `persistent: false` it is dropped on recover and never re-consumed, so counter and trigger reset together (a stop/resume while armed cannot desync them).
- **`run()` executionId resolution.** `run(runContent)` uses `runContent.initExecutionId` when `runContent.id` equals the activity's own id, otherwise mints a fresh `getUniqueId(id)`. The init/link handoff (`_onInbound`) always passes a matching `id`, so the reserved id is honoured; every other caller (e.g. delegated event runs passing `run(content.message)`) carries no matching id and gets a fresh one. `run()` does **not** peek the inbound queue, and there is no `initExecutionId` exec-state key. `initExecutionId` is **destructured out** of `runContent` so it never reaches the `run.enter`/`run.start` content (it would otherwise leak through `_createMessage`, which only overwrites `id`/`type`/flags, into every downstream message and saved state).
- **Extension `activate`/`deactivate` fire symmetrically on activities and processes.** Both `Activity` and `Process` call their extensions' `activate(message)` on run enter / redelivered execute / resume and `deactivate(message)` on run leave / stop, each guarded by `if (this.extensions)`. Keep the two in sync: a lifecycle hook added on one side generally belongs on the other. `Definition` does not load or invoke extensions.
- **Run transitions are formatted on both activities and processes.** `Activity._onRunMessage` and `Process._onRunMessage` route every non-passthrough run message through `this.formatter.format(message, cb)` (`MessageFormatter`) before `_continueRunMessage` runs the actual switch; the callback restores status, applies enriched content, or `emitFatal`s on a format error. Formatting is **unconditional** (not gated on `this.extensions`) so any handler — extension or not — can enrich a run by publishing a `format` message, optionally with an `endRoutingKey` to pause the run asynchronously until the matching end key arrives. The run-q message stays unacked across the wait, which is what serializes the run; nothing is `await`ed in the consumer.
- **Multiple start events are mutually exclusive entry points.** The first start event to fire discards the others still armed, so two start branches can never both run.
- **`stateVersion`.** `Definition.getState()` stamps `stateVersion` (the package major, hardcoded in `src/constants.js`); recovering an older major triggers migrations (e.g. start event reconciliation on resume). Unstamped legacy states are treated as version `0`. Bump the constant on each major release.

## Testing patterns

- Framework: mocha + `mocha-cakes-2` BDD UI. `Feature` / `Scenario` / `Given` / `When` / `Then` / `And` / `But` are globals in test files (declared in `eslint.config.js`). Chai `expect` is registered globally via `test/helpers/setup.js`.
- Layout: scenario-style coverage in `test/feature/*.js`; unit tests mirror the `src/` directory tree (`test/activity`, `test/process`, `test/gateways`, `test/tasks`, `test/eventDefinitions`, `test/flows`, …).
- BPMN sources: raw XML templates in `test/helpers/factory.js` (helpers like `factory.valid()`, `factory.userTask()`, `factory.resource('name')`) plus `.bpmn` files under `test/resources/`.
- Primary helper: `test/helpers/testHelpers.js` — `context(source, options)` parses BPMN via `bpmn-moddle`, serializes via `moddle-context-serializer`, and returns a runtime `Context`. Also exposes `Logger`, `emptyContext`, and `AssertMessage` for asserting broker message sequences.
- `test/helpers/JavaScripts.js` is a mock Scripts engine for isolating ScriptTask tests.
- Don't assert on logging — captured `logger.warn`/`debug` output is not part of the tested contract.
