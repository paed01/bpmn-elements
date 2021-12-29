Context
=======

Shared context.

## `new Context(serializableContext[, environment])`

Arguments:
- `serializableContext`: serializable context. Maybe from [moddle-context-serializer](https://www.npmjs.com/package/moddle-context-serializer)
- `environment`: optional [Environment](/docs/Environment.md) instance

Returns api.

Properties:
- `id`: definition id
- `name`: definition name
- `type`: definition type
- `sid`: some unique id
- `definitionContext`: the passed serializable context
- `environment`: [Environment](/docs/Environment.md) instance

### `clone([environment])`

Clone context.

Arguments:
- `environment`: optional new environment for cloned context

Returns clone of context with new activity instances.

### `getActivities([scopeId])`

Get all [activity instances](/docs/Activity.md) scoped to id.

### `getActivityById(id)`

Get [activity instance](/docs/Activity.md) by id.

### `getExecutableProcesses()`

Get executable processes.

### `getDataObjectById(id)`

Get data object by id.

### `getMessageFlows()`

Get data object by id.

### `getProcessById(id)`

Get process by id.

### `getProcesses()`

Get all processes.

### `getSequenceFlowById(id)`

Get sequence flow instances by id.

### `getSequenceFlows(scopeId)`

Get all sequence flow instances and/or scoped to id.

### `getInboundSequenceFlows(activityId)`

Get activity inbound sequence flows.

### `getOutboundSequenceFlows(activityId)`

Get activity outbound sequence flows.

### `loadExtensions(activity)`

Load [extensions](/docs/Extension.md) for activity.
