bpmn-elements
=============

[![Build Status](https://travis-ci.com/paed01/bpmn-elements.svg?branch=coverage)](https://travis-ci.com/paed01/bpmn-elements)[![Coverage Status](https://coveralls.io/repos/github/paed01/bpmn-elements/badge.svg?branch=coverage)](https://coveralls.io/github/paed01/bpmn-elements?branch=coverage)

Isomorphic JavaScript BPMN 2.0 workflow elements suitable for bundling into frontend script or just required into your nodejs project.

- [Examples](/docs/Examples.md)
- [Handle extensions](/docs/Extension.md)
- [Write your own behaviour](/docs/Extend.md)

# Supported elements

The following elements are tested and supported.

- [Definition](/docs/Definition.md): Executable BPMN 2 definition
- [Process](/docs/Process.md): Executes and keeps track of activity elements
- BpmnError
- BoundaryEvent
- CancelEventDefinition
- ConditionalEventDefinition
- CompensateEventDefinition
  - compensate by outbound Association
- DataObject
- EndEvent
- Error
- ErrorEventDefinition
  - throw
  - catch
- EscalationEventDefinition
  - throw
  - catch
- EventBasedGateway
- ExclusiveGateway
- InclusiveGateway
- IntermediateCatchEvent
- IntermediateThrowEvent
- IoSpecification
- LinkEventDefinition
  - throw
  - catch
- MessageEventDefinition
  - throw
  - catch
- MessageFlow
- [MultiInstanceLoopCharacteristics](/docs/MultiInstanceLoopCharacteristics.md)
- [ParallelGateway](/docs/ParallelGateway.md)
- ReceiveTask
- ScriptTask
- [SequenceFlow](/docs/SequenceFlow.md)
- ServiceImplementation: ServiceTask implementation attribute behaviour
- [ServiceTask](/docs/ServiceTask.md)
  - BusinessRuleTask: Same behaviour as ServiceTask
  - SendTask: Same behaviour as ServiceTask
- Signal
- SignalEventDefinition
  - throw
  - catch
- SignalTask
  - ManualTask
  - UserTask
- StandardLoopCharacteristics
- [StartEvent](/docs/StartEvent.md)
- SubProcess
- Task
- TerminateEventDefinition
- [TimerEventDefinition](/docs/TimerEventDefinition.md)
  - timeDuration
  - timeDate
  - timeCycle
- Transaction

All activities share the same [base](/docs/Activity.md) and and [api](/docs/SharedApi.md).
