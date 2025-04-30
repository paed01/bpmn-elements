# Changelog

## Unreleased

## [17.1.0] - 2025-04-30

- add support for ad-hoc subprocess. The behavior is the same as for an ordinary subprocess

## [17.0.0] - 2025-02-08

- refactor message formatting, not sure if it breaking or not, but now it behaves as expected when formatting with multiple listeners
- fix activity discard run when activity has completed executing but not yet reached end, status `executed`
- use es5 trailing comma

## [16.2.2] - 2024-12-26

- fix call activities ignoring delegated cancel api message

## 16.2.1

- fix call activities not represented with `activityStatus=wait`
- bump [@0dep/piso@2.2](https://www.npmjs.com/package/@0dep/piso) with support for ISO week
- use optional chaining (?) and nullish coalescing (??) where feasible since it's widely available, in nodejs since v14
- replace arrays with set and remove unnecessary object assignments

## 16.2.0

### Breaking

- refactor outbound sequence flow evaluation in an attempt to mitigate nasty discard loops when multiple outbound flows have the same target. What happens now is that only one (1) flow will be touched triggering the targeted activity. E.g: all outbound are discarded - only the last discarded flow is discarded; all but one flow is discarded - only taken flow is touched; all flows taken - only the last taken flow is taken. What about conditional flows? No worries, all conditional flows conditions are still evaluated

## 16.1.0

- support ISO8601 interval timers with unbounded number of repetitions, e.g `R/PT1M` or `R-1/PT1M`

## 16.0.0

### Breaking

- Bound conditional event definition expects signal to check condition
- Bound conditional event definition is **no** longer checking condition on attached task events

### Addition

- support conditional event definition condition script
- export event definitions and flows

## [15.0.3] - 2024-07-08

- bump [@0dep/piso@2](https://www.npmjs.com/package/@0dep/piso) who totally forgot about applying declared offset before returning date

## 15.0.2

- bump [@0dep/piso@1](https://www.npmjs.com/package/@0dep/piso)

## 15.0.1

- fix parallel join inbound triggers not behaving as expected if inbound flow is taken more than once, unfortunately only for synchronous tasks
- bump [smqp@9.0.2](https://github.com/paed01/smqp/blob/default/CHANGELOG.md)
- add an image for activity execution documentation

## 15.0.0

- use Set and Map where feasible to increase performance
- bump [smqp@9](https://github.com/paed01/smqp/blob/default/CHANGELOG.md)

## 14.1.0

- delegate Signal within a process
- make sure message flow targeting process works as expected, successful but was not tested

## 14.0.1

- throw `RunError` if `TimerEventDefinition` timer value parsing fails, referencing the complaining activity in the error source property

## 14.0.0

Use [`@0dep/piso`](https://www.npmjs.com/package/@0dep/piso) to parse TimerEventDefinition duration and time date.

### Breaking

- previously a `TimerEventDefinition` timeDate date like `2024-04-22` was parsed with `Date.parse('2024-04-22')`, hence UTC. With piso a date without offset is considered a proper local date
- invalid `TimerEventDefinition` type value throws and stops execution instead of stalling and await manual cancel
- remove `ISODuration` export

### Fix

- an activity discarded on enter, e.g. discarded by a BoundaryEvent, continued running, that arrogant behavior was unacceptable and stops now

## 13.2.0

- hoist process environment output to definition environment on process error
- major update of eslint
- use prettier for formatting rules, touched basically ALL files

## 13.1.2

- fix another lingering leave message. Now it was the definition execution that kept `process.leave` messages around for sentimental reasons

## 13.1.1

- found the real reason behind ever groving state size - `activity.leave` messages were not acked by process execution. Doh!

## 13.1.0

- introduce `disableTrackState` setting. Tracking of elements is done by counters, e.g. activity taken or discarded, sequence flow taken and discarded. Counters are saved when getting state. If you run really big flows the state will keep all elements just to be able to recover the number of times an element has been touched. Needless to say it the state will grow out of it's comfort zone. Setting `disableTrackState` to true will only return state for elements that are actually running

### Breaking

- `getState()` can return undefined

## 13.0.0

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
