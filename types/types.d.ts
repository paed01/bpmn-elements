import { Broker, BrokerState, Consumer, MessageEnvelope, MessageFields, MessageProperties } from 'smqp';
import { SerializableContext, SerializableElement } from 'moddle-context-serializer';

// Class re-exports — types follow the implementation in src/.
export { Activity } from '../src/activity/Activity.js';
export { ActivityExecution } from '../src/activity/ActivityExecution.js';
export { Process } from '../src/process/Process.js';
export { ProcessExecution } from '../src/process/ProcessExecution.js';
export { Lane } from '../src/process/Lane.js';
export { Definition } from '../src/definition/Definition.js';
export { DefinitionExecution } from '../src/definition/DefinitionExecution.js';
export { Environment } from '../src/Environment.js';
export { Context, ContextInstance } from '../src/Context.js';
export { SequenceFlow } from '../src/flows/SequenceFlow.js';
export { MessageFlow } from '../src/flows/MessageFlow.js';
export { Association } from '../src/flows/Association.js';
export { Timers } from '../src/Timers.js';
export { Formatter as MessageFormatter } from '../src/MessageFormatter.js';
export { ActivityError, BpmnError, RunError } from '../src/error/Errors.js';
export { TimerEventDefinition } from '../src/eventDefinitions/TimerEventDefinition.js';
export { ConditionalEventDefinition } from '../src/eventDefinitions/ConditionalEventDefinition.js';

// Re-export of supporting smqp types (kept here so JSDoc can address them via `import('types')`).
export { Consumer, MessageFields, MessageProperties };

import { Activity } from '../src/activity/Activity.js';
import { Process } from '../src/process/Process.js';
import { Definition } from '../src/definition/Definition.js';
import { Environment } from '../src/Environment.js';
import { ContextInstance } from '../src/Context.js';
import { ActivityError } from '../src/error/Errors.js';

// --- Broker / message contracts -----------------------------------------------

export declare interface ElementBroker<T> extends Broker {
  get owner(): T;
}

export declare type signalMessage = {
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

export declare interface ElementMessageContent {
  id?: string;
  type?: string;
  executionId?: string;
  parent?: ElementParent;
  [x: string]: any;
}

export declare interface ElementBrokerMessage extends MessageEnvelope {
  content: ElementMessageContent;
}

export declare interface ElementParent {
  get id(): string;
  get type(): string;
  get executionId(): string;
  get path(): ElementParent[];
}

// --- Element abstract bases ---------------------------------------------------

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

// --- Event definitions --------------------------------------------------------

// Common ancestor for the typed event definitions; concrete types live in src/eventDefinitions.
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

export declare const enum TimerType {
  TimeCycle = 'timeCycle',
  TimeDuration = 'timeDuration',
  TimeDate = 'timeDate',
}

export declare type parsedTimer = {
  /** Expires at date time */
  expireAt?: Date;
  /** Repeat number of times */
  repeat?: number;
  /** Delay in milliseconds */
  delay?: number;
};

// --- Conditions ---------------------------------------------------------------

export declare interface ICondition {
  /** Condition type */
  get type(): string;
  [x: string]: any;
  execute(message: ElementBrokerMessage, callback: CallableFunction): void;
}

export declare interface ISequenceFlowCondition {
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

export declare interface IActivityBehaviour {
  id: string;
  type: string;
  activity: any;
  environment: any;
  new (activity: any, context: any): IActivityBehaviour;
  execute(executeMessage: ElementBrokerMessage): void;
}

// Custom activity behaviour factory signature.
export declare function ActivityBehaviour(activityDef: SerializableElement, context: ContextInstance): Activity;

export declare type Extension = (activity: any, context: any) => IExtension;
export declare interface IExtension {
  activate(message: ElementBrokerMessage): void;
  deactivate(message: ElementBrokerMessage): void;
}

export declare interface IExpressions {
  resolveExpression(templatedString: string, context?: any, expressionFnContext?: any): any;
}

// --- Environment --------------------------------------------------------------

export declare interface EnvironmentSettings {
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

export declare interface EnvironmentOptions {
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

export declare type startActivityFilterOptions = {
  /** Event definition id, i.e. Message, Signal, Error, etc */
  referenceId?: string;
  /** Event definition type, i.e. message, signal, error, etc */
  referenceType?: string;
};

export declare type filterPostponed = (elementApi: any) => boolean;

export declare type runCallback = (err: Error, definitionApi: any) => void;

// --- Run-status enums ---------------------------------------------------------

export declare const enum DefinitionRunStatus {
  Entered = 'entered',
  Start = 'start',
  Executing = 'executing',
  End = 'end',
  Discarded = 'discarded',
}

export declare const enum ProcessRunStatus {
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
export declare const enum ActivityStatus {
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
export declare const enum ActivityRunStatus {
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

export declare interface ElementState {
  id: string;
  type: string;
  broker?: BrokerState;
  [x: string]: any;
}

export declare interface EnvironmentState {
  settings: EnvironmentSettings;
  variables: Record<string, any>;
  output: Record<string, any>;
}

export declare type completedCounters = { completed: number; discarded: number };

export declare interface ActivityExecutionState {
  completed: boolean;
  [x: string]: any;
}

export declare interface ActivityState extends ElementState {
  status?: string;
  executionId: string;
  stopped: boolean;
  counters: { taken: number; discarded: number };
  execution?: ActivityExecutionState;
}

export declare interface SequenceFlowState extends ElementState {
  counters: { take: number; discard: number; looped: number };
}

export declare interface MessageFlowState extends ElementState {
  counters: { messages: number };
}

export declare interface AssociationState extends ElementState {
  counters: { take: number; discard: number };
}

export declare interface ProcessExecutionState {
  executionId: string;
  stopped: boolean;
  completed: boolean;
  status: string;
  children: ActivityState[];
  flows?: SequenceFlowState[];
  messageFlows?: MessageFlowState[];
  associations?: AssociationState[];
}

export declare interface ProcessState extends ElementState {
  status: string;
  stopped: boolean;
  executionId?: string;
  counters: completedCounters;
  environment: EnvironmentState;
  execution?: ProcessExecutionState;
}

export declare interface DefinitionExecutionState {
  executionId: string;
  stopped: boolean;
  completed: boolean;
  status: string;
  processes: ProcessState[];
}

export declare interface DefinitionState extends ElementState {
  status: string;
  stopped: boolean;
  executionId?: string;
  counters: completedCounters;
  environment: EnvironmentState;
  execution?: DefinitionExecutionState;
}

// --- Flow references ----------------------------------------------------------

export declare interface MessageFlowReference {
  /** activity id */
  get id(): string;
  get processId(): string;
}

// --- Logging ------------------------------------------------------------------

export declare type LoggerFactory = (scope: string) => ILogger;

export declare interface ILogger {
  debug(...args: any[]): void;
  error(...args: any[]): void;
  warn(...args: any[]): void;
  [x: string]: any;
}

// --- Timers -------------------------------------------------------------------

export declare type wrappedSetTimeout = (handler: CallableFunction, delay: number, ...args: any[]) => Timer;
export declare type wrappedClearTimeout = (ref: any) => void;

export declare interface Timer {
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

export declare interface RegisteredTimer {
  owner?: any;
  get setTimeout(): wrappedSetTimeout;
  get clearTimeout(): wrappedClearTimeout;
}

export declare interface ITimers {
  get setTimeout(): wrappedSetTimeout;
  get clearTimeout(): wrappedClearTimeout;
  register(owner?: any): RegisteredTimer;
  [x: string]: any;
}

export declare interface TimersOptions {
  /** Defaults to builtin setTimeout */
  setTimeout?: typeof setTimeout;
  /** Defaults to builtin clearTimeout */
  clearTimeout?: typeof clearTimeout;
  [x: string]: any;
}

// --- Scripts ------------------------------------------------------------------

export declare interface IScripts {
  register(activity: any): Script | undefined;
  getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
}

export declare interface Script {
  execute(executionContext: any, callback: CallableFunction): void;
}

// --- Generic api shape; constructed via Activity/Process/Definition/Flow Api factories.

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

// --- Scope passed to user scripts/services -----------------------------------

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

/**
 * Evaluate flow callback
 * @callback evaluateCallback
 * @param {Error} err Evaluation error
 * @param {boolean|object} evaluationResult If thruthy flow should be taken
 */
