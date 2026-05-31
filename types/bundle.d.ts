// Hand-written entry for dts-buddy. Re-exports the runtime classes once each
// and the shared interfaces in one place so the emitted bundle has a single
// declaration per name (no `_1` aliases, no per-module duplicates).
//
// Submodule type entries (`bpmn-elements/events`, `…/tasks`, etc.) are
// emitted as trivial re-export blocks by `scripts/build-types.js`, so every
// public name needs a home here.
export * from './interfaces.js';

export { Activity } from '../src/activity/Activity.js';
export { ActivityExecution } from '../src/activity/ActivityExecution.js';
export { BpmnErrorActivity as BpmnError } from '../src/error/BpmnError.js';
export { Context } from '../src/Context.js';
export { Definition } from '../src/definition/Definition.js';
export { DefinitionExecution } from '../src/definition/DefinitionExecution.js';
export { DummyActivity as Dummy } from '../src/activity/Dummy.js';
export { DummyActivity as TextAnnotation } from '../src/activity/Dummy.js';
export { DummyActivity as Group } from '../src/activity/Dummy.js';
export { DummyActivity as Category } from '../src/activity/Dummy.js';
export { Environment } from '../src/Environment.js';
export { EnvironmentDataObject as DataObject } from '../src/io/EnvironmentDataObject.js';
export { EnvironmentDataStore as DataStore } from '../src/io/EnvironmentDataStore.js';
export { EnvironmentDataStoreReference as DataStoreReference } from '../src/io/EnvironmentDataStoreReference.js';
export { Escalation } from '../src/activity/Escalation.js';
export { IoSpecification as InputOutputSpecification } from '../src/io/InputOutputSpecification.js';
export { Lane } from '../src/process/Lane.js';
export { LoopCharacteristics as MultiInstanceLoopCharacteristics } from '../src/tasks/LoopCharacteristics.js';
export { Message } from '../src/activity/Message.js';
export { Process } from '../src/process/Process.js';
export { Properties } from '../src/io/Properties.js';
export { ServiceImplementation } from '../src/tasks/ServiceImplementation.js';
export { Signal } from '../src/activity/Signal.js';
export { StandardLoopCharacteristics } from '../src/tasks/StandardLoopCharacteristics.js';

export { Association, MessageFlow, SequenceFlow } from '../src/flows/index.js';
export {
  BoundaryEvent,
  BoundaryEventBehaviour,
  EndEvent,
  EndEventBehaviour,
  IntermediateCatchEvent,
  IntermediateCatchEventBehaviour,
  IntermediateThrowEvent,
  IntermediateThrowEventBehaviour,
  StartEvent,
  StartEventBehaviour,
} from '../src/events/index.js';
export {
  EventBasedGateway,
  EventBasedGatewayBehaviour,
  ExclusiveGateway,
  ExclusiveGatewayBehaviour,
  InclusiveGateway,
  InclusiveGatewayBehaviour,
  ParallelGateway,
  ParallelGatewayBehaviour,
} from '../src/gateways/index.js';
// dts-buddy collapses multi-aliased exports to a single name (the last in source
// order), so the canonical name must come *after* its aliases — otherwise the
// alias wins and the root module loses the canonical name that the
// `bpmn-elements/tasks` re-export depends on.
export {
  CallActivity,
  CallActivityBehaviour,
  ReceiveTask,
  ReceiveTaskBehaviour,
  ServiceTask as BusinessRuleTask,
  ServiceTask as SendTask,
  ServiceTask,
  ServiceTaskBehaviour,
  ScriptTask,
  ScriptTaskBehaviour,
  SignalTask as ManualTask,
  SignalTask as UserTask,
  SignalTask,
  SignalTaskBehaviour,
  SubProcess as AdHocSubProcess,
  SubProcess,
  SubProcessBehaviour,
  Task,
  TaskBehaviour,
  Transaction,
} from '../src/tasks/index.js';
export {
  CancelEventDefinition,
  CompensateEventDefinition,
  ConditionalEventDefinition,
  EscalationEventDefinition,
  ErrorEventDefinition,
  LinkEventDefinition,
  MessageEventDefinition,
  SignalEventDefinition,
  TerminateEventDefinition,
  TimerEventDefinition,
} from '../src/eventDefinitions/index.js';

export { ActivityError, RunError } from '../src/error/Errors.js';
