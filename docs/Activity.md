Activity
========

Shared activity behaviour.

## Activity lifecycle

All activities except EventBasedGateway share this lifecycle. The EventBasedGateway takes care of it's own outbound in the Behaviour.

![Activity lifecycle](https://raw.github.com/paed01/bpmn-elements/master/docs/activity-lifecycle.png)

## `new Activity(Behaviour, activityDefinition, context)`

Arguments:
- `Behaviour`: activity [Behaviour](/docs/Extend.md) function, called with new
- `activityDefinition`: activity definition object from serializable context
- `context`: [shared context](/docs/Context.md)

Activity properties:
- `id`: activity id
- `type`: activity type
- `name`: activity name
- `attachedTo`: activity is attached to, e.g. a BoundaryEvent
- `Behaviour`: passed activity Behaviour function, invoked with new
- `behaviour`: activity behaviour from serializable context
- `broker`: activity [broker](https://github.com/paed01/smqp)
- `counters`: counters for completed runs etc
- `environment`: shared [environment](/docs/Environment)
- `execution`: getter for current [execution instance](/docs/ActivityExecution.md)
- `executionId`: current unique execution id
- `extensions`: object with [extensions](/docs/Extension.md)
- `inbound`: list of inbound sequence flows
- `isRunning`: boolean indicating if the activity is running
- `isStart`: boolean indicating if the activity a start activity
- `isSubProcess`:  boolean indicating if the activity is a sub process
- `logger`: activity [logger](/docs/Environment.md#logger) instance
- `outbound`: list of outbound sequence flows
- `parent`: activity parent
  * `id`: id of parent
  * `type`: parent type
- `parentElement`: activity parent process or sub process reference
- `lane`: activity lane reference if any
- `status`: current run status
  * `entered`: Run entered, triggered by taken inbound flow
  * `started`: Run started
  * `executing`: Executing activity behaviour
  * `executed`: Activity behaviour execution completed successfully
  * `end`: Run end, take outbound flows
  * `discard`: Entering discard run, triggered by discarded inbound flow
  * `discarded`: Run was discarded, discard outbound flows
  * `error`: Activity behaviour execution failed, discard run
  * `formatting`: Formatting next run message
- `stopped`: boolean indicating if the activity is in a stopped state

### `activate()`

Start listening on inbound sequence flow(s) events.

### `deactivate()`

Stop listening for inbound sequence flow(s) events.

### `discard()`

Discard activity. If the activity is running - discard run.

### `getApi(message)`

Get activity api.

Arguments:
- `message`: activity broker message

Returns activity [api](/docs/SharedApi.md)

### `getActivityById(id)`

Get [activity](/docs/Activity.md) by id from context.

### `getState()`

Get activity state.

### `message(messageContent)`

Send message to activity. Queues message to activity.

### `next()`

Take next message in run-queue. Only appears if environment settings have `step: true`.

### `on(eventName, handler[, eventOptions])`

Listen for events.

Arguments:
- `eventName`: name of event
- `handler`: required function called when events occur
  - `api`: [activity api](/docs/SharedApi.md)
- `eventOptions`: passed to underlying broker as consume options

### `once(eventName, handler[, eventOptions])`

Listen for event.

Arguments:
- `eventName`: name of event
- `handler`: required function called when event occur
  - `api`: [activity api](/docs/SharedApi.md)
- `eventOptions`: passed to underlying broker as consume options

### `recover(state)`

Recover activity from state.

### `resume()`

Resume recovered or stopped activity.

### `run([runContent])`

Run activity.

Arguments:
- `runContent`: optional object containing extra content for the broker run messages.

### `stop()`

Stop activity run.

### `waitFor(eventName[, onMessage])`

Wait for event to occur as promised.

Arguments:
- `eventName`: name of event
- `onMessage`: optional message callback for event filtering purposes. Return false if the promise should not resolve. Called with the following arguments:
  - `routingKey`: broker message routing key
  - `message`: actual message that match event name
  - `owner`: message owner, in this case probably the actual activity instance

Returns Promise that will resolve with [activity api](/docs/SharedApi.md) on event name or reject on error.

### `evaluateOutbound(brokerMessage, discardRestAtTake, callback)`

Evaluate all outbound sequence flows.

Arguments:
- `brokerMessage`: broker message that will be passed to condition
- `discardRestAtTake`: boolean, discard all other outbound flows if one flow is taken
- `callback`: function with signature, `(err, outbound)`
  - `err`: occasional error
  - `outbound`: list with flow actions, i.e. discard or take
      - `id`: outbound flow id
      - `action`: discard or take as string
      - `isDefault`: boolean indicating if flow is default flow
      - `result`: result of condition
      - `message`: optional message passed from argument `brokerMessage.content.message`
