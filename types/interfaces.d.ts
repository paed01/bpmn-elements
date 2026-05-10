import { Broker, BrokerState, Consumer, MessageEnvelope, MessageFields, MessageProperties } from 'smqp';

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

export declare interface IActivityBehaviour {
  id: string;
  type: string;
  activity: any;
  environment: any;
  new (activity: any, context: any): IActivityBehaviour;
  execute(executeMessage: ElementBrokerMessage): void;
}

export declare type Extension = (activity: any, context: any) => IExtension;
export declare interface IExtension {
  activate(message: ElementBrokerMessage): void;
  deactivate(message: ElementBrokerMessage): void;
}

export declare interface IExpressions {
  resolveExpression(templatedString: string, context?: any, expressionFnContext?: any): any;
}

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

export declare type startActivityFilterOptions = {
  /** Event definition id, i.e. Message, Signal, Error, etc */
  referenceId?: string;
  /** Event definition type, i.e. message, signal, error, etc */
  referenceType?: string;
};

export declare type filterPostponed = (elementApi: any) => boolean;

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

export declare type runCallback = (err: Error, definitionApi: any) => void;

export declare interface MessageFlowReference {
  /** activity id */
  get id(): string;
  get processId(): string;
}

export declare type LoggerFactory = (scope: string) => ILogger;

export declare interface ILogger {
  debug(...args: any[]): void;
  error(...args: any[]): void;
  warn(...args: any[]): void;
  [x: string]: any;
}

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

export declare interface IScripts {
  register(activity: any): Script | undefined;
  getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
}

export declare interface Script {
  execute(executionContext: any, callback: CallableFunction): void;
}

/**
 * Evaluate flow callback
 * @callback evaluateCallback
 * @param {Error} err Evaluation error
 * @param {boolean|object} evaluationResult If thruthy flow should be taken
 */

export { Consumer, MessageFields, MessageProperties };
