export * from './types.js';
import { IActivityBehaviour, ActivityBehaviour, EventDefinition, MessageElement, ISODurationApi } from './types.js';

declare module 'bpmn-elements' {
  export var BoundaryEvent: typeof ActivityBehaviour;
  export var CallActivity: typeof ActivityBehaviour;
  export var Dummy: typeof ActivityBehaviour;
  export var TextAnnotation: typeof Dummy;
  export var Group: typeof Dummy;
  export var Category: typeof Dummy;
  export var EndEvent: typeof ActivityBehaviour;
  export var EventBasedGateway: typeof ActivityBehaviour;
  export var ExclusiveGateway: typeof ActivityBehaviour;
  export var InclusiveGateway: typeof ActivityBehaviour;
  export var IntermediateCatchEvent: typeof ActivityBehaviour;
  export var IntermediateThrowEvent: typeof ActivityBehaviour;
  export var ParallelGateway: typeof ActivityBehaviour;
  export var ReceiveTask: typeof ActivityBehaviour;
  export var ScriptTask: typeof ActivityBehaviour;
  export var ServiceTask: typeof ActivityBehaviour;
  export var SendTask: typeof ServiceTask;
  export var BusinessRuleTask: typeof ServiceTask;
  export var SignalTask: typeof ActivityBehaviour;
  export var ManualTask: typeof SignalTask;
  export var UserTask: typeof SignalTask;
  export var StartEvent: typeof ActivityBehaviour;
  export var SubProcess: typeof ActivityBehaviour;
  export var Task: typeof ActivityBehaviour;
  export var Transaction: typeof ActivityBehaviour;

  export var CancelEventDefinition: EventDefinition;
  export var CompensateEventDefinition: EventDefinition;
  export var ConditionalEventDefinition: EventDefinition;
  export var ErrorEventDefinition: EventDefinition;
  export var EscalationEventDefinition: EventDefinition;
  export var LinkEventDefinition: EventDefinition;
  export var MessageEventDefinition: EventDefinition;
  export var SignalEventDefinition: EventDefinition;
  export var TerminateEventDefinition: EventDefinition;

  export const enum TimerType {
    TimeCycle = 'timeCycle',
    TimeDuration = 'timeDuration',
    TimeDate = 'timeDate',
  }

  type parsedTimer = {
    /** Expires at date time */
    expireAt?: Date;
    /** Repeat number of times */
    repeat?: number;
    /** Delay in milliseconds */
    delay?: number;
  };

  export class TimerEventDefinition extends EventDefinition {
    /**
     * Parse timer type
     * @param timerType type of timer
     * @param timerValue resolved expression timer string
     */
    parse(timerType: TimerType, timerValue: string): parsedTimer;
  }

  export class Message extends MessageElement {}
  export class Signal extends MessageElement {}
  export class Escalation extends MessageElement {}

  export var ISODuration: ISODurationApi;
}

declare module 'bpmn-elements/events' {
  export var BoundaryEventBehaviour: IActivityBehaviour;
  export var EndEventBehaviour: IActivityBehaviour;
  export var IntermediateCatchEventBehaviour: IActivityBehaviour;
  export var IntermediateThrowEventBehaviour: IActivityBehaviour;
  export var StartEventBehaviour: IActivityBehaviour;
}

declare module 'bpmn-elements/gateways' {
  export var EventBasedGatewayBehaviour: IActivityBehaviour;
  export var ExclusiveGatewayBehaviour: IActivityBehaviour;
  export var InclusiveGatewayBehaviour: IActivityBehaviour;
  export var ParallelGatewayBehaviour: IActivityBehaviour;
}

declare module 'bpmn-elements/tasks' {
  export var CallActivityBehaviour: IActivityBehaviour;
  export var ReceiveTaskBehaviour: IActivityBehaviour;
  export var ScriptTaskBehaviour: IActivityBehaviour;
  export var ServiceTaskBehaviour: IActivityBehaviour;
  /** Signal-, Manual-, and User-task behaviour */
  export var SignalTaskBehaviour: IActivityBehaviour;
  /** Sub process and Transaction behaviour */
  export var SubProcessBehaviour: IActivityBehaviour;
  export var TaskBehaviour: IActivityBehaviour;
}
