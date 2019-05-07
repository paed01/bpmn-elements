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

Run definition.

Arguments:
- `callback`: optional callback
  - `err`: occasional error
  - `message`: last message

### `getActivityById(id)`

Get activity by id

### `getPostponed()`

Get activities that are in a postponed state.

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

## `resume([callback])`

Resume stopped or recovered definition.

Arguments:
- `callback`: optional callback
  - `err`: occasional error
  - `message`: last message

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

