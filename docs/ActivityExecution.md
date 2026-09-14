# Activity execution

Shared activity execution.

![Activity execution](https://raw.github.com/paed01/bpmn-elements/master/docs/activity-execution.png)

## `new ActivityExecution(activity, context)`

Arguments:

- `activity`: parent [activity](/docs/Activity.md) function
- `context`: [shared context](/docs/Context.md)

Properties:

- `completed`: has execution completed
- `source`: instance of activity [behaviour](/docs/Extend.md)

### `activate()`

Bind the execute queue and start consuming execute and api messages. Called internally when an activity begins executing.

### `deactivate()`

Cancel execute and api consumers and unbind the execute queue. Counterpart to `activate()`.

### `discard()`

Discard execution.

### `execute(executeMessage)`

Execute activity behaviour with message.

### `passthrough(executeMessage)`

Pass an execute message straight to the behaviour, executing first if no source is set up yet. Used by loop characteristics for multi-instance iterations.

### `getApi(message)`

Get activity [api](/docs/SharedApi.md).

### `getPostponed()`

Get activity executions that are in a postponed state. Returns list of [api](/docs/SharedApi.md).

### `getState()`

Get activity execution state.

### `recover([state])`

Recover activity execution state.

### `stop()`

Stop execution
