bpmn-elements
=============

Executable workflow elements based on BPMN 2.0.

[![Build Status](https://travis-ci.org/paed01/bpmn-elements.svg?branch=master)](https://travis-ci.org/paed01/bpmn-elements)

- [Examples](/docs/Examples.md)
- [Extension](/docs/Extension.md)

# Supported elements

The following elements are tested and supported.

- Definition: Executes processes
- Process: Executes elements
- BoundaryEvent
- Error
- DataObject
- EndEvent
- ErrorEventDefinition
- ExclusiveGateway
- InclusiveGateway
- IntermediateCatchEvent
- IoSpecification
- MessageEventDefinition
- MessageFlow
- ParallelGateway
- ScriptTask
- SequenceFlow
- ServiceImplementation: Service implementation
- ServiceTask
  - SendTask
- SignalTask
  - ManualTask
  - ReceiveTask
  - UserTask
- StartEvent
- SubProcess
- Task
- TerminateEventDefinition
- TimerEventDefinition
  - duration only
- MultiInstanceLoopCharacteristics
