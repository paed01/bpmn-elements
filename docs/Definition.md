Definition
==========

Executable BPMN 2 definition. Pass [context](/docs/Context.md) and execute.

## `Definition(context[, options])`

Definition constructorish.

Arguments:
- `context`: context instance, see [Context](/docs/Context.md)
- `options`: optional options that will be passed to [environment](/docs/Environment.md)

Returns api with properties:
- `id`: definition id
- `name`: definition name
- `type`: definition type
- `logger`: logger instance
- `context`: passed context
- `counters`: counters
- `executionId`: current execution id
- `status`: status
- `execution`: current execution
- `environment`: definition environment instance, see [Environment](/docs/Environment.md)
- `isRunning`: boolean indicating if the definition is running
- `broker`: definition message broker

### `run([callback])`

Run definition with optional callback. The callback will be called on error, when run completes, or run is stopped.

Arguments:
- `callback`: optional callback
  - `err`: occasional error
  - `api`: [api](/docs/SharedApi.md)

### `getActivityById(id)`

Get activity by id

### `shake([activityId])`

Shake out the sequences in processes starting with start events, or by declaring an activity.

Arguments:
- `activityId`: optional activity id to shake out sequences from

Returns:
Object with activity id(s) as property and sequences. The sequence property is an array since there can be looped sequences.

### `signal(message)`

Delegate a signal message to all interested parties, usually MessageEventDefinition, SignalEventDefinition, SignalTask (user, manual), and ReceiveTask.

Arguments:
- `message`: optional object
  - `id`: optional task/element id to signal, also matched with Message and Signal id. If not passed only anonymous Signal- and MessageEventDefinitions will pick up the signal.
  - `executionId`: optional execution id to signal, specially for looped tasks, also works for signal tasks that are not looped
  - `[name]*`: any other properties will be forwarded as message to activity

### `cancelActivity(message)`

Delegate a cancel message to all interested parties.

Arguments:
- `message`: optional object
  - `id`: optional task/element id to cancel
  - `executionId`: optional execution id to cancel
  - `[name]*`: any other properties will be forwarded as message to activity

### `getPostponed()`

Get list of elements that are in a postponed state.

### `getProcesses()`

Get all processes.

### `getProcessById(id)`

Get process by id.

### `getExecutableProcesses()`

Get all executable processes.

### `getState()`

Get definition state.

## `recover(state)`

Recover definition.

Arguments:
- `state`: state from definition `getState()`

Returns definition.

## `resume([callback])`

Resume stopped or recovered definition with optional callback. The callback will be called on error, when run completes, or run is stopped.

Arguments:
- `callback`: optional callback
  - `err`: occasional error
  - `api`: [api](/docs/SharedApi.md)

Returns definition.

### `on(eventName, handler[, eventOptions])`

Listen for events.

Arguments:
- `eventName`: name of event
- `handler`: required function called when events occur
  - `api`: element [api](/docs/SharedApi.md)
- `eventOptions`: passed to underlying broker as consume options

### `once(eventName, handler[, eventOptions])`

Listen for event.

Arguments:
- `eventName`: name of event
- `handler`: required function called when event occur
  - `api`: element [api](/docs/SharedApi.md)
- `eventOptions`: passed to underlying broker as consume options

### `stop()`

Stop definition run.

### `waitFor(eventName[, onMessage])`

Wait for event to occur as promised.

Arguments:
- `eventName`: name of event
- `onMessage`: optional message callback for event filtering purposes. Return false if the promise should not resolve. Called with the following arguments
  - `routingKey`: broker message routing key
  - `message`: actual message that match event name
  - `owner`: broker owner, in this case probably the actual definition

Returns Promise that will resolve with element [api](/docs/SharedApi.md) on event name or reject on error.

