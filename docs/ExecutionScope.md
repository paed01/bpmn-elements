ExecutionScope
==============

When calling services and scripts the following scope is provided.

Properties:
- `id`: calling element id
- `type`: calling element type
- `fields`: execution message fields
- `content`: execution message content
- `properties`: execution message properties
- `environment`: [environment](/docs/Environment.md)
- `logger`: calling element [logger](/docs/Environment.md#logger) instance
- `ActivityError`: reference to error class
- `BpmnError`: reference to error class

## `resolveExpression(expression)`

Passed to environment resolve expression function.

## `ActivityError(message, sourceMessage[, inner])`

Reference to activity error.

## `BpmnError(message[, behaviour, sourceMessage, inner])`

Reference to Bpmn error.
