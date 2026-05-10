import { Broker } from 'smqp';
import { SerializableContext, SerializableElement } from 'moddle-context-serializer';
export { Activity } from '../src/activity/Activity.js';
import { Activity } from '../src/activity/Activity.js';

import {
  ElementBroker,
  ElementBrokerMessage,
  ElementMessageContent,
  ElementParent,
  ElementState,
  ActivityState,
  ActivityExecutionState,
  IActivityBehaviour,
  IExtension,
  IExpressions,
  IScripts,
  ITimers,
  ILogger,
  ICondition,
  ISequenceFlowCondition,
  ActivityRunStatus,
  ActivityStatus,
  DefinitionRunStatus,
  ProcessRunStatus,
  TimerType,
  parsedTimer,
  EnvironmentSettings,
  EnvironmentOptions,
  EnvironmentState,
  startActivityFilterOptions,
  filterPostponed,
  runCallback,
  completedCounters,
  signalMessage,
  ProcessExecutionState,
  ProcessState,
  DefinitionExecutionState,
  DefinitionState,
  SequenceFlowState,
  MessageFlowState,
  AssociationState,
  MessageFlowReference,
  LoggerFactory,
  Timer,
  RegisteredTimer,
  TimersOptions,
  Script,
  wrappedSetTimeout,
  wrappedClearTimeout,
} from './interfaces.js';

export * from './interfaces.js';

export declare class EventDefinition {
  constructor(activity: Activity, eventDefinitionElement: SerializableElement, context?: ContextInstance, index?: number);
  get id(): string;
  get type(): string;
  get executionId(): string;
  get isThrowing(): boolean;
  get activity(): Activity;
  get broker(): Broker;
  get logger(): ILogger;
  get reference(): {
    id?: string;
    name: string;
    referenceType: string;
  };
  [x: string]: any;
  execute(executeMessage: ElementBrokerMessage): void;
}

export declare class TimerEventDefinition extends EventDefinition {
  /**
   * Parse timer type
   * @param timerType type of timer
   * @param timerValue resolved expression timer string
   */
  parse(timerType: TimerType, timerValue: string): parsedTimer;
}

export declare class ConditionalEventDefinition extends EventDefinition {
  /**
   * Evaluate condition
   * @param message
   * @param callback
   */
  evaluate(message: ElementBrokerMessage, callback: CallableFunction): void;
  /**
   * Handle evaluate result or error
   * @param err Condition evaluation error
   * @param result Result from evaluated condition, completes execution if truthy
   */
  evaluateCallback(err: Error | null, result?: any): void;
  /**
   * Get condition from behaviour
   * @param index Event definition sequence number, used to name registered script
   */
  getCondition(index: number): ICondition | null;
}

export declare abstract class ElementBase {
  get id(): string;
  get type(): string;
  get name(): string;
  get parent(): ElementParent;
  get behaviour(): SerializableElement;
  get broker(): Broker;
  get environment(): Environment;
  get context(): ContextInstance;
  get logger(): ILogger;
}

export declare abstract class Element<T> extends ElementBase {
  get broker(): ElementBroker<T>;
  stop(): void;
  resume(): void;
  getApi(message?: ElementBrokerMessage): Api<T>;
  on(eventName: string, callback: CallableFunction, options?: any): any;
  once(eventName: string, callback: CallableFunction, options?: any): any;
  waitFor(eventName: string, options?: any): Promise<Api<T>>;
}

export declare interface DefinitionExecution {
  get id(): string;
  get type(): string;
  get broker(): Broker;
  get environment(): Environment;
  get context(): ContextInstance;
  get executionId(): string;
  get stopped(): boolean;
  get completed(): boolean;
  get status(): string;
  get processes(): Process[];
  get postponedCount(): number;
  get isRunning(): boolean;
  get activityStatus(): ActivityStatus;
  execute(executeMessage: ElementBrokerMessage): void;
  getProcesses(): Process[];
  getProcessById(processId: string): Process;
  getProcessesById(processId: string): Process[];
  getProcessByExecutionId(processExecutionId: string): Process;
  getRunningProcesses(): Process[];
  getExecutableProcesses(): Process[];
  getPostponed(filterFn?: filterPostponed): Api<ElementBase>[];
}

export declare interface ActivityExecution {
  get completed(): boolean;
  get executionId(): string;
  get source(): IActivityBehaviour;
  execute(executeMessage: ElementBrokerMessage): void;
}

export declare function ActivityBehaviour(activityDef: SerializableElement, context: ContextInstance): Activity;

export declare interface Api<T> extends ElementBrokerMessage {
  get id(): string;
  get type(): string;
  get name(): string;
  get executionId(): string;
  get environment(): Environment;
  get broker(): ElementBroker<T>;
  get owner(): T;
  cancel(message?: signalMessage, options?: any): void;
  discard(): void;
  fail(error: Error): void;
  signal(message?: signalMessage, options?: any): void;
  stop(): void;
  resolveExpression(expression: string): any;
  sendApiMessage(action: string, content?: signalMessage, options?: any): void;
  getPostponed(...args: any[]): any[];
  createMessage(content?: Record<string, any>): any;
  getExecuting(): Api<T>[];
}

interface ExecutionScope {
  /** Calling element id */
  id: string;
  /** Calling element type */
  type: string;
  /** Execution message fields */
  fields: any;
  /** Execution message content */
  content: ElementMessageContent;
  /** Execution message properties */
  properties: any;
  environment: Environment;
  /** Calling element logger instance */
  logger?: ILogger;
  /**
   * Resolve expression with the current scope
   * @param expression expression string
   * @returns Whatever the expression returns
   */
  resolveExpression: (expression: string) => any;
  ActivityError: ActivityError;
}

export declare abstract class MessageElement {
  get id(): string;
  get type(): string;
  get name(): string;
  get parent(): ElementParent;
  resolve(executionMessage: ElementBrokerMessage): {
    parent: ElementParent;
    name: string;
    id: string;
    type: string;
    messageType: string;
  };
}

export declare class Environment {
  constructor(options?: EnvironmentOptions);
  options: Record<string, any>;
  expressions: IExpressions;
  extensions: Record<string, IExtension>;
  scripts: IScripts;
  timers: ITimers;
  Logger: LoggerFactory;
  get settings(): EnvironmentSettings;
  get variables(): Record<string, any>;
  get output(): Record<string, any>;
  set services(arg: any);
  get services(): any;
  getState(): EnvironmentState;
  recover(state?: EnvironmentState): Environment;
  clone(overrideOptions?: EnvironmentOptions): Environment;
  assignVariables(newVars: Record<string, any>): void;
  assignSettings(newSettings: Record<string, any>): Environment;
  registerScript(activity: any): Script;
  getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
  getServiceByName(serviceName: string): CallableFunction;
  resolveExpression(expression: string, message?: ElementBrokerMessage, expressionFnContext?: any): any;
  addService(name: string, fn: CallableFunction): void;
}

export declare function Context(definitionContext: SerializableContext, environment?: Environment): ContextInstance;
export declare class ContextInstance {
  constructor(definitionContext: SerializableContext, environment?: Environment);
  get id(): string;
  get name(): string;
  get type(): string;
  /** Unique context instance id */
  get sid(): string;
  get definitionContext(): SerializableContext;
  get environment(): Environment;
  /** Context owner, Process or SubProcess activity */
  get owner(): Process | Activity | undefined;
  getActivityById<T>(activityId: string): T;
  getSequenceFlowById(sequenceFlowId: string): SequenceFlow;
  getInboundSequenceFlows(activityId: string): SequenceFlow[];
  getOutboundSequenceFlows(activityId: string): SequenceFlow[];
  getInboundAssociations(activityId: string): Association[];
  getOutboundAssociations(activityId: string): Association[];
  getActivities(scopeId?: string): ElementBase[];
  getSequenceFlows(scopeId?: string): SequenceFlow[];
  getAssociations(scopeId?: string): Association[];
  clone(newEnvironment?: Environment): ContextInstance;
  getProcessById(processId: string): Process;
  getNewProcessById(processId: string): Process;
  getProcesses(): Process[];
  getExecutableProcesses(): Process[];
  getMessageFlows(sourceId: string): MessageFlow[];
  getDataObjectById(referenceId: string): any;
  getDataStoreById(referenceId: string): any;
  getStartActivities(filterOptions?: startActivityFilterOptions, scopeId?: string): Activity[];
  loadExtensions(activity: ElementBase): IExtension;
}

export declare class Definition extends Element<Definition> {
  constructor(context: ContextInstance, options?: EnvironmentOptions);
  get counters(): completedCounters;
  get execution(): DefinitionExecution;
  get executionId(): string;
  get isRunning(): boolean;
  get status(): DefinitionRunStatus | undefined;
  get stopped(): boolean;
  get activityStatus(): ActivityStatus;
  run(): Definition;
  run(runContent: Record<string, any>): Definition;
  run(runContent: Record<string, any>, callback: runCallback): Definition;
  run(callback: runCallback): Definition;
  getState(): DefinitionState;
  recover(state?: DefinitionState): Definition;
  resume(): void;
  resume(callback: (err: Error, definitionApi: Api<Definition>) => void): void;
  shake(startId?: string): object;
  getProcesses(): Process[];
  /** get processes marked with isExecutable=true */
  getExecutableProcesses(): Process[];
  getRunningProcesses(): Process[];
  getProcessById(processId: string): Process;
  getActivityById(childId: string): Activity;
  getElementById<T>(elementId: string): Element<T>;
  getPostponed(filterFn?: filterPostponed): Api<ElementBase>[];
  /** Send delegated signal message */
  signal(message: any): void;
  cancelActivity(message: any): void;
  sendMessage(message: any): void;
}

export declare class Process extends Element<Process> {
  constructor(processDef: SerializableElement, context: ContextInstance);
  get isExecutable(): boolean;
  get counters(): completedCounters;
  get lanes(): Lane[] | undefined;
  get extensions(): IExtension;
  get stopped(): boolean;
  get isRunning(): boolean;
  get executionId(): string;
  get execution(): ProcessExecution;
  get status(): ProcessRunStatus | undefined;
  get activityStatus(): ActivityStatus;
  init(useAsExecutionId?: string): void;
  run(runContent?: Record<string, any>): void;
  getState(): ProcessState;
  recover(state?: ProcessState): Process;
  shake(startId?: string): void;
  signal(message: any): any;
  cancelActivity(message: any): any;
  sendMessage(message: any): void;
  getActivityById<T>(childId: string): T;
  getActivities(): Activity[];
  getStartActivities(filterOptions?: startActivityFilterOptions): Activity[];
  getSequenceFlows(): SequenceFlow[];
  getLaneById(laneId: string): Lane | undefined;
  getPostponed(filterFn: filterPostponed): Api<ElementBase>[];
}

export declare interface ProcessExecution {
  get isSubProcess(): boolean;
  get broker(): Broker;
  get environment(): Environment;
  get context(): ContextInstance;
  get executionId(): string;
  get stopped(): boolean;
  get completed(): boolean;
  get status(): string;
  get postponedCount(): number;
  get isRunning(): boolean;
  get activityStatus(): ActivityStatus;
  execute(executeMessage: ElementBrokerMessage): void;
  getPostponed(filterFn: filterPostponed): Api<ElementBase>[];
  getActivities(): Activity[];
  getActivityById<T>(activityId: string): T;
  getSequenceFlows(): SequenceFlow[];
  getApi(message?: ElementBrokerMessage): Api<ElementBase>;
}

export declare class Lane extends ElementBase {
  constructor(process: Process, laneDefinition: SerializableElement);
  /** Process broker */
  get broker(): Broker;
  get process(): Process;
}

export declare class SequenceFlow extends Element<SequenceFlow> {
  constructor(flowDef: SerializableElement, context: ContextInstance);
  get sourceId(): string;
  get targetId(): string;
  get isDefault(): boolean;
  get isSequenceFlow(): boolean;
  get counters(): { take: number; discard: number; looped: number };
  take(content?: any): boolean;
  discard(content?: any): void;
  shake(message: any): number;
  getCondition(): ISequenceFlowCondition | null;
  createMessage(override?: any): object;
  /**
   * Evaluate flow
   * Executes condition if any, default flow is
   * @param fromMessage Activity message
   * @param {evaluateCallback} callback Callback with evaluation result, if truthy flow should be taken
   */
  evaluate(fromMessage: ElementBrokerMessage, callback: (err: Error, result: any) => void): void;
  getState(): SequenceFlowState | undefined;
}

export declare class MessageFlow extends Element<MessageFlow> {
  constructor(flowDef: SerializableElement, context: ContextInstance);
  get source(): MessageFlowReference;
  get target(): MessageFlowReference;
  get counters(): { messages: number };
  activate(): void;
  deactivate(): void;
  getState(): MessageFlowState | undefined;
}

export declare class Association extends Element<Association> {
  constructor(associationDef: SerializableElement, context: ContextInstance);
  get sourceId(): string;
  get targetId(): string;
  get isAssociation(): boolean;
  get counters(): { take: number; discard: number };
  take(content?: any): boolean;
  discard(content?: any): boolean;
  getState(): AssociationState | undefined;
}

export declare class Timers implements ITimers {
  options: TimersOptions;
  constructor(options?: TimersOptions);
  get executing(): Timer[];
  get setTimeout(): wrappedSetTimeout;
  get clearTimeout(): wrappedClearTimeout;
  register(owner?: any): RegisteredTimer;
}

export declare class MessageFormatter {
  id: string;
  broker: Broker;
  logger: ILogger;
  format(message: MessageElement, callback: CallableFunction): void;
}

// Activity is generated from JSDoc in src/activity/Activity.js. Re-exporting keeps
// existing `import('types').Activity` JSDoc references resolving.

export declare class ActivityError extends Error {
  type: string;
  description: string;
  /** Activity that threw error */
  source?: ElementBrokerMessage;
  /** Original error */
  inner?: Error;
  code?: string;
  constructor(description: string, sourceMessage: any, inner?: Error);
}
