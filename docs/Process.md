# Process

## `new Process(processDefinition, context)`

Arguments:

- `processDefinition`: process definition object from serializable context
- `context`: [shared context](/docs/Context.md)

Process properties:

- `id`: process id
- `type`: process type
- `name`: process name
- `isExecutable`: boolean indicating that the process is executable
- `broker`: process [broker](https://github.com/paed01/smqp)
- `context`: passed shared context
- `counters`: counters for completed runs etc
- `environment`: shared [environment](/docs/Environment)
- `execution`: getter for current execution instance
- `executionId`: current unique execution id
- `isRunning`: boolean indicating if the process is running
- `logger`: process [logger](/docs/Environment.md#logger) instance
- `parent`: process parent
  - `id`: id of parent
  - `type`: parent type
- `status`: current status
- `stopped`: boolean indicating if the process is in a stopped state
- `lanes`: list of process Lane instances

### `getApi(message)`

Get process or activity api.

Arguments:

- `message`: process or activity broker message

Returns [api](/docs/SharedApi.md).

### `getActivities()`

Get all process [activity instances](/docs/Activity.md).

### `getActivityById(id)`

Get [activity instance](/docs/Activity.md) by id.

### `getLaneById(id)`

Get process swim lane by id.

### `getSequenceFlows()`

Get all process sequences flows.

### `getStartActivities([filterOptions])`

Get start activities, optionally filtered by referenced event definition.

Arguments:

- `filterOptions`: optional filter
  - `referenceId`: optional reference id (e.g. message or signal id)
  - `referenceType`: optional reference type, e.g. `'message'` or `'signal'`

### `getPostponed()`

Get all activities that are in a postponed state, e.g. waiting for user input.

### `getState()`

Get process state.

### `init([useAsExecutionId])`

Allocate an execution id and emit `process.init` event without starting the run.

Arguments:

- `useAsExecutionId`: optional override for the generated execution id

### `shake([startId])`

Walk the activity graph from the given start id, or every start activity when omitted.

### `signal(message)`

Delegate a signal message to interested activities, e.g. SignalEventDefinition, SignalTask, ReceiveTask.

### `cancelActivity(message)`

Delegate a cancel message to interested activities.

### `sendMessage(message)`

Deliver a message to a target activity or to a start activity that references it. Starts the process if a target is found and the process is idle.

### `on(eventName, handler[, eventOptions])`

Listen for events.

Arguments:

- `eventName`: name of event
- `handler`: required function called when events occur
  - `api`: activity or process [api](/docs/SharedApi.md)
- `eventOptions`: passed to underlying broker as consume options

### `once(eventName, handler[, eventOptions])`

Listen for event.

Arguments:

- `eventName`: name of event
- `handler`: required function called when event occur
  - `api`: activity or process [api](/docs/SharedApi.md)
- `eventOptions`: passed to underlying broker as consume options

### `recover([state])`

Recover process from state.

Returns process.

### `resume()`

Resume process from a stopped or recovered state.

Returns process.

### `run()`

Run process.

### `stop()`

Stop process run.

### `waitFor(eventName[, onMessage])`

Wait for event to occur as promised.

Arguments:

- `eventName`: name of event
- `onMessage`: optional message callback for event filtering purposes. Return false if the promise should not resolve. Called with the following arguments
  - `routingKey`: broker message routing key
  - `message`: actual message that match event name
  - `owner`: broker owner, in this case probably the actual activity

Returns Promise that will resolve with element [api](/docs/SharedApi.md) on event name or reject on error.
