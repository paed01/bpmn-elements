Changelog
=========

# 1.0.0

Make it easier and possible to signal activities from [definition](/docs/Definition.md) by calling `definition.signal(message)`.

## Breaking
- MessageEventDefinition and SignalEventDefinition will only listens for pre-execution messages if contained in a starting event

## Bugfix
- Parallel looped ReceiveTask iterations all completed with one message, that was not intended and doesn't anymore. One message equals one completed iteration

## Minor
- Bump to smqp@2.2
- Bump dev dependencies

# 0.13.1

- Bump to smqp@2
- Bump dev dependencies

# 0.12.1

- Patch `moddle-context-serializer` to relieve project from nasty bug where message flows sourcing from empty lane threw find of undefined

# 0.12.0

- Allow override of default expression handling and parsing
- Map BusinessRuleTask to ServiceTask

# 0.11.0

- Execute extensions when initiating process

# 0.10.0

- Recover now recovers environment as well

## Bugfix
- getting state no longer throws if a placeholder activity is in activities

# 0.9.0

## Addition
- Compensation is now supported, but only by association

## Bugfix
- Fix weird code where context ignores passed SequenceFlow and MessageFlow Behaviour function when making new instances

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
