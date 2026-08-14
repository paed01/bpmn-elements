import type { Broker, BrokerState, Consumer, MessageEnvelope, MessageFields, MessageProperties } from 'smqp';
import type { Activity } from '../src/activity/Activity.js';
import type { ActivityExecution } from '../src/activity/ActivityExecution.js';
import type { ContextInstance } from '../src/Context.js';
import type { Definition } from '../src/definition/Definition.js';
import type { DefinitionExecution } from '../src/definition/DefinitionExecution.js';
import type { Environment } from '../src/Environment.js';
import type { Lane } from '../src/process/Lane.js';
import type { Process } from '../src/process/Process.js';
import type { ProcessExecution } from '../src/process/ProcessExecution.js';
import type { SequenceFlow } from '../src/flows/SequenceFlow.js';
import type { Association } from '../src/flows/Association.js';
import type { Formatter } from '../src/MessageFormatter.js';
import type { ActivityError } from '../src/error/Errors.js';
import type { SignalTaskBehaviour } from '../src/tasks/SignalTask.js';
import type { ServiceTaskBehaviour } from '../src/tasks/ServiceTask.js';

export type { Activity, ActivityExecution, ContextInstance, Definition, Environment, Lane, Process, SequenceFlow };
export type { Consumer, MessageFields, MessageProperties };

// `Object.defineProperties(<Class>.prototype, …)` is opaque to tsc inference,
// so we declare the getters here as augmentations and TS merges them with each
// class at emit time. Same for `X.prototype = Object.create(Base.prototype)`
// inheritance — declared as interface heritage below.
declare module '../src/tasks/UserTask.js' {
  interface UserTaskBehaviour extends SignalTaskBehaviour {}
}

declare module '../src/tasks/ManualTask.js' {
  interface ManualTaskBehaviour extends SignalTaskBehaviour {}
}

declare module '../src/tasks/SendTask.js' {
  interface SendTaskBehaviour extends ServiceTaskBehaviour {}
}

declare module '../src/tasks/BusinessRuleTask.js' {
  interface BusinessRuleTaskBehaviour extends ServiceTaskBehaviour {}
}

declare module '../src/activity/Activity.js' {
  interface Activity {
    get counters(): { taken: number; discarded: number };
    get execution(): ActivityExecution | undefined;
    get executionId(): string | undefined;
    get extensions(): IExtension;
    get bpmnIo(): IExtension | undefined;
    get formatter(): Formatter;
    get isRunning(): boolean;
    get outbound(): SequenceFlow[];
    get inbound(): SequenceFlow[];
    get isEnd(): boolean;
    get isStart(): boolean;
    get isSubProcess(): boolean;
    get isTransaction(): boolean;
    get isMultiInstance(): boolean;
    get isThrowing(): boolean;
    get isCatching(): boolean;
    get isForCompensation(): boolean;
    get isParallelJoin(): boolean;
    get isParallelGateway(): boolean;
    get isStartEvent(): boolean;
    get triggeredByEvent(): boolean;
    get attachedTo(): Activity | null;
    get lane(): Lane | undefined;
    get eventDefinitions(): EventDefinition[] | undefined;
    get parentElement(): Activity | Process;
    get initialized(): boolean;
    get associations(): Association[];
  }
}

declare module '../src/definition/Definition.js' {
  interface Definition {
    get counters(): { completed: number; discarded: number };
    get execution(): DefinitionExecution | undefined;
    get executionId(): string | undefined;
    get isRunning(): boolean;
    get status(): DefinitionStatus | undefined;
    get stopped(): boolean;
    get activityStatus(): ActivityStatus;
  }
}

declare module '../src/process/Process.js' {
  interface Process {
    get counters(): { completed: number; discarded: number };
    get lanes(): Lane[] | undefined;
    get extensions(): IExtension | undefined;
    get stopped(): boolean;
    get isRunning(): boolean;
    get executionId(): string | undefined;
    get execution(): ProcessExecution | undefined;
    get status(): ProcessStatus | undefined;
    get activityStatus(): ActivityStatus;
  }
}

declare module '../src/process/ProcessExecution.js' {
  interface ProcessExecution {
    get stopped(): boolean;
    get completed(): boolean;
    get status(): ProcessStatus;
    get postponedCount(): number;
    get isRunning(): boolean;
    get activityStatus(): ActivityStatus;
  }
}

declare module '../src/definition/DefinitionExecution.js' {
  interface DefinitionExecution {
    get stopped(): boolean;
    get completed(): boolean;
    get status(): DefinitionStatus;
    get processes(): Process[];
    get postponedCount(): number;
    get isRunning(): boolean;
    get activityStatus(): ActivityStatus;
  }
}

// --- Broker / message contracts -----------------------------------------------

export interface ElementBroker<T> extends Broker {
  get owner(): T;
}

/**
 * Wrapper returned by `ActivityBroker`, `ProcessBroker`, `DefinitionBroker`,
 * `MessageFlowBroker`, and `new EventBroker(owner, options)`. Owns an underlying
 * smqp Broker and exposes bound, prefixed event helpers.
 *
 * @template T Broker owner element type (Activity, Process, Definition, ...).
 */
export interface EventBroker<T> {
  options: { prefix: string; autoDelete?: boolean; durable?: boolean };
  eventPrefix: string;
  broker: ElementBroker<T>;
  on(eventName: string, callback: CallableFunction, eventOptions?: { once?: boolean; [x: string]: any }): Consumer;
  once(eventName: string, callback: CallableFunction, eventOptions?: { [x: string]: any }): Consumer;
  waitFor(eventName: string, onMessage?: (routingKey: string, message: ElementBrokerMessage, owner: T) => boolean): Promise<IApi<T>>;
  emit(eventName: string, content?: Record<string, any>, props?: any): void;
  emitFatal(error: Error, content?: Record<string, any>): void;
}

export type signalMessage = {
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

export interface ElementMessageContent {
  /** Element id */
  id?: string;
  /** Element type */
  type?: string;
  /** Element execution id */
  executionId?: string;
  parent?: ElementParent;
  [x: string]: any;
}

export interface ElementBrokerMessage extends MessageEnvelope {
  content: ElementMessageContent;
}

export interface ElementParent {
  id: string;
  type: string;
  executionId?: string;
  path?: Omit<Partial<ElementParent>, 'path'>[];
}

/** Resolved signal-, message-, error-, or escalation reference, shared by their `resolve` functions. */
export interface ResolvedReference {
  id?: string;
  type?: string;
  messageType: string;
  name?: string;
  parent?: ElementParent;
}

// --- Shake results ------------------------------------------------------------

/** A single hop (activity or sequence flow) recorded during a shake walk. */
export interface ShakeSequenceItem {
  id: string;
  type: string;
  count?: number;
  sourceId?: string;
  targetId?: string;
}

/** A single end-to-end sequence discovered while shaking an activity graph. */
export interface ShakenSequence extends ElementMessageContent {
  /** The activity- and flow-id steps that were walked, in order. */
  sequence: ShakeSequenceItem[];
  /** true when the walk revisited an already-seen activity. */
  isLooped: boolean;
}

/** Result of shaking an activity graph, keyed by the starting activity id. */
export type ShakeResult = Record<string, ShakenSequence[]>;

// --- Serialized definition contracts --------------------------------------------
// bpmn-elements is agnostic to how the BPMN source was parsed and serialized.
// Any object meeting these minimal structural contracts can drive an execution —
// moddle-context-serializer is one implementation. Every element works with a
// minimum definition; the constructors default what is missing.

/** Parent element reference in a serialized definition */
export interface ElementParentRef {
  id?: string;
  type?: string;
  [x: string]: any;
}

/** Serialized BPMN element definition; behaviour is optional and may be partial */
export interface SerializableElement {
  id?: string;
  type?: string;
  name?: string;
  parent?: ElementParentRef;
  behaviour?: Record<string, any>;
  [x: string]: any;
}

/** Parsed BPMN element definition as accepted by the Activity constructor */
export interface ActivityDefinition extends SerializableElement {
  behaviour?: {
    /** Attached-to element reference, e.g. boundary event host — only `id` is read */
    attachedTo?: { id: string; [x: string]: any };
    eventDefinitions?: SerializableElement[];
    [x: string]: any;
  };
}

export interface ProcessDefinition extends SerializableElement {
  behaviour?: {
    isExecutable?: boolean;
    [x: string]: any;
  };
}

export interface SequenceFlowDefinition extends SerializableElement {
  sourceId?: string;
  targetId?: string;
  isDefault?: boolean;
}

export interface AssociationDefinition extends SerializableElement {
  sourceId?: string;
  targetId?: string;
}

/** Message flow source or target endpoint */
export interface MessageFlowReference {
  processId?: string;
  id?: string;
  [x: string]: any;
}

export interface MessageFlowDefinition extends SerializableElement {
  source?: MessageFlowReference;
  target?: MessageFlowReference;
}

/**
 * Serialized definition source consumed by Context. Structurally compatible with
 * the moddle-context-serializer output, but any implementation will do.
 */
export interface SerializableContext {
  getActivities(scopeId?: string): ActivityDefinition[];
  getActivityById(id: string): ActivityDefinition;
  getAssociations(scopeId?: string): AssociationDefinition[];
  getAssociationById(id: string): AssociationDefinition;
  getDataObjectById(id: string): SerializableElement;
  getDataStoreById(id: string): SerializableElement;
  getDataStoreReferenceById(id: string): SerializableElement;
  getExecutableProcesses(): ProcessDefinition[];
  getInboundAssociations(activityId: string): AssociationDefinition[];
  getInboundSequenceFlows(activityId: string): SequenceFlowDefinition[];
  getMessageFlows(scopeId?: string): MessageFlowDefinition[];
  getOutboundAssociations(activityId: string): AssociationDefinition[];
  getOutboundSequenceFlows(activityId: string): SequenceFlowDefinition[];
  getProcessById(id: string): ProcessDefinition;
  getProcesses(): ProcessDefinition[];
  getSequenceFlowById(id: string): SequenceFlowDefinition;
  getSequenceFlows(scopeId?: string): SequenceFlowDefinition[];
  [x: string]: any;
}

// --- Element abstract bases ---------------------------------------------------

export abstract class ElementBase {
  get id(): string;
  get type(): string;
  get name(): string;
  get parent(): ElementParent;
  get behaviour(): SerializableElement;
  get broker(): Broker;
  get environment(): Environment;
  /** Per-execution context registry (see `Context`/`ContextInstance` from src). */
  get context(): ContextInstance;
  get logger(): ILogger;
  [x: string]: any;
}

// --- Event definitions --------------------------------------------------------

export interface EventReference {
  id?: string;
  name?: string;
  referenceType: string;
  [x: string]: any;
}

// Common ancestor for the typed event definitions; concrete types live in src/eventDefinitions.
export class EventDefinition {
  constructor(activity: Activity, eventDefinitionElement: SerializableElement, context?: ContextInstance, index?: number);
  get id(): string;
  get type(): string;
  get executionId(): string;
  get isThrowing(): boolean;
  get activity(): Activity;
  get broker(): Broker;
  get logger(): ILogger;
  get reference(): EventReference;
  [x: string]: any;
  execute(executeMessage: ElementBrokerMessage): void;
}

/** Supported BPMN timer event definition types. */
export const enum TimerTypeValue {
  TimeCycle = 'timeCycle',
  TimeDuration = 'timeDuration',
  TimeDate = 'timeDate',
}

/** Accepts either a `TimerTypeValue` enum member or its underlying string literal. */
export type TimerType = TimerTypeValue | `${TimerTypeValue}`;

export type parsedTimer = {
  /** Expires at date time */
  expireAt?: Date;
  /** Repeat number of times */
  repeat?: number;
  /** Delay in milliseconds */
  delay?: number;
};

// --- Conditions ---------------------------------------------------------------

export interface ICondition {
  /** Condition type */
  get type(): string;
  [x: string]: any;
  /**
   * Execute condition
   * @param message Source element execution message
   * @param callback Callback with truthy result if flow should be taken
   */
  execute(message: ElementBrokerMessage, callback: CallableFunction): void;
}

// --- Activity behaviour & extensions ------------------------------------------

/** Behaviour instance driving one activity run, as instantiated by ActivityExecution. */
export interface IActivityBehaviourInstance {
  id?: string;
  type?: string;
  activity?: Activity;
  environment?: Environment;
  execute(executeMessage: ElementBrokerMessage): void;
  [x: string]: any;
}

export type IActivityBehaviourConstructor = new (activity: Activity, context: ContextInstance) => IActivityBehaviourInstance;

/** Element-specific behaviour: a class, or a plain factory function returning the instance. */
export type IActivityBehaviour =
  IActivityBehaviourConstructor | ((activity: Activity, context: ContextInstance) => IActivityBehaviourInstance);

export type Extension = (activity: any, context: any) => Partial<IExtension> | void;

export interface IExtension {
  activate(message?: ElementBrokerMessage): void;
  deactivate(message?: ElementBrokerMessage): void;
}

export interface IExpressions {
  resolveExpression(templatedString: string, context?: any, expressionFnContext?: any): any;
}

// --- Environment --------------------------------------------------------------

export interface EnvironmentSettings {
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

/**
 * Injected `environment.services` function.
 *
 * In the no-call resolution forms — a service task `implementation`
 * (`${environment.services.fn}`) or a sequence-flow service condition — the
 * function is invoked with the calling element as its call context, so `this`
 * is the {@link Activity} (or flow's owning activity) and the
 * {@link ExecutionScope} is passed as the first argument. Args are left open so
 * the *called* expression form (`${environment.services.fn()}`), which instead
 * receives the resolution context, still typechecks.
 */
export type ServiceFunction = (this: Activity, ...args: any[]) => any;

export interface EnvironmentOptions {
  settings?: EnvironmentSettings;
  variables?: Record<string, any>;
  services?: Record<string, ServiceFunction>;
  Logger?: LoggerFactory;
  timers?: ITimers;
  scripts?: IScripts;
  extensions?: Record<string, Extension>;
  /**
   * optional override expressions handler
   */
  expressions?: IExpressions;
  /** arbitrary consumer options are kept as is on environment options */
  [x: string]: any;
}

// --- Filter / callback shapes -------------------------------------------------

export type startActivityFilterOptions = {
  /** Event definition id, i.e. Message, Signal, Error, etc */
  referenceId?: string;
  /** Event definition type, i.e. message, signal, error, etc */
  referenceType?: string;
};

export type filterPostponed = (elementApi: any) => boolean;

export type runCallback = (err: Error, definitionApi: any) => void;

// --- Run-status enums ---------------------------------------------------------

/**
 * Definition status values. Covers both the entity (`Definition.status`) and
 * the execution (`DefinitionExecution.status`) lifecycles.
 */
export const enum DefinitionStatusValue {
  /** DefinitionExecution constructed, not yet started */
  Init = 'init',
  /** Definition run entered */
  Entered = 'entered',
  /** Definition run started */
  Start = 'start',
  /** Definition is executing */
  Executing = 'executing',
  /** Definition run ended */
  End = 'end',
  /** Definition run discarded */
  Discarded = 'discarded',
  /** Definition execution completed successfully */
  Completed = 'completed',
  /** Definition execution failed */
  Error = 'error',
}

/** Accepts either a `DefinitionStatusValue` enum member or its string literal. */
export type DefinitionStatus = DefinitionStatusValue | `${DefinitionStatusValue}`;

/**
 * Process status values. Covers both the entity (`Process.status`) and the
 * execution (`ProcessExecution.status`) lifecycles.
 */
export const enum ProcessStatusValue {
  /** ProcessExecution constructed, not yet started */
  Init = 'init',
  /** Formatting next run message */
  Formatting = 'formatting',
  /** Process run entered */
  Entered = 'entered',
  /** Process run started */
  Start = 'start',
  /** Process is executing */
  Executing = 'executing',
  /** Process run errored */
  Errored = 'errored',
  /** Process run ended */
  End = 'end',
  /** Process run discarded */
  Discarded = 'discarded',
  /** Process execution discard in progress */
  Discard = 'discard',
  /** Process execution cancelled */
  Cancel = 'cancel',
  /** Process execution completed successfully */
  Completed = 'completed',
  /** Process execution failed */
  Error = 'error',
  /** Process execution terminated by a terminate end event */
  Terminated = 'terminated',
}

/** Accepts either a `ProcessStatusValue` enum member or its string literal. */
export type ProcessStatus = ProcessStatusValue | `${ProcessStatusValue}`;

/**
 * Activity status values. Covers both the per-activity run lifecycle and the
 * rollup states surfaced by Process/Definition `activityStatus` getters. Save
 * point candidates are `Timer` and `Wait`.
 */
export const enum ActivityStatusValue {
  /** Idle, not running anything */
  Idle = 'idle',
  /** Run entered, triggered by taken inbound flow */
  Entered = 'entered',
  /** Run started */
  Started = 'started',
  /**
   * At least one activity is executing,
   * e.g. a service task making a asynchronous request
   */
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
 * Accepts either an `ActivityStatusValue` enum member or its underlying string
 * literal, so JSDoc-typed assignments like `this.status = 'entered'` keep
 * type-checking.
 */
export type ActivityStatus = ActivityStatusValue | `${ActivityStatusValue}`;

// --- State snapshots ----------------------------------------------------------

export interface ElementState {
  id: string;
  type: string;
  broker?: BrokerState;
  [x: string]: any;
}

export interface EnvironmentState {
  settings: EnvironmentSettings;
  variables: Record<string, any>;
  output: Record<string, any>;
}

export type completedCounters = { completed: number; discarded: number };

export interface ActivityExecutionState {
  completed: boolean;
  [x: string]: any;
}

export interface ActivityState extends ElementState {
  status?: ActivityStatus;
  executionId: string;
  stopped: boolean;
  counters: { taken: number; discarded: number };
  execution?: ActivityExecutionState;
}

export interface SequenceFlowState extends ElementState {
  counters: { take: number; discard: number; looped: number };
}

export interface MessageFlowState extends ElementState {
  counters: { messages: number };
}

export interface AssociationState extends ElementState {
  counters: { take: number; discard: number };
}

export interface ProcessExecutionState {
  executionId: string;
  stopped: boolean;
  completed: boolean;
  status: ProcessStatus;
  children: ActivityState[];
  flows?: SequenceFlowState[];
  messageFlows?: MessageFlowState[];
  associations?: AssociationState[];
}

export interface ProcessState extends ElementState {
  status: ProcessStatus;
  stopped: boolean;
  executionId?: string;
  counters: completedCounters;
  environment: EnvironmentState;
  execution?: ProcessExecutionState;
}

export interface DefinitionExecutionState {
  executionId: string;
  stopped: boolean;
  completed: boolean;
  status: DefinitionStatus;
  processes: ProcessState[];
}

export interface DefinitionState extends ElementState {
  /** State version. Absent on states saved before versioning. */
  stateVersion?: number;
  status: DefinitionStatus;
  stopped: boolean;
  executionId?: string;
  counters: completedCounters;
  environment: EnvironmentState;
  execution?: DefinitionExecutionState;
}

// --- Logging ------------------------------------------------------------------

export type LoggerFactory = (scope: string) => ILogger;

export interface ILogger {
  debug(...args: any[]): void;
  error(...args: any[]): void;
  warn(...args: any[]): void;
  [x: string]: any;
}

// --- Timers -------------------------------------------------------------------

export type wrappedSetTimeout = (handler: CallableFunction, delay: number, ...args: any[]) => Timer;
export type wrappedClearTimeout = (ref: Timer | ReturnType<typeof setTimeout>) => void;

export interface Timer {
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
  readonly timerRef: ReturnType<typeof setTimeout>;
  [x: string]: any;
}

export interface RegisteredTimer {
  owner?: any;
  get setTimeout(): wrappedSetTimeout;
  get clearTimeout(): wrappedClearTimeout;
}

export interface ITimers {
  get setTimeout(): wrappedSetTimeout;
  get clearTimeout(): wrappedClearTimeout;
  register(owner?: any): RegisteredTimer;
  [x: string]: any;
}

export interface TimersOptions {
  /** Any setTimeout implementation, defaults to builtin setTimeout */
  setTimeout?: (callback: (...args: any[]) => void, delay: number, ...args: any[]) => any;
  /** Any clearTimeout implementation, defaults to builtin clearTimeout */
  clearTimeout?: (ref: any) => void;
  [x: string]: any;
}

// --- Scripts ------------------------------------------------------------------

export interface IScripts {
  register(activity: Activity): Script | void;
  getScript(language: string, identifier: { id: string; [x: string]: any }): Script | undefined;
}

export interface Script {
  execute(executionContext: ExecutionScope, callback: CallableFunction): void;
}

// --- Service task service -----------------------------------------------------

/**
 * Service task service instance, as returned by `ServiceTaskBehaviour#getService`.
 *
 * A service wraps the element-specific work (e.g. an `implementation` expression
 * or a custom `Service` behaviour) behind a callback-style `execute`. The
 * built-in `ServiceImplementation` and `DummyService` both satisfy this shape.
 */
export interface IService {
  /** Service type, e.g. `bpmn:ServiceTask:implementation` or `dummyservice` */
  type?: string;
  /**
   * Execute the service.
   * @param executeMessage Activity execute message
   * @param callback Completion callback `(err, output)`; a truthy `err` fails the
   *   activity, otherwise `output` becomes the activity output
   */
  execute(executeMessage: ElementBrokerMessage, callback: (err?: Error | null, output?: any) => void): void;
  /** Optional; called with the api message when the activity run is discarded */
  discard?(message: ElementBrokerMessage): void;
  /** Optional; called with the api message when the activity run is stopped */
  stop?(message: ElementBrokerMessage): void;
  [x: string]: any;
}

/** Constructs a service task service; assigned to `activity.behaviour.Service`. */
export interface IServiceConstructor {
  new (activity: Activity, message: ElementBrokerMessage): IService;
}

// --- Generic api shape; constructed via Activity/Process/Definition/Flow Api factories.

export interface IApi<T> extends ElementBrokerMessage {
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
  getPostponed(...args: Parameters<Process['getPostponed']>): IApi<Activity>[];
  createMessage(content?: Record<string, any>): any;
  getExecuting(): IApi<T>[];
}

// --- Scope passed to user scripts/services -----------------------------------

export interface ExecutionScope extends ElementBrokerMessage {
  /** Calling element id */
  id: string;
  /** Calling element type */
  type: string;
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

// --- Context --
export interface IExtensionsMapper {
  get(activity: any): IExtensions;
}

export interface IExtensions extends IExtension {
  readonly count: number;
}

// --- IO ---

export interface IIOData {
  [x: string]: any;
  read(broker: Broker, exchange: string, routingKeyPrefix: string, messageProperties?: Record<string, any>): void;
  write(broker: Broker, exchange: string, routingKeyPrefix: string, value: any, messageProperties?: Record<string, any>): void;
}
