# Activity execution

Shared activity execution.

## `new ActivityExecution(activity, context)`

Arguments:

- `activity`: parent [activity](/docs/Activity.md) function
- `context`: [shared context](/docs/Context.md)

Properties:

- `completed`: has execution completed
- `source`: instance of activity [behaviour](/docs/Extend.md)

### `discard()`

Discard execution.

### `execute(executeMessage)`

Execute activity behaviour with message.

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
