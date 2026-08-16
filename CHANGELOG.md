# Changelog

## Unreleased

## v18.0.16 - 2026-08-16

### Fixes

- the default `Timers` no longer throws `Illegal invocation` in browsers: `setTimeout`/`clearTimeout` were invoked with the options object as receiver, which Node tolerates but browsers reject for `window.setTimeout`. The configured functions are now called detached, so both the captured defaults and a raw `window.setTimeout` passed as option work without the consumer having to `.bind(globalThis)`

## v18.0.15 - 2026-08-15

- major upgrade of [@0dep/piso@5](https://www.npmjs.com/package/@0dep/piso)

## v18.0.14 - 2026-08-14

### Additions

- `ActivityExecution`, `ProcessExecution`, `DefinitionExecution`, and `EventDefinitionExecution` are exported from the package root (`EventDefinitionExecution` also from `bpmn-elements/eventDefinitions`), so hosts and custom behaviours no longer need deep `src/` imports
- `Activity#associations` returns the activity's inbound associations
- the shipped declarations are self-contained: `types/index.d.ts` no longer references `moddle-context-serializer` — a devDependency consumers may not have installed, silently degrading affected declarations to `any`. The serialized-definition surface the runtime actually consumes is declared locally and exported: `SerializableContext`, `SerializableElement`, `ActivityDefinition`, `ProcessDefinition`, `SequenceFlowDefinition`, `AssociationDefinition`, `MessageFlowDefinition`, `ElementParentRef`, and `MessageFlowReference`. The type build fails if the emitted bundle references a module outside package dependencies

### Fixes

- element constructors accept a minimum definition: every field of the definition contracts is optional, `behaviour` included, matching the runtime defaults — `new Activity(Behaviour, { id, type, parent }, context)` type-checks without casts
- `TimersOptions` accepts any `setTimeout`/`clearTimeout` implementation — a fake-timers pair, the builtin functions, or the whole `node:timers` module — instead of demanding the builtins' full overloaded shape (`__promisify__` et al.)
- types are built and validated with `typescript@6.0.3`; `scripts/build-types.js` derives the submodule re-export blocks from the package export map instead of a hand-written list
- the test suite asserts intentional type violations with `@ts-expect-error` instead of `any`-casts, so a declaration loosened enough to make a violation legal now fails the typecheck

## v18.0.13 - 2026-08-13

### Fixes

- `EnvironmentOptions` now declares an index signature: arbitrary consumer options are kept as is on environment options, e.g. bpmn-engine stores `listener` and the serialized source context on `environment.options`
- `IScripts.register` may return `void` and `IScripts.getScript` may return `undefined`, matching custom script handlers that return nothing for non-script activities
- `IActivityBehaviour` no longer conflates constructor and instance (an instance with a `new` method); it is now a union of a behaviour class and the documented plain-factory pattern `function Behaviour(activity) { return { execute }; }`, both returning the new `IActivityBehaviourInstance`. The constructor half is exported as `IActivityBehaviourConstructor`. `ActivityExecution.source` is typed as `IActivityBehaviourInstance | undefined`
- `IExtensionsMapper.get` returns the single extensions aggregate, not an array
- `ResolvedReference.parent` is optional; the error reference resolved by `BpmnError` carries no parent
- `UserTaskBehaviour`, `ManualTaskBehaviour`, `SendTaskBehaviour`, and `BusinessRuleTaskBehaviour` now declare their prototype-chain heritage, so the shipped types include the inherited behaviour members (e.g. `execute`)
- assorted declaration accuracy fixes surfaced by type-checking the test suite: optional params that the runtime tolerates (`ActivityBroker(activity?)`, `new ActivityExecution(activity[, context])`, `ActivityError`/`BpmnError` description, `Environment#assignVariables`/`assignSettings`, `ConditionalEventDefinition` context/index, `shiftParent`), `ProcessExecution#getSequenceFlows` returns an array, `SequenceFlow#getCondition` may return undefined after emitting fatal

### Additions

- the test suite is type-checked: `npm run typecheck` (part of lint) now also runs `tsc --noEmit -p test` with `checkJs`, covering `src/` and `test/` against the declarations

## v18.0.12 - 2026-08-04

### Fixes

- `Definition#getElementById` now resolves sequence flows, message flows, and associations in addition to activities, matching its documented "any element" contract (previously it delegated only to `context.getActivityById` and returned `null` for anything that wasn't an activity). Adds `Context#getMessageFlowById` and `Context#getAssociationById`
- same-instance `resume()` after a stop taken mid-format no longer deadlocks at status `formatting`; stop/deactivate now `reset()`s the formatter so a stale `_formatter-<correlationId>` consumer can't steal and ack the resumed run's formatting message
- resuming a run that rested at status `started` (e.g. step mode) now re-activates extensions on the redelivered `run.start`, so an activate-driven io output mapping is no longer silently dropped

## v18.0.11 - 2026-07-25

### Additions

- `UserTask`, `ManualTask`, `SendTask`, `BusinessRuleTask` (and `TextAnnotation`, `Group`, `Category`) are now distinct exports with their own behaviour instead of aliases of `SignalTask`/`ServiceTask`/`Dummy`. Each spec-named behaviour owns its prototype and inherits the shared base (`UserTaskBehaviour`/`ManualTaskBehaviour` from `SignalTaskBehaviour`; `SendTaskBehaviour`/`BusinessRuleTaskBehaviour` from `ServiceTaskBehaviour`), so overriding one no longer leaks into its base or siblings

### Fixes

- add missing root type exports for `Timers`, `Dummy`, `TextAnnotation`, and `Group`
- `Definition#getPostponed` and `DefinitionExecution#getPostponed` now type their return as `IApi<Activity>[]` instead of a single `IApi<Activity>`
- drop redundant root `index.d.ts`; the bare `bpmn-elements` import resolves through the package `types` field in every resolution mode
- stop publishing the hand-written type sources (`types/bundle.d.ts`, `types/bundle-errors.d.ts`, `types/interfaces.d.ts`); their declarations are already bundled into the shipped `types/index.d.ts`

## v18.0.10 - 2026-07-23

### Additions

- new exported `ServiceFunction` type declares injected `environment.services` functions with the calling element as `this`, e.g. `services: { myService(this) { return this.id; } }`. `EnvironmentOptions.services`, the `Environment#services` accessor, `getServiceByName`, and `addService` now use it

## v18.0.9 - 2026-07-18

### Fixes

- [`dts-buddy@0.8.3`](https://www.npmjs.com/package/dts-buddy) now strips internal properties, only prototyped methods remaining

## v18.0.8 - 2026-07-17

### Fixes

- drop legacy in-flight `flow.discard`/`flow.looped` tokens on recover. States saved before the "no flow discards" change could carry a discarded-flow token on the process activity queue; the current runtime never pops it from `postponed`, so recovering such a state stranded process completion
- Type declare Definition run function properly

## v18.0.7 - 2026-07-16

### Additions

- `AdHocSubProcess` is now executed by a dedicated `AdHocSubProcessBehaviour`. Honours `ordering` — Parallel (default) or Sequential, arming one inner start branch at a time — and a `completionCondition` that completes the sub process and cancels the still-running instances, unless `cancelRemainingInstances` is `false`
- catch, boundary, and start events with `parallelMultiple="true"` now wait for **all** their event definitions to fire before completing

## v18.0.6 - 2026-07-06

### Bug fixes

- seeding `environment.variables.input` for a sub process or called process now merges onto any inherited `input` instead of replacing it, so a nested or multi-instance sub process no longer clobbers the parent's `input` namespace (e.g. an inner loop can still resolve `${environment.variables.input.collection}` after the outer loop seeds its context)

## v18.0.5 - 2026-07-01

### Additions

- extension lifecycle hooks `activate` and `deactivate` are now optional; an extension that returns an object without either receives a no-op stub, so returning only one hook — or an object with neither — no longer throws
- the shared `resolve` function on signal-, message-, and escalation reference elements now declares an exported `ResolvedReference` return type

## v18.0.4 - 2026-06-28

### Additions

- called processes and sub processes are seeded with `environment.variables.input` from their input. A multi-instance call activity or sub process passes its loop context (`isSequential`, `index`, `cardinality` and the item under the `elementVariable` name) as `input`

## v18.0.3 - 2026-06-27

### Additions

- process extensions are now activated and deactivated accordingly
- process run messages can be formatted, including asynchronously, the same way as activities

## v18.0.2 - 2026-06-24

- Refactor catching `LinkEventDefinition` trigger and start event init handling. Both publishes `activity.init` to reserve process attention and queues messages on inbound queue that are eventually handled
- a throwing link `IntermediateThrowEvent` is no longer marked as an end (`isEnd`); it has no outbound sequence flows but continues at its catch, so a shake no longer records it as a dead-end sequence
- a converging parallel gateway now publishes `activity.shake.converge` during a shake (previously `activity.shake.join`), matching the runtime `activity.converge` event

## v18.0.1 - 2026-06-13

### Fixes

- enforce mutually exclusive start events on recover: a recovered state where one entry point already won, or a legacy state serialized before the `isStartEvent` flag existed, now correctly discards the start events still left armed instead of resuming them as live entry points

### Additions

- serialized definition state is stamped with a `stateVersion` tracking the package major; recovering an older major (legacy unstamped states are treated as version `0`) triggers migrations such as the start event reconciliation above

## v18.0.0 - 2026-06-11

Refactor parallel converging and forking gateways, and treat multiple start events as mutually exclusive entry points. As a result of the parallel gateway keeping track of peers there is no need for discarding a sequence flows.

### Breaking

- `Definition` must be called with `new`
- parallel gateways now enter execution as soon as the first inbound sequence flow is touched
- removed discarding of outbound sequence flows altogether — activities no longer publish flow discards, so sequence flow and downstream activity `discarded` counters stay at `0`
- IntermediateCatchEvent cannot be used as a starting element, or it can but will not be started by default
- non-gateway activities end the branch when all conditional outbound flows are falsy instead of throwing; only exclusive and inclusive gateways still require a taken or default flow
- multiple start events are mutually exclusive entry points — the first start event to fire discards the others still waiting to be triggered, so two start events can no longer both run (e.g. into a parallel join, or a joining task taken twice)
- start activities that are not start events (e.g. a starting receive task, or an activity without an inbound flow) are no longer auto-discarded; they are genuine tokens that must be signalled or completed
- shake sequence has changed

### Additions

- expose throwable error classes via new `bpmn-elements/errors` subpath: `import { ActivityError, BpmnError, RunError } from 'bpmn-elements/errors'`
- activity readonly property `isParallelJoin` indicating a parallel converging gateway
- activity readonly property `isStartEvent` indicating a start event
- new activity event `activity.converge` published when parallel gateway is executed
- fix link event definition shaking
- fix `Activity.recover()` to return the activity when called without state
- a condition expression resolving to a service function is now invoked with the flow execution scope, supporting sync (return) and async (callback) results
- converging parallel gateways cache their discovered peers per runtime instance, skipping the start-up shake on repeated runs (loops, stop/resume); the cache is rebuilt on recover

### Types

- runtime types are now generated from JSDoc and bundled with [dts-buddy](https://github.com/Rich-Harris/dts-buddy)
- expose `isStartEvent` and `isParallelGateway` on the `Activity` interface

## v17.3.0 - 2025-12-03

- major upgrade of [smqp@11](https://github.com/paed01/smqp/blob/default/CHANGELOG.md)

## v17.2.2 - 2025-11-14

- npm package provenance release

## v17.2.1 - 2025-08-13

- major upgrade of [@0dep/piso@3](https://www.npmjs.com/package/@0dep/piso)

## v17.2.0 - 2025-07-22

- major upgrade of [smqp@10.0.0](https://github.com/paed01/smqp/blob/default/CHANGELOG.md)

## v17.1.0 - 2025-04-30

- add support for ad-hoc subprocess. The behavior is the same as for an ordinary subprocess

## v17.0.0 - 2025-02-08

- refactor message formatting, not sure if it breaking or not, but now it behaves as expected when formatting with multiple listeners
- fix activity discard run when activity has completed executing but not yet reached end, status `executed`
- use es5 trailing comma

## v16.2.2 - 2024-12-26

- fix call activities ignoring delegated cancel api message

## v16.2.1

- fix call activities not represented with `activityStatus=wait`
- bump [@0dep/piso@2.2](https://www.npmjs.com/package/@0dep/piso) with support for ISO week
- use optional chaining (?) and nullish coalescing (??) where feasible since it's widely available, in nodejs since v14
- replace arrays with set and remove unnecessary object assignments

## v16.2.0

### Breaking

- refactor outbound sequence flow evaluation in an attempt to mitigate nasty discard loops when multiple outbound flows have the same target. What happens now is that only one (1) flow will be touched triggering the targeted activity. E.g: all outbound are discarded - only the last discarded flow is discarded; all but one flow is discarded - only taken flow is touched; all flows taken - only the last taken flow is taken. What about conditional flows? No worries, all conditional flows conditions are still evaluated

## v16.1.0

- support ISO8601 interval timers with unbounded number of repetitions, e.g `R/PT1M` or `R-1/PT1M`

## v16.0.0

### Breaking

- Bound conditional event definition expects signal to check condition
- Bound conditional event definition is **no** longer checking condition on attached task events

### Addition

- support conditional event definition condition script
- export event definitions and flows

## v15.0.3 - 2024-07-08

- bump [@0dep/piso@2](https://www.npmjs.com/package/@0dep/piso) who totally forgot about applying declared offset before returning date

## v15.0.2

- bump [@0dep/piso@1](https://www.npmjs.com/package/@0dep/piso)

## v15.0.1

- fix parallel join inbound triggers not behaving as expected if inbound flow is taken more than once, unfortunately only for synchronous tasks
- bump [smqp@9.0.2](https://github.com/paed01/smqp/blob/default/CHANGELOG.md)
- add an image for activity execution documentation

## v15.0.0

- use Set and Map where feasible to increase performance
- bump [smqp@9](https://github.com/paed01/smqp/blob/default/CHANGELOG.md)

## v14.1.0

- delegate Signal within a process
- make sure message flow targeting process works as expected, successful but was not tested

## v14.0.1

- throw `RunError` if `TimerEventDefinition` timer value parsing fails, referencing the complaining activity in the error source property

## v14.0.0

Use [`@0dep/piso`](https://www.npmjs.com/package/@0dep/piso) to parse TimerEventDefinition duration and time date.

### Breaking

- previously a `TimerEventDefinition` timeDate date like `2024-04-22` was parsed with `Date.parse('2024-04-22')`, hence UTC. With piso a date without offset is considered a proper local date
- invalid `TimerEventDefinition` type value throws and stops execution instead of stalling and await manual cancel
- remove `ISODuration` export

### Fix

- an activity discarded on enter, e.g. discarded by a BoundaryEvent, continued running, that arrogant behavior was unacceptable and stops now

## v13.2.0

- hoist process environment output to definition environment on process error
- major update of eslint
- use prettier for formatting rules, touched basically ALL files

## v13.1.2

- fix another lingering leave message. Now it was the definition execution that kept `process.leave` messages around for sentimental reasons

## v13.1.1

- found the real reason behind ever groving state size - `activity.leave` messages were not acked by process execution. Doh!

## v13.1.0

- introduce `disableTrackState` setting. Tracking of elements is done by counters, e.g. activity taken or discarded, sequence flow taken and discarded. Counters are saved when getting state. If you run really big flows the state will keep all elements just to be able to recover the number of times an element has been touched. Needless to say it the state will grow out of it's comfort zone. Setting `disableTrackState` to true will only return state for elements that are actually running

### Breaking

- `getState()` can return undefined

## v13.0.0

- export task-, events-, and gateway activity behaviors through `bpmn-elements/tasks`, `bpmn-elements/events`, and `bpmn-elements/gateways` respectively
- refactor type definitions for three days to make the above type safe and VS-code happy. Why is it so freaking complicated? Ambient bla bla bla ts(4-digit-number)??? Looped through all 10.000 ts-typescript errors. Patches are inevitable and imminent
- use `Object.defineProperties` when feasible and skip pointless enumerable option on property

## 12.0.0

Memory issues running sequential multi-instance sub-process (MISP). All MISP executions are put in a list to be able to save state.

### Breaking

- remove MISP execution from execution reference list when iteration is completed, discarded, or errored

## 11.1.1

- fix boundary event not cancelling task if resumed before task was resumed
- a cancelled call activity should also cancel the called process even if resumed before called process was resumed later

## 11.1.0

- bump [smqp@8](https://github.com/paed01/smqp/blob/default/CHANGELOG.md)

## 11.0.1

- update neglected type definition

## 11.0.0

- slim activity state by removing properties not needed for recover, might be breaking if state is inspected
- slim process state by removing properties not needed for recover, might be breaking if state is inspected

## 10.1.0

- introduce Lane behaviour
- add process `lanes` property with Lane instances
- add activity `lane` property containing a reference to the process lane instance
- add activity `parentElement` property referencing parent process or sub process

## 10.0.0

- drop iso8601-duration dependency and copy source (with licence). Export as `ISODuration`. Extend with repeat pattern parsing, e.g. `R3/PT1H` that corresponds to three repetitions every one hour
- expose `TimerEventDefinition.parse(timerType, value)` function for extension purposes
- prototype and export built-in `Timers`

## 9.2.0

- move outbound sequence flow evaluation logic from activity to sequence flow, where it belongs
- spread sequence flow evaluation result, if object, to sequence flow take message

## 9.1.3

- type declare execution scope

## 9.1.2

- allow type IScripts.register to return undefined

## 9.1.1

- fix type Logger declaration
- type declare element `getState` return states

## 9.1.0

- refactor compensation and transaction functionality
- fix event based gateway bug when/if a subsequent event completes immediately
- add somewhat expirimental activityStatus property to process and definition, tracked by Tracker that tracks executing, wait, and timer activity

## 9.0.0

- Turn into module with exports for node
- Add basic type declaration, still learning
- return Api instance for Message- and Association flows, as stated by type declaration

## 8.2.4

- allow process to start before receiving api messages, should fix issue #32

## 8.2.3

- fix resumed boundary event initialized twice even if it's completed
- fix process lingering completed activities after resume

## 8.2.2

- mitigate possible stack overflow error by not acking message before publishing a new one. Fix after fix #31

## 8.2.1

- fix resume on caught activity error throws #31

## 8.2.0

- fix resume when activity has formatting status, extensions were not re-activated
- fix InputOutputSpecification output now passed as dataOutput instead of dataInput, as it should
- refactor Extensions loading, bpmn io is now pushed to the end of the extensions list

## 8.1.0

- support non-interrupting BoundaryEvent with ISO8601 repeating interval timeCycle

## 8.0.1

### Fix

- fix activity stuck in async formatting when resuming, preventing it to complete

## 8.0.0

### Breaking

- all processes will invoked with a cloned context and environment
- a cloned environment will no longer forward output
- remove output prop from process state. Not sure why it was there in the first place?
- remove mysterious options symbol from Environment

### Fix

- fix double completion if resumed on error

## 7.0.0

Support Call activity

- prototype all behaviours
- add api fail function

### Breaking

- all Behaviours will be invoked with new
- unable to make activity throw if emitFatal is called within activity, unsure why?

### Fix

- Signals are now broadcasted to multiple targets, previously it stopped at first catch

## 6.0.0

Isomorphism and state.

### Breaking

- Stop calling `setTimeout.call(owner, ...args)` in default Timers.js. Doesn't work in browsers and results in `TypeError: Illegal invocation`. Hence, timeout callback context is no longer the owner of the timer. Altough, it works fine in nodejs. So feel free to build your own [Timers](/docs/Timers.md) and pass it as an [option](/docs/Definition.md).
- Removed sequence flow function `evaluateCondition` since it not used and was inconsistent. Use `getCondition().execute(...args)` instead.
- Generate a slimmer state. Element broker state now only contains queues that have pending messages and sometimes an exchange with undelivered message. Not really breaking unless broker state was inspected for some reason

### Bugfix

- Sequence flow with expression condition that throws will now terminate the run
- Association counters were flipped

## 5.2.0

- add basic support for bpmn:Property, bpmn:DataStore, and bpmn:DataStoreReference

## 5.1.3

- bump smqp to even less CPU intense version
- fix shake routing key pattern bug

## 5.1.2

- stop building with node 10 (mocha)
- bump smqp to less CPU intense version

## 5.1.1

Sequential loop trouble.

### Bugfix

- Fix nasty bug in sequential multi-instance loop where it ran to infinity when cardinality is set to 0. Thank you @deelef for uncovering this!
- set cardinality to collection length if cardinality expression resolved to nothing

## 5.1.0

- Support `bpmn:Group` as dummy placeholder
- Support `bpmn:Category` as dummy placeholder

## 5.0.1

Improved expression handling by @javierlopezaircall

- expression function call with string argument containing commas is now supported

## 5.0.0

Multi-/Standard-loop characteristics.

### Breaking

- Cardinality and/or a collection is now required if designing a parallel multi instance loop
- Start throwing error when cardinality is invalid, so no need for TS yet...

## Addititions

- Introduce new setting to control parallel loop batch size, defaults to 50

### Bugfix

- Fixed bug where multi instance parallel loop stalled when more than 100 iterations where required

## 4.4.2

- wrestling with 4.4.1 edge case

## 4.4.1

- smqp retains undelivered execute.timer message in exchange when state is saved... eh, just fixed resume timers hard-to-explain-edge-case

## 4.4.0

improve expression handling

- cover false as expression function argument

## 4.3.4

- Fix multiple start events not completing process. Diverging flows to different ends stalled execution

## 4.3.3

- Bump `smqp@3.2`

## 4.3.2

- For some anxious reason parallel join gateways were initialized over and over again when inbound flows were touched. This stops now. A recovered and resumed run can now continue instead of waiting for neurotic joins. Thankyou @mdwheele for this discovery.

## 4.3.1

- Stop throwing errors when failing to parse `timeDuration` or `timeDate` as it was before and still should've been before someone changed it

## 4.3.0

Timetracking

- New [environment](/docs/Environment.md) [timers](<(/docs/Timers.md)>) property with tracked `setTimeout` and `clearTimeout`. Used by TimerEventDefinition and by inline scripts if necessary

## 4.2.0

Flaky formatting

- Add tests for formatting workaround by publishing directly to `format-run-q`
- Support formatting failure by adding `errorRoutingKey` or just publish format message with routing key ending in `.error`

## 4.1.4

Outbound sequence flows again.

- Remove redundant outbound sequence flow logic in Inclusive- and ExclusiveGateway. Flag ExclusiveGateway that only one should be taken
- If no outbound sequence was taken when activity completes the activity will throw. As it did in the above gateways. This might break stuff, but I guess it actually should

## 4.1.3

### Bugfix

- Wrap conditional sequence flow script error in an Activity error

## 4.1.2

### Bugfix

- Return something else than undefined when calling definition run (!). The definition is returned.

## 4.1.1

### Bugfix

- Formatting message on activity end resulted in nasty bug where outbound flows were affected and run stopped prematurely. This stops now.

## 4.1.0

- Make sure resumed activity wait events are emitted with a flag indicating that they are resumed - `content.isRecovered`. Can facilitate decisions regarding save state and stop. A more proper name would've been `isResumed` but `isRecovered` was used by `SignalTask`. No need for a breaking major for this small addition

## 4.0.0

Refactor scripts again

### Breaking

- ScriptTask now requires that a script is returned by [Script handler](/docs/Scripts.md) can off course return a dummy function
- Conditional SequnceFlow respects script if returned by script handler

## 3.1.0

- All sequence flows with condition, regardless of language, can use script condition using [register function](/docs/Scripts.md#registeractivity). If condition language is stipulated then script is required.

## 3.0.0

### Breaking

- Outbound sequence flow with script condition requires `next(err, result)` to be called where result decides if it should be taken or discarded

## Addititions

- Outbound sequence flow conditions are evaluated for all activities, as well as default flow
- Process now also have `cancelActivity` function for facilitation

## 2.1.0

Transactions and compensation if cancelled.

### Additions

- Add support for Transaction
- Add support for CancelEventDefinition

## 2.0.0

Diagram sequence flow order affects recover as per [engine issue 105](https://github.com/paed01/bpmn-engine/issues/105).

- Refactored outbound flow handling to an extent that flows are now taken and discarded before leaving the activity run
- As an effect of above - SequenceFlow pre flight event disappeared
- Bonus: Make EventBasedGateway behave as it should

## 1.6.1

### Bugfix:

- Resumed definition with multiple loopbacks ran towards infinity, thats now finit as expected since there is an end to the fun. Thankyou @aowakennomai for uncovering bug

## 1.6.0

- Publish `definition.resume` event when Definition is resumed

## 1.5.0

- Include input when throwing signal or message

## 1.4.0

Run a non-executable process.

### Additions

- Add support for runnning a process that is NOT marked as executable by calling `definition.run({processId})`

### Bugfix

- Multiple start events were not resumed in an orderly fashion when recovered, process was stuck, but is no more
- Include occasional sub process sequence when shaking activities

## 1.3.0

[TimerEventDefinition](/docs/TimerEventDefinition.md) `timeDate` and `timeCycle`.

### Additions

- Add support for TimerEventDefinition `timeDate`. Will behave like `timeDuration` unless the date is due - timeout
- TimerEventDefinition `timeCycle` is recognized but no timer is started. The non-action is due to uncertainty regarding cycle format. The event definition is stalled and waits for cancel
- New [`cancelActivity`](/docs/Definition.md#cancelactivitymessage) function is added to definition
- TimerEventDefinition now recognises api cancel calls. Which comes in handy if a time cycle is identified and needs to continue

## 1.2.0

- a start event with form that is waiting for input can now also be signaled from definition

## 1.1.0

### Additions

- Add shake functionality to [definition](/docs/Definition.md) to facilitate getting the run sequences of an activity or processes by calling `definition.shake([activityId])`

## Patch

- Bump to smqp@3
- Patch copyright year

## 1.0.0

Make it easier and possible to signal activities from [definition](/docs/Definition.md) by calling `definition.signal(message)`.

### Breaking

- MessageEventDefinition and SignalEventDefinition will only listens for pre-execution messages if contained in a starting event

### Bugfix

- Parallel looped ReceiveTask iterations all completed with one message, that was not intended and doesn't anymore. One message equals one completed iteration

## Minor

- Bump to smqp@2.2
- Bump dev dependencies

## 0.13.1

- Bump to smqp@2
- Bump dev dependencies

## 0.12.1

- Patch `moddle-context-serializer` to relieve project from nasty bug where message flows sourcing from empty lane threw find of undefined

## 0.12.0

- Allow override of default expression handling and parsing
- Map BusinessRuleTask to ServiceTask

## 0.11.0

- Execute extensions when initiating process

## 0.10.0

- Recover now recovers environment as well

### Bugfix

- getting state no longer throws if a placeholder activity is in activities

## 0.9.0

### Addition

- Compensation is now supported, but only by association

### Bugfix

- Fix weird code where context ignores passed SequenceFlow and MessageFlow Behaviour function when making new instances

## 0.8.1

- Expose SequenceFlow name in published events and in api

## 0.8.0

- Support StandardLoopCondition

## 0.7.0

- Support LinkEventDefinition

## 0.6.1

- Defensive resume #8

## 0.6.0

Focused on messaging.

### Breaking

- ReceiveTask expects referenced message, it can still be signaled
- IntermediateCatchEvent that lacks event definitions now expects to be signaled
- Catching MessageEventDefinition expects referenced message. or at least a matching message id

### Additions

- IntermediateThrowEvent with MessageEventDefinition now throws Message
- Start activities conforming to the same flow is discarded when the flow reaches an end activity, unless a join is put in between

## 0.5.0

- allow a waiting UserTask to trigger an execution error
- catch signal fired before event execution

## 0.4.0

### Breaking

- Catching ErrorEventDefinition now catches BpmnErrors. Support for catching by error code and anonymous errors is still supported
- Event with throwing ErrorEventDefinition now throws non-fatal BpmnErrors

### Additions

- Expose element name on Api
- Extension function `deactivate` is now actually called, called on leave and stop
