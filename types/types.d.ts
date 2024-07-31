import { Broker } from 'smqp';
import { BrokerState } from 'smqp/types/Broker';
import { Consumer } from 'smqp/types/Queue';
import { MessageMessage, MessageFields, MessageProperties } from 'smqp/types/Message';
import { SerializableContext, SerializableElement } from 'moddle-context-serializer';

declare interface ElementBroker<T> extends Broker {
  get owner(): T;
}

declare type signalMessage = {
  /**
   * Optional signal id
   * - Activity id
   * - Signal-, Message-, Escalation id, etc
   */
  id?: string;
  /**
   * Optional execution id
   * e.g. excutionId of a parallel multi instance user task
   */
  executionId?: string;
  /** Any other input that will be added to completed activity output */
  [x: string]: any;
};

declare interface ElementMessageContent {
  id?: string;
  type?: string;
  executionId?: string;
  parent?: ElementParent;
  [x: string]: any;
}

declare interface ElementBrokerMessage extends MessageMessage {
  content: ElementMessageContent;
}

declare class EventDefinition {
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

declare const enum TimerType {
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

declare class TimerEventDefinition extends EventDefinition {
  /**
   * Parse timer type
   * @param timerType type of timer
   * @param timerValue resolved expression timer string
   */
  parse(timerType: TimerType, timerValue: string): parsedTimer;
}

declare interface ICondition {
  /** Condition type */
  get type(): string;
  [x: string]: any;
  execute(message: ElementBrokerMessage, callback: CallableFunction): void;
}

declare class ConditionalEventDefinition extends EventDefinition {
  /**
   * Evaluate condition
   * @param message
   * @param callback
   */
  evaluate(message: ElementBrokerMessage, callback: CallableFunction): void;
  /**
   * Handle evaluate result or error
   * @param {Error|null} err Condition evaluation error
   * @param {any} result Result from evaluated condition, completes execution if truthy
   */
  evaluateCallback(err: Error | null, result?: unknown): void;
  /**
   * Get condition from behaviour
   * @param index Event definition sequence number, used to name registered script
   */
  getCondition(index: number): ICondition | null;
}

declare abstract class ElementBase {
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

declare abstract class Element<T> extends ElementBase {
  get broker(): ElementBroker<T>;
  stop(): void;
  resume(): void;
  getApi(message?: ElementBrokerMessage): Api<T>;
  on(eventName: string, callback: CallableFunction, options?: any): Consumer;
  once(eventName: string, callback: CallableFunction, options?: any): Consumer;
  waitFor(eventName: string, options?: any): Promise<Api<T>>;
}

declare interface ElementParent {
  get id(): string;
  get type(): string;
  get executionId(): string;
  get path(): ElementParent[];
}

declare type Extension = (activity: ElementBase, context: ContextInstance) => IExtension;
declare interface IExtension {
  activate(message: ElementBrokerMessage): void;
  deactivate(message: ElementBrokerMessage): void;
}

declare interface IExpressions {
  resolveExpression(templatedString: string, context?: any, expressionFnContext?: any): any;
}

declare interface EnvironmentSettings {
  /** true returns dummy service function for service task if not found */
  enableDummyService?: boolean;
  /** true forces activity runs to go forward in steps, defaults to false */
  step?: boolean;
  /** strict mode, see documentation, defaults to false */
  strict?: boolean;
  /** positive integer to control parallel loop batch size, defaults to 50 */
  batchSize?: number;
  /**
   * disable tracking state between recover and resume
   * true will only return state for elements that are actually running
   * Defaults to falsy
   */
  disableTrackState?: boolean;
  [x: string]: any;
}

declare interface EnvironmentOptions {
  settings?: EnvironmentSettings;
  variables?: Record<string, any>;
  services?: Record<string, CallableFunction>;
  Logger?: LoggerFactory;
  timers?: ITimers;
  scripts?: IScripts;
  extensions?: Record<string, Extension>;
  /**
   * optional override expressions handler
   */
  expressions?: IExpressions;
}

declare type startActivityFilterOptions = {
  /** Event definition id, i.e. Message, Signal, Error, etc */
  referenceId?: string;
  /** Event definition type, i.e. message, signal, error, etc */
  referenceType?: string;
};

type filterPostponed = (elementApi: Api<ElementBase>) => boolean;

declare const enum DefinitionRunStatus {
  Entered = 'entered',
  Start = 'start',
  Executing = 'executing',
  End = 'end',
  Discarded = 'discarded',
}

declare const enum ProcessRunStatus {
  Entered = 'entered',
  Start = 'start',
  Executing = 'executing',
  Errored = 'errored',
  End = 'end',
  Discarded = 'discarded',
}

/**
 * Activity status
 * Can be used to decide when to save states, Timer and Wait is recommended.
 */
declare const enum ActivityStatus {
  /** Idle, not running anything */
  Idle = 'idle',
  /**
   * At least one activity is executing,
   * e.g. a service task making a asynchronous request
   */
  Executing = 'executing',
  /**
   * At least one activity is waiting for a timer to complete,
   * usually only TimerEventDefinition's
   */
  Timer = 'timer',
  /**
   * At least one activity is waiting for a signal of some sort,
   * e.g. user tasks, intermediate catch events, etc
   */
  Wait = 'wait',
}

/**
 * Activity run status
 */
declare const enum ActivityRunStatus {
  /** Run entered, triggered by taken inbound flow */
  Entered = 'entered',
  /** Run started */
  Started = 'started',
  /** Executing activity behaviour */
  Executing = 'executing',
  /** Activity behaviour execution completed successfully */
  Executed = 'executed',
  /** Run end, take outbound flows */
  End = 'end',
  /** Entering discard run, triggered by discarded inbound flow */
  Discard = 'discard',
  /** Run was discarded, discard outbound flows */
  Discarded = 'discarded',
  /** Activity behaviour execution failed, discard run */
  Error = 'error',
  /** Formatting next run message */
  Formatting = 'formatting',
}

declare interface DefinitionExecution {
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

declare interface ActivityExecution {
  get completed(): boolean;
  get executionId(): string;
  get source(): IActivityBehaviour;
  execute(executeMessage: ElementBrokerMessage): void;
}

declare interface IActivityBehaviour {
  id: string;
  type: string;
  activity: Activity;
  environment: Environment;
  new (activity: Activity, context: ContextInstance): IActivityBehaviour;
  execute(executeMessage: ElementBrokerMessage): void;
}

declare function ActivityBehaviour(activityDef: SerializableElement, context: ContextInstance): Activity;

declare interface Api<T> extends ElementBrokerMessage {
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
  fields: MessageFields;
  /** Execution message content */
  content: ElementMessageContent;
  /** Execution message properties */
  properties: MessageProperties;
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

declare interface Script {
  execute(executionContext: ExecutionScope, callback: CallableFunction): void;
}

declare abstract class MessageElement {
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

declare class Environment {
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
  assignSettings(newSettings: Record<string, any>): void;
  registerScript(activity: any): Script;
  getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
  getServiceByName(serviceName: string): CallableFunction;
  resolveExpression(expression: string, message?: ElementBrokerMessage, expressionFnContext?: any): any;
  addService(name: string, fn: CallableFunction): void;
}

declare function Context(definitionContext: SerializableContext, environment?: Environment): ContextInstance;
declare class ContextInstance {
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

declare interface ElementState {
  id: string;
  type: string;
  broker?: BrokerState;
  [x: string]: any;
}

declare interface EnvironmentState {
  settings: EnvironmentSettings;
  variables: Record<string, any>;
  output: Record<string, any>;
}

declare type completedCounters = { completed: number; discarded: number };

declare interface ActivityExecutionState {
  completed: boolean;
  [x: string]: any;
}

declare interface ActivityState extends ElementState {
  status?: string;
  executionId: string;
  stopped: boolean;
  counters: { taken: number; discarded: number };
  execution?: ActivityExecutionState;
}

declare interface SequenceFlowState extends ElementState {
  counters: { take: number; discard: number; looped: number };
}

declare interface MessageFlowState extends ElementState {
  counters: { messages: number };
}

declare interface AssociationState extends ElementState {
  counters: { take: number; discard: number };
}

declare interface ProcessExecutionState {
  executionId: string;
  stopped: boolean;
  completed: boolean;
  status: string;
  children: ActivityState[];
  flows?: SequenceFlowState[];
  messageFlows?: MessageFlowState[];
  associations?: AssociationState[];
}

declare interface ProcessState extends ElementState {
  status: string;
  stopped: boolean;
  executionId?: string;
  counters: completedCounters;
  environment: EnvironmentState;
  execution?: ProcessExecutionState;
}

declare interface DefinitionExecutionState {
  executionId: string;
  stopped: boolean;
  completed: boolean;
  status: string;
  processes: ProcessState[];
}

declare interface DefinitionState extends ElementState {
  status: string;
  stopped: boolean;
  executionId?: string;
  counters: completedCounters;
  environment: EnvironmentState;
  execution?: DefinitionExecutionState;
}

declare type runCallback = (err: Error, definitionApi: Api<Definition>) => void;
declare class Definition extends Element<Definition> {
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

declare class Process extends Element<Process> {
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

declare interface ProcessExecution {
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

declare class Lane extends ElementBase {
  constructor(process: Process, laneDefinition: SerializableElement);
  /** Process broker */
  get broker(): Broker;
  get process(): Process;
}

declare interface ISequenceFlowCondition {
  /** Condition type, e.g. script or expression */
  get type(): string;
  /**
   * Execute sequence flow condition
   * @param message Source element execution message
   * @param callback Callback with truthy result if flow should be taken
   */
  execute(message: ElementBrokerMessage, callback: (err: Error, result: any) => void): void;
}

declare class SequenceFlow extends Element<SequenceFlow> {
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

declare interface MessageFlowReference {
  /** activity id */
  get id(): string;
  get processId(): string;
}

declare class MessageFlow extends Element<MessageFlow> {
  constructor(flowDef: SerializableElement, context: ContextInstance);
  get source(): MessageFlowReference;
  get target(): MessageFlowReference;
  get counters(): { messages: number };
  activate(): void;
  deactivate(): void;
  getState(): MessageFlowState | undefined;
}

declare class Association extends Element<Association> {
  constructor(associationDef: SerializableElement, context: ContextInstance);
  get sourceId(): string;
  get targetId(): string;
  get isAssociation(): boolean;
  get counters(): { take: number; discard: number };
  take(content?: any): boolean;
  discard(content?: any): boolean;
  getState(): AssociationState | undefined;
}

declare type LoggerFactory = (scope: string) => ILogger;

declare interface ILogger {
  debug(...args: any[]): void;
  error(...args: any[]): void;
  warn(...args: any[]): void;
  [x: string]: any;
}

declare type wrappedSetTimeout = (handler: CallableFunction, delay: number, ...args: any[]) => Timer;
declare type wrappedClearTimeout = (ref: any) => void;

declare interface Timer {
  /** The function to call when the timer elapses */
  readonly callback: CallableFunction;
  /** The number of milliseconds to wait before calling the callback */
  readonly delay: number;
  /** Optional arguments to pass when the callback is called */
  readonly args?: any[];
  /** Timer owner if any */
  readonly owner?: any;
  /** Timer Id */
  readonly timerId: string;
  /** Timeout, return from setTimeout */
  readonly timerRef: any;
  [x: string]: any;
}

declare interface RegisteredTimer {
  owner?: any;
  get setTimeout(): wrappedSetTimeout;
  get clearTimeout(): wrappedClearTimeout;
}

declare interface ITimers {
  get setTimeout(): wrappedSetTimeout;
  get clearTimeout(): wrappedClearTimeout;
  register(owner?: any): RegisteredTimer;
  [x: string]: any;
}

declare interface TimersOptions {
  /** Defaults to builtin setTimeout */
  setTimeout?: typeof setTimeout;
  /** Defaults to builtin clearTimeout */
  clearTimeout?: typeof clearTimeout;
  [x: string]: any;
}

declare class Timers implements ITimers {
  options: TimersOptions;
  constructor(options?: TimersOptions);
  get executing(): Timer[];
  get setTimeout(): wrappedSetTimeout;
  get clearTimeout(): wrappedClearTimeout;
  register(owner?: any): RegisteredTimer;
}

declare interface IScripts {
  register(activity: any): Script | undefined;
  getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
}

declare class Activity extends Element<Activity> {
  constructor(behaviour: IActivityBehaviour, activityDef: SerializableElement, context: ContextInstance);
  get Behaviour(): IActivityBehaviour;
  get stopped(): boolean;
  get status(): ActivityRunStatus | undefined;
  get context(): ContextInstance;
  get counters(): { taken: number; discarded: number };
  get execution(): ActivityExecution;
  get executionId(): string;
  get extensions(): IExtension;
  get isRunning(): boolean;
  get outbound(): SequenceFlow[];
  get inbound(): SequenceFlow[];
  get isEnd(): boolean;
  get isStart(): boolean;
  get isSubProcess(): boolean;
  get isMultiInstance(): boolean;
  get isThrowing(): boolean;
  get isForCompensation(): boolean;
  get triggeredByEvent(): boolean;
  get attachedTo(): Activity;
  get eventDefinitions(): EventDefinition[];
  /** Parent element process or sub process reference */
  get parentElement(): Process | Activity;
  activate(): void;
  deactivate(): void;
  init(initContent?: any): void;
  run(runContent?: any): void;
  discard(discardContent?: any): void;
  next(): ElementBrokerMessage;
  shake(): void;
  evaluateOutbound(
    fromMessage: ElementBrokerMessage,
    discardRestAtTake: boolean,
    callback: (err: Error, evaluationResult: any) => void,
  ): void;
  getState(): ActivityState | undefined;
}

declare class ActivityError extends Error {
  type: string;
  description: string;
  /** Activity that threw error */
  source?: ElementBrokerMessage;
  /** Original error */
  inner?: Error;
  code?: string;
  constructor(description: string, sourceMessage: MessageMessage, inner?: Error);
}

/**
 * Evaluate flow callback
 * @callback evaluateCallback
 * @param {Error} err Evaluation error
 * @param {boolean|object} evaluationResult If thruthy flow should be taken
 */
