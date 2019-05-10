Activity
========

Shared activity behaviour.

## `Activity(Behaviour, activityDefinition, context)`

Activity ctorish.

Arguments:
- `Behaviour`: activity [Behaviour](/docs/Extend.md) function
- `activityDefinition`: activity definition object from serializable context
- `context`: [shared context](/docs/Context.md)

Activity properties:
- `id`: activity id
- `type`: activity type
- `name`: activity name
- `attachedTo`: activity is attached to, e.g. a BoundaryEvent
- `Behaviour`: passed activity Behaviour function
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
- `logger`: activity [logger](/docs/Environmnt.md#logger) instance
- `outbound`: list of outbound sequence flows
- `parent`: activity parent
  - `id`: id of parent
  - `type`: parent type
- `status`: current status
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

### `getErrorById(id)`

Utility function that fetches Bpmn Error from context.

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
- `runContent`: optional object containing extra content for the broker messages.

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
