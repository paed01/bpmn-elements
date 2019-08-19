Changelog
=========

# 0.8.1

- Expose SequenceFlow name in published events and in api

# 0.8.0

- Support StandardLoopCondition

# 0.7.0

- Support LinkEventDefinition

# 0.6.1

- Defensive resume #8

# 0.6.0

Focused on messaging.

## Breaking
- ReceiveTask expects referenced message, it can still be signaled
- IntermediateCatchEvent that lacks event definitions now expects to be signaled
- Catching MessageEventDefinition expects referenced message. or at least a matching message id

## Additions
- IntermediateThrowEvent with MessageEventDefinition now throws Message
- Start activities conforming to the same flow is discarded when the flow reaches an end activity, unless a join is put in between

# 0.5.0

- allow a waiting UserTask to trigger an execution error
- catch signal fired before event execution

# 0.4.0

## Breaking
- Catching ErrorEventDefinition now catches BpmnErrors. Support for catching by error code and anonymous errors is still supported
- Event with throwing ErrorEventDefinition now throws non-fatal BpmnErrors

## Additions
- Expose element name on Api
- Extension function `deactivate` is now actually called, called on leave and stop
