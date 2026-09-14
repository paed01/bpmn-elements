# Context

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
- `owner`: reference to owning process or sub process

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

### `getDataStoreById(id)`

Get data store by id.

### `getMessageFlows(sourceId)`

Get message flows that originate from the given process id.

### `getAssociations([scopeId])`

Get association flows, optionally narrowed to a parent scope.

### `getInboundAssociations(activityId)`

Get inbound association flows for the given activity.

### `getOutboundAssociations(activityId)`

Get outbound association flows for the given activity.

### `getStartActivities([filterOptions, scopeId])`

Get start activities, optionally filtered by referenced event definition or restricted to a parent scope.

Arguments:

- `filterOptions`: optional filter
  - `referenceId`: optional reference id (e.g. message or signal id)
  - `referenceType`: optional reference type, e.g. `'message'` or `'signal'`
- `scopeId`: optional process or sub-process id to restrict the search

### `getActivityParentById(activityId)`

Resolve the parent process or sub-process activity that owns the given activity.

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
