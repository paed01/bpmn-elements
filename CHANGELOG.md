Changelog
=========

# 9.1.2

- allow type IScripts.register to return undefined

# 9.1.1

- fix type Logger declaration
- type declare element `getState` return states

# 9.1.0

- refactor compensation and transaction functionality
- fix event based gateway bug when/if a subsequent event completes immediately
- add somewhat expirimental activityStatus property to process and definition, tracked by Tracker that tracks executing, wait, and timer activity

# 9.0.0

- Turn into module with exports for node
- Add basic type declaration, still learning
- return Api instance for Message- and Association flows, as stated by type declaration

# 8.2.4

- allow process to start before receiving api messages, should fix issue #32

# 8.2.3

- fix resumed boundary event initialized twice even if it's completed
- fix process lingering completed activities after resume

# 8.2.2

- mitigate possible stack overflow error by not acking message before publishing a new one. Fix after fix #31

# 8.2.1

- fix resume on caught activity error throws #31

# 8.2.0

- fix resume when activity has formatting status, extensions were not re-activated
- fix InputOutputSpecification output now passed as dataOutput instead of dataInput, as it should
- refactor Extensions loading, bpmn io is now pushed to the end of the extensions list

# 8.1.0

- support non-interrupting BoundaryEvent with ISO8601 repeating interval timeCycle

# 8.0.1

## Fix

- fix activity stuck in async formatting when resuming, preventing it to complete

# 8.0.0

## Breaking

- all processes will invoked with a cloned context and environment
- a cloned environment will no longer forward output
- remove output prop from process state. Not sure why it was there in the first place?
- remove mysterious options symbol from Environment

## Fix

- fix double completion if resumed on error

# 7.0.0

Support Call activity

- prototype all behaviours
- add api fail function

## Breaking

- all Behaviours will be invoked with new
- unable to make activity throw if emitFatal is called within activity, unsure why?

## Fix

- Signals are now broadcasted to multiple targets, previously it stopped at first catch

# 6.0.0

Isomorphism and state.

## Breaking
- Stop calling `setTimeout.call(owner, ...args)` in default Timers.js. Doesn't work in browsers and results in `TypeError: Illegal invocation`. Hence, timeout callback context is no longer the owner of the timer. Altough, it works fine in nodejs. So feel free to build your own [Timers](/docs/Timers.md) and pass it as an [option](/docs/Definition.md).
- Removed sequence flow function `evaluateCondition` since it not used and was inconsistent. Use `getCondition().execute(...args)` instead.
- Generate a slimmer state. Element broker state now only contains queues that have pending messages and sometimes an exchange with undelivered message. Not really breaking unless broker state was inspected for some reason

## Bugfix
- Sequence flow with expression condition that throws will now terminate the run
- Association counters were flipped

# 5.2.0

- add basic support for bpmn:Property, bpmn:DataStore, and bpmn:DataStoreReference

# 5.1.3

- bump smqp to even less CPU intense version
- fix shake routing key pattern bug

# 5.1.2

- stop building with node 10 (mocha)
- bump smqp to less CPU intense version

# 5.1.1

Sequential loop trouble.

## Bugfix
- Fix nasty bug in sequential multi-instance loop where it ran to infinity when cardinality is set to 0. Thank you @deelef for uncovering this!
- set cardinality to collection length if cardinality expression resolved to nothing

# 5.1.0

- Support `bpmn:Group` as dummy placeholder
- Support `bpmn:Category` as dummy placeholder

# 5.0.1

Improved expression handling by @javierlopezaircall

- expression function call with string argument containing commas is now supported

# 5.0.0

Multi-/Standard-loop characteristics.

## Breaking
- Cardinality and/or a collection is now required if designing a parallel multi instance loop
- Start throwing error when cardinality is invalid, so no need for TS yet...

## Addititions
- Introduce new setting to control parallel loop batch size, defaults to 50

## Bugfix
- Fixed bug where multi instance parallel loop stalled when more than 100 iterations where required

# 4.4.2

- wrestling with 4.4.1 edge case

# 4.4.1

- smqp retains undelivered execute.timer message in exchange when state is saved... eh, just fixed resume timers hard-to-explain-edge-case

# 4.4.0

improve expression handling

- cover false as expression function argument

# 4.3.4

- Fix multiple start events not completing process. Diverging flows to different ends stalled execution

# 4.3.3

- Bump `smqp@3.2`

# 4.3.2

- For some anxious reason parallel join gateways were initialized over and over again when inbound flows were touched. This stops now. A recovered and resumed run can now continue instead of waiting for neurotic joins. Thankyou @mdwheele for this discovery.

# 4.3.1

- Stop throwing errors when failing to parse `timeDuration` or `timeDate` as it was before and still should've been before someone changed it

# 4.3.0

Timetracking

- New [environment](/docs/Environment.md) [timers]((/docs/Timers.md)) property with tracked `setTimeout` and `clearTimeout`. Used by TimerEventDefinition and by inline scripts if necessary

# 4.2.0

Flaky formatting

- Add tests for formatting workaround by publishing directly to `format-run-q`
- Support formatting failure by adding `errorRoutingKey` or just publish format message with routing key ending in `.error`

# 4.1.4

Outbound sequence flows again.

- Remove redundant outbound sequence flow logic in Inclusive- and ExclusiveGateway. Flag ExclusiveGateway that only one should be taken
- If no outbound sequence was taken when activity completes the activity will throw. As it did in the above gateways. This might break stuff, but I guess it actually should

# 4.1.3

## Bugfix
- Wrap conditional sequence flow script error in an Activity error

# 4.1.2

## Bugfix
- Return something else than undefined when calling definition run (!). The definition is returned.

# 4.1.1

## Bugfix
- Formatting message on activity end resulted in nasty bug where outbound flows were affected and run stopped prematurely. This stops now.

# 4.1.0

- Make sure resumed activity wait events are emitted with a flag indicating that they are resumed - `content.isRecovered`. Can facilitate decisions regarding save state and stop. A more proper name would've been `isResumed` but `isRecovered` was used by `SignalTask`. No need for a breaking major for this small addition

# 4.0.0

Refactor scripts again

## Breaking
- ScriptTask now requires that a script is returned by [Script handler](/docs/Scripts.md) can off course return a dummy function
- Conditional SequnceFlow respects script if returned by script handler

# 3.1.0

- All sequence flows with condition, regardless of language, can use script condition using [register function](/docs/Scripts.md#registeractivity). If condition language is stipulated then script is required.

# 3.0.0

## Breaking
- Outbound sequence flow with script condition requires `next(err, result)` to be called where result decides if it should be taken or discarded

## Addititions
- Outbound sequence flow conditions are evaluated for all activities, as well as default flow
- Process now also have `cancelActivity` function for facilitation

# 2.1.0

Transactions and compensation if canceled.

## Additions
- Add support for Transaction
- Add support for CancelEventDefinition

# 2.0.0

Diagram sequence flow order affects recover as per [engine issue 105](https://github.com/paed01/bpmn-engine/issues/105).

- Refactored outbound flow handling to an extent that flows are now taken and discarded before leaving the activity run
- As an effect of above - SequenceFlow pre flight event disappeared
- Bonus: Make EventBasedGateway behave as it should

# 1.6.1

## Bugfix:
- Resumed definition with multiple loopbacks ran towards infinity, thats now finit as expected since there is an end to the fun. Thankyou @aowakennomai for uncovering bug

# 1.6.0

- Publish `definition.resume` event when Definition is resumed

# 1.5.0

- Include input when throwing signal or message

# 1.4.0

Run a non-executable process.

## Additions
- Add support for runnning a process that is NOT marked as executable by calling `definition.run({processId})`

## Bugfix
- Multiple start events were not resumed in an orderly fashion when recovered, process was stuck, but is no more
- Include occasional sub process sequence when shaking activities

# 1.3.0

[TimerEventDefinition](/docs/TimerEventDefinition.md) `timeDate` and `timeCycle`.

## Additions
- Add support for TimerEventDefinition `timeDate`. Will behave like `timeDuration` unless the date is due - timeout
- TimerEventDefinition `timeCycle` is recognized but no timer is started. The non-action is due to uncertainty regarding cycle format. The event definition is stalled and waits for cancel
- New [`cancelActivity`](/docs/Definition.md#cancelactivitymessage) function is added to definition
- TimerEventDefinition now recognises api cancel calls. Which comes in handy if a time cycle is identified and needs to continue

# 1.2.0

- a start event with form that is waiting for input can now also be signaled from definition

# 1.1.0

## Additions
- Add shake functionality to [definition](/docs/Definition.md) to facilitate getting the run sequences of an activity or processes by calling `definition.shake([activityId])`

## Patch
- Bump to smqp@3
- Patch copyright year

# 1.0.0

Make it easier and possible to signal activities from [definition](/docs/Definition.md) by calling `definition.signal(message)`.

## Breaking
- MessageEventDefinition and SignalEventDefinition will only listens for pre-execution messages if contained in a starting event

## Bugfix
- Parallel looped ReceiveTask iterations all completed with one message, that was not intended and doesn't anymore. One message equals one completed iteration

## Minor
- Bump to smqp@2.2
- Bump dev dependencies

# 0.13.1

- Bump to smqp@2
- Bump dev dependencies

# 0.12.1

- Patch `moddle-context-serializer` to relieve project from nasty bug where message flows sourcing from empty lane threw find of undefined

# 0.12.0

- Allow override of default expression handling and parsing
- Map BusinessRuleTask to ServiceTask

# 0.11.0

- Execute extensions when initiating process

# 0.10.0

- Recover now recovers environment as well

## Bugfix
- getting state no longer throws if a placeholder activity is in activities

# 0.9.0

## Addition
- Compensation is now supported, but only by association

## Bugfix
- Fix weird code where context ignores passed SequenceFlow and MessageFlow Behaviour function when making new instances

# 0.8.1

- Expose SequenceFlow name in published events and in api

# 0.8.0

- Support StandardLoopCondition

# 0.7.0

- Support LinkEventDefinition

# 0.6.1

- Defensive resume #8

# 0.6.0

Focused on messaging.

## Breaking
- ReceiveTask expects referenced message, it can still be signaled
- IntermediateCatchEvent that lacks event definitions now expects to be signaled
- Catching MessageEventDefinition expects referenced message. or at least a matching message id

## Additions
- IntermediateThrowEvent with MessageEventDefinition now throws Message
- Start activities conforming to the same flow is discarded when the flow reaches an end activity, unless a join is put in between

# 0.5.0

- allow a waiting UserTask to trigger an execution error
- catch signal fired before event execution

# 0.4.0

## Breaking
- Catching ErrorEventDefinition now catches BpmnErrors. Support for catching by error code and anonymous errors is still supported
- Event with throwing ErrorEventDefinition now throws non-fatal BpmnErrors

## Additions
- Expose element name on Api
- Extension function `deactivate` is now actually called, called on leave and stop
