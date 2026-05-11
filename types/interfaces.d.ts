import type { Broker, BrokerState, Consumer, MessageEnvelope, MessageFields, MessageProperties } from 'smqp';
import type { SerializableContext, SerializableElement } from 'moddle-context-serializer';
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
import type { Formatter } from '../src/MessageFormatter.js';
import type { ActivityError } from '../src/error/Errors.js';

export type { Activity, ActivityExecution, ContextInstance, Definition, Environment, Lane, Process, SequenceFlow };
export type { Consumer, MessageFields, MessageProperties, SerializableContext, SerializableElement };

// `Object.defineProperties(<Class>.prototype, …)` is opaque to tsc inference,
// so we declare the getters here as augmentations and TS merges them with each
// class at emit time.
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
    get triggeredByEvent(): boolean;
    get attachedTo(): Activity | null;
    get lane(): Lane | undefined;
    get eventDefinitions(): any[];
    get parentElement(): Activity | Process;
    get initialized(): boolean;
  }
}

declare module '../src/definition/Definition.js' {
  interface Definition {
    get counters(): { completed: number; discarded: number };
    get execution(): DefinitionExecution | undefined;
    get executionId(): string | undefined;
    get isRunning(): boolean;
    get status(): string | undefined;
    get stopped(): boolean;
    get activityStatus(): string;
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
    get status(): string | undefined;
    get activityStatus(): string;
  }
}

declare module '../src/process/ProcessExecution.js' {
  interface ProcessExecution {
    get stopped(): boolean;
    get completed(): boolean;
    get status(): string;
    get postponedCount(): number;
    get isRunning(): boolean;
    get activityStatus(): string;
  }
}

declare module '../src/definition/DefinitionExecution.js' {
  interface DefinitionExecution {
    get stopped(): boolean;
    get completed(): boolean;
    get status(): string;
    get processes(): Process[];
    get postponedCount(): number;
    get isRunning(): boolean;
    get activityStatus(): string;
  }
}

// --- Broker / message contracts -----------------------------------------------

export interface ElementBroker<T> extends Broker {
  get owner(): T;
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
  id?: string;
  type?: string;
  executionId?: string;
  parent?: ElementParent;
  [x: string]: any;
}

export interface ElementBrokerMessage extends MessageEnvelope {
  content: ElementMessageContent;
}

export interface ElementParent {
  get id(): string;
  get type(): string;
  get executionId(): string;
  get path(): ElementParent[];
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
}

export abstract class Element<T> extends ElementBase {
  get broker(): ElementBroker<T>;
  stop(): void;
  resume(): void;
  getApi(message?: ElementBrokerMessage): IApi<T>;
  on(eventName: string, callback: CallableFunction, options?: any): any;
  once(eventName: string, callback: CallableFunction, options?: any): any;
  waitFor(eventName: string, options?: any): Promise<IApi<T>>;
}

export abstract class MessageElement {
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

// --- Event definitions --------------------------------------------------------

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
  get reference(): {
    id?: string;
    name: string;
    referenceType: string;
  };
  [x: string]: any;
  execute(executeMessage: ElementBrokerMessage): void;
}

export const enum TimerType {
  TimeCycle = 'timeCycle',
  TimeDuration = 'timeDuration',
  TimeDate = 'timeDate',
}

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
  execute(message: ElementBrokerMessage, callback: CallableFunction): void;
}

export interface ISequenceFlowCondition {
  /** Condition type, e.g. script or expression */
  get type(): string;
  /**
   * Execute sequence flow condition
   * @param message Source element execution message
   * @param callback Callback with truthy result if flow should be taken
   */
  execute(message: ElementBrokerMessage, callback: (err: Error, result: any) => void): void;
}

// --- Activity behaviour & extensions ------------------------------------------

export interface IActivityBehaviour {
  id: string;
  type: string;
  activity: Activity;
  environment: Environment;
  new (activity: Activity, context: ContextInstance): IActivityBehaviour;
  execute(executeMessage: ElementBrokerMessage): void;
}

// Custom activity behaviour factory signature.
export function ActivityBehaviour(activityDef: SerializableElement, context: ContextInstance): Activity;

export type Extension = (activity: any, context: any) => IExtension;
export interface IExtension {
  activate(message: ElementBrokerMessage): void;
  deactivate(message: ElementBrokerMessage): void;
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
  /**
   * Skip discarding outbound sequence flows.
   * Defaults to false
   */
  skipDiscard?: boolean;
  [x: string]: any;
}

export interface EnvironmentOptions {
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

export const enum DefinitionRunStatus {
  Entered = 'entered',
  Start = 'start',
  Executing = 'executing',
  End = 'end',
  Discarded = 'discarded',
}

export const enum ProcessRunStatus {
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
export const enum ActivityStatus {
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
export const enum ActivityRunStatus {
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
  status?: string;
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
  status: string;
  children: ActivityState[];
  flows?: SequenceFlowState[];
  messageFlows?: MessageFlowState[];
  associations?: AssociationState[];
}

export interface ProcessState extends ElementState {
  status: string;
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
  status: string;
  processes: ProcessState[];
}

export interface DefinitionState extends ElementState {
  status: string;
  stopped: boolean;
  executionId?: string;
  counters: completedCounters;
  environment: EnvironmentState;
  execution?: DefinitionExecutionState;
}

// --- Flow references ----------------------------------------------------------

export interface MessageFlowReference {
  /** activity id */
  get id(): string;
  get processId(): string;
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
export type wrappedClearTimeout = (ref: any) => void;

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
  readonly timerRef: any;
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
  /** Defaults to builtin setTimeout */
  setTimeout?: typeof setTimeout;
  /** Defaults to builtin clearTimeout */
  clearTimeout?: typeof clearTimeout;
  [x: string]: any;
}

// --- Scripts ------------------------------------------------------------------

export interface IScripts {
  register(activity: any): Script | undefined;
  getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
}

export interface Script {
  execute(executionContext: any, callback: CallableFunction): void;
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
  getPostponed(...args: any[]): any[];
  createMessage(content?: Record<string, any>): any;
  getExecuting(): IApi<T>[];
}

// --- Scope passed to user scripts/services -----------------------------------

export interface ExecutionScope {
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

// --- Context --
export interface IExtensionsMapper {
  get(activity: any): IExtensions[];
}

export interface IExtensions extends IExtension {
  readonly count: number;
}
