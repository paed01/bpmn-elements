bpmn-elements
=============

[![Build Status](https://travis-ci.org/paed01/bpmn-elements.svg?branch=master)](https://travis-ci.org/paed01/bpmn-elements)

Isomorphic JavaScript BPMN workflow elements suitable for bundling into frontend script or just required into your nodejs project.

- [Examples](/docs/Examples.md)
- [Extending behaviour](/docs/Extend.md)

# Supported elements

The following elements are tested and supported.

- [Definition](/docs/Definition.md): Executable BPMN 2 definition
- [Process](/docs/Process.md): Executes and keeps track of activity elements
- BpmnError
- BoundaryEvent
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
- [ParallelGateway](/docs/ParallelGateway.md)
- ReceiveTask
- ScriptTask
- SequenceFlow
- ServiceImplementation: ServiceTask implementation attribute behaviour
- [ServiceTask](/docs/ServiceTask.md)
  - SendTask: Same behaviour as ServiceTask
- Signal
- SignalEventDefinition
  - throw
  - catch
- SignalTask
  - ManualTask
  - UserTask
- StandardLoopCharacteristics
- StartEvent
- SubProcess
- Task
- TerminateEventDefinition
- TimerEventDefinition
  - duration only
- [MultiInstanceLoopCharacteristics](/docs/MultiInstanceLoopCharacteristics.md)

All activities share the same [base](/docs/Activity.md) and and [api](/docs/SharedApi.md).
