# AGENTS.md

This file provides guidance to coding agents (Claude Code, and any tool that reads `AGENTS.md`) when working with code in this repository.

## Workflow

- **TDD is the default.** Red → green → refactor: write or adjust a failing test before changing implementation. Don't delete or weaken existing assertions to land a change — extend them.
- **Performance and coverage are the project's USP.** Avoid regressions in either. On hot paths (broker dispatch, flow traversal, activity activation, joins, multi-instance loops), prefer existing `Context` Maps/refs over rebuilt scans, and avoid per-message allocations/closures where they can be hoisted.
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

### Activity vs Behaviour

An element type like `ServiceTask` is not a class. It is a factory function that returns an `Activity` constructed with a `Behaviour` class:

- `Activity` holds structural info: id, type, inbound/outbound flows, broker, lifecycle state.
- `Behaviour` implements the element-specific `execute(executeMessage)` logic, publishing results back through the broker.

When an activity is activated, `ActivityExecution` instantiates the Behaviour and calls its `execute`. To replace an element type entirely, supply a new Behaviour — see `docs/Extend.md`.

### `Context` and `Environment`

- `src/Context.js` is a per-execution **registry and lazy factory**. It stores activities, flows, and processes in `refs` Maps and instantiates them on first access via `upsertActivity` / `upsertSequenceFlow` / `upsertProcess`. It bridges the parsed moddle context (from `bpmn-moddle` via `moddle-context-serializer`) to runtime instances and wires extensions through `ExtensionsMapper`. Contexts are cheap to clone and are isolated per execution scope.
- `src/Environment.js` holds global execution config: `variables`, injected `services`, `timers`, `Scripts` engine, `expressions`, `Logger` factory, and settings such as `batchSize`. Cloned and merged per Definition.

### Api objects

`src/Api.js` produces `ActivityApi` / `ProcessApi` / `DefinitionApi` / `FlowApi`. These are lightweight wrappers over broker messages that event listeners receive (e.g. `definition.on('end', api => …)`). They expose `.signal()`, `.cancel()`, `.fail()`, `.stop()`, `.discard()`, `.resolveExpression()` and serialize running state via `content` and `messageProperties`.

### Extension models

Documented in `docs/Extend.md` and `docs/Extension.md`:

1. **Replace a Behaviour** by passing `{ types: { 'bpmn:StartEvent': MyStartEvent } }` to `Definition`. Use when you need full control over an element's execution.
2. **Non-invasive extension hooks** via `{ extensions: { myExt(activity, context) { … } } }`. Each extension runs once per activity after instantiation and typically attaches listeners or publishes format messages — used for cross-cutting concerns (forms, logging, output capture).

## Testing patterns

- Framework: mocha + `mocha-cakes-2` BDD UI. `Feature` / `Scenario` / `Given` / `When` / `Then` / `And` / `But` are globals in test files (declared in `eslint.config.js`). Chai `expect` is registered globally via `test/helpers/setup.js`.
- Layout: scenario-style coverage in `test/feature/*.js`; unit tests mirror the `src/` directory tree (`test/activity`, `test/process`, `test/gateways`, `test/tasks`, `test/eventDefinitions`, `test/flows`, …).
- BPMN sources: raw XML templates in `test/helpers/factory.js` (helpers like `factory.valid()`, `factory.userTask()`, `factory.resource('name')`) plus `.bpmn` files under `test/resources/`.
- Primary helper: `test/helpers/testHelpers.js` — `context(source, options)` parses BPMN via `bpmn-moddle`, serializes via `moddle-context-serializer`, and returns a runtime `Context`. Also exposes `Logger`, `emptyContext`, and `AssertMessage` for asserting broker message sequences.
- `test/helpers/JavaScripts.js` is a mock Scripts engine for isolating ScriptTask tests.
