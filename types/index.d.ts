declare module 'bpmn-elements' {
  import { Broker } from 'smqp';
  import { BrokerState } from 'smqp/types/Broker';
  import { Consumer } from 'smqp/types/Queue';
  import { MessageMessage, MessageFields, MessageProperties } from 'smqp/types/Message';
  import { SerializableContext, SerializableElement } from 'moddle-context-serializer';

  interface ElementBroker<T> extends Broker {
    get owner(): T;
  }

  type signalMessage = {
    /**
     * Optional signal id
     * - Activity id
     * - Signal-, Message-, Escalation id, etc
     */
    id?: string,
    /**
     * Optional execution id
     * e.g. excutionId of a parallel multi instance user task
     */
    executionId?: string,
    /** Any other input that will be added to completed activity output */
    [x: string]: any,
  }

  interface ElementMessageContent {
    id?: string;
    type?: string;
    executionId?: string;
    parent?: ElementParent;
    [x: string]: any;
  }

  interface ElementBrokerMessage extends MessageMessage {
    content: ElementMessageContent,
  }

  class EventDefinition {
    constructor(activity: Activity, eventDefinitionElement: SerializableElement)
    get id(): string;
    get type(): string;
    get executionId(): string;
    get isThrowing(): boolean;
    get activity(): Activity;
    get broker(): Broker;
    get logger(): ILogger;
    get reference(): {
      id?: string,
      name: string,
      referenceType: string,
    };
    [x: string]: any;
    execute(executeMessage: ElementBrokerMessage): void;
  }

  abstract class ElementBase {
    get id(): string;
    get type(): string;
    get name(): string;
    get parent(): ElementParent;
    get behaviour(): SerializableElement;
    get broker(): Broker;
    get environment(): Environment;
    get context(): Context;
    get logger(): ILogger;
  }

  abstract class Element<T> extends ElementBase {
    get broker(): ElementBroker<T>;
    stop(): void;
    resume(): void;
    getApi(message?: ElementBrokerMessage): Api<T>;
    on(eventName: string, callback: CallableFunction, options?: any): Consumer;
    once(eventName: string, callback: CallableFunction, options?: any): Consumer;
    waitFor(eventName: string, options?: any): Promise<Api<T>>;
  }

  interface ElementParent {
    get id(): string;
    get type(): string;
    get executionId(): string;
    get path(): ElementParent[];
  }

  type Extension = (activity: ElementBase, context: Context) => IExtension;
  interface IExtension {
    activate(message: ElementBrokerMessage): void;
    deactivate(message: ElementBrokerMessage): void;
  }

  interface IExpressions {
    resolveExpression(templatedString: string, context?: any, expressionFnContext?: any): any;
  }

  interface EnvironmentSettings {
    /** true returns dummy service function for service task if not found */
    enableDummyService?: boolean;
    /** true makes activity runs to go forward in steps, defaults to false */
    step?: boolean;
    /** strict mode, see documentation, defaults to false */
    strict?: boolean;
    /** positive integer to control parallel loop batch size, defaults to 50 */
    batchSize?: number;
    [x: string]: any;
  }

  interface EnvironmentOptions {
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

  type startActivityFilterOptions = {
    /** Event definition id, i.e. Message, Signal, Error, etc */
    referenceId?: string,
    /** Event definition type, i.e. message, signal, error, etc */
    referenceType?: string
  };

  type filterPostponed = (elementApi: Api<ElementBase>) => boolean;

  /**
   * Activity status
   * Can be used to decide when to save states, Timer and Wait is recommended.
   */
  const enum ActivityStatus {
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

  interface DefinitionExecution {
    get id(): string;
    get type(): string;
    get broker(): Broker;
    get environment(): Environment;
    get context(): Context;
    get executionId(): string;
    get stopped(): boolean;
    get completed(): boolean;
    get status(): boolean;
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
    getPostponed(filterFn: filterPostponed): Api<ElementBase>[];
  }

  interface ActivityExecution {
    get completed(): boolean;
    get executionId(): string;
    get source(): ActivityBehaviour;
    execute(executeMessage: ElementBrokerMessage): void;
  }

  function ActivityBehaviour(activityDef: SerializableElement, context: Context): Activity;
  interface ActivityBehaviour {
    id: string;
    type: string;
    activity: Activity;
    environment: Environment;
    execute(executeMessage: ElementBrokerMessage): void;
  }

  interface Api<T> extends ElementBrokerMessage {
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

  interface Script {
    execute(executionContext: ExecutionScope, callback: CallableFunction): void;
  }

  abstract class MessageElement {
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

  class Environment {
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
    getScript(language: string, identifier: {id: string, [x: string]: any}): Script;
    getServiceByName(serviceName: string): CallableFunction;
    resolveExpression(expression: string, message?: ElementBrokerMessage, expressionFnContext?: any): any;
    addService(name: string, fn: CallableFunction): void;
  }

  function Context(definitionContext: SerializableContext, environment?: Environment): Context;
  class Context {
    constructor(definitionContext: SerializableContext, environment?: Environment);
    get id(): string;
    get name(): string;
    get type(): string;
    /** Unique context instance id */
    get sid(): string;
    get definitionContext(): SerializableContext;
    get environment(): Environment;
    getActivityById<T>(activityId: string): T;
    getSequenceFlowById(sequenceFlowId: string): SequenceFlow;
    getInboundSequenceFlows(activityId: string): SequenceFlow[];
    getOutboundSequenceFlows(activityId: string): SequenceFlow[];
    getInboundAssociations(activityId: string): Association[];
    getOutboundAssociations(activityId: string): Association[];
    getActivities(scopeId?: string): ElementBase[];
    getSequenceFlows(scopeId?: string): SequenceFlow[];
    getAssociations(scopeId?: string): Association[];
    clone(newEnvironment?: Environment): Context;
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

  interface ElementState {
    id: string;
    type: string;
    name: string;
    broker?: BrokerState;
    [x: string]: any;
  }

  interface EnvironmentState {
    settings: EnvironmentSettings;
    variables: Record<string, any>;
    output: Record<string, any>;
  }

  type completedCounters = { completed: number, discarded: number };

  interface ActivityExecutionState {
    completed: boolean;
    [x: string]: any;
  }

  interface ActivityState extends ElementState {
    executionId: string;
    stopped: boolean;
    behaviour: Record<string, any>;
    counters: { taken: number, discarded: number };
    execution?: ActivityExecutionState;
  }

  interface SequenceFlowState extends ElementState {
    counters: {take: number, discard: number, looped: number};
  }

  interface MessageFlowState {
    id: string;
    type: string;
    counters: {messages: number};
  }

  interface AssociationState extends ElementState {
    counters: {take: number, discard: number };
    sourceId: string;
    targetId: string;
    isAssociation: boolean;
  }

  interface ProcessExecutionState {
    executionId: string;
    stopped: boolean;
    completed: boolean;
    status: string;
    children: ActivityState[];
    flows?: SequenceFlowState[];
    messageFlows?: MessageFlowState[];
    associations?: AssociationState[];
  }

  interface ProcessState extends ElementState {
    status: string;
    stopped: boolean,
    executionId?: string;
    counters: completedCounters;
    environment: EnvironmentState;
    execution?: ProcessExecutionState;
  }

  interface DefinitionExecutionState {
    executionId: string;
    stopped: boolean;
    completed: boolean;
    status: string;
    processes: ProcessState[];
  }

  interface DefinitionState extends ElementState {
    status: string;
    stopped: boolean,
    executionId?: string;
    counters: completedCounters;
    environment: EnvironmentState;
    execution?: DefinitionExecutionState;
  }

  type runCallback = (err: Error, definitionApi: Api<Definition>) => void;
  class Definition extends Element<Definition> {
    constructor(context: Context, options?: EnvironmentOptions);
    get counters(): completedCounters;
    get execution(): DefinitionExecution;
    get executionId(): string;
    get isRunning(): boolean;
    get status(): string;
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

  class Process extends Element<Process> {
    constructor(processDef: SerializableElement, context: Context);
    get isExecutable(): boolean;
    get counters(): completedCounters;
    get extensions(): IExtension;
    get stopped(): boolean;
    get isRunning(): boolean;
    get executionId(): string;
    get execution(): ProcessExecution;
    get status(): string;
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
    getPostponed(filterFn: filterPostponed): Api<ElementBase>[];
  }

  interface ProcessExecution {
    get isSubProcess(): boolean;
    get broker(): Broker;
    get environment(): Environment;
    get context(): Context;
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

  interface ISequenceFlowCondition {
    /** Condition type, e.g. script or expression */
    get type(): string;
    /**
     * Execute sequence flow condition
     * @param message Source element execution message
     * @param callback Callback with truthy result if flow should be taken
     */
    execute(message: ElementBrokerMessage, callback: (err: Error, result: any) => void): void;
  }

  class SequenceFlow extends Element<SequenceFlow> {
    get sourceId(): string;
    get targetId(): string;
    get isDefault(): boolean;
    get isSequenceFlow(): boolean;
    get counters(): {take: number, discard: number, looped: number};
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
  }

  interface MessageFlowReference {
    /** activity id */
    get id(): string;
    get processId(): string;
  }

  class MessageFlow extends Element<MessageFlow> {
    get source(): MessageFlowReference;
    get target(): MessageFlowReference;
    get counters(): { messages: number };
    activate(): void;
    deactivate(): void;
  }

  class Association extends Element<Association> {
    get sourceId(): string;
    get targetId(): string;
    get isAssociation(): boolean;
    get counters(): {take: number, discard: number };
    take(content?: any): boolean;
    discard(content?: any): boolean;
  }

  type LoggerFactory = (scope: string) => ILogger;

  interface ILogger {
    debug(...args: any[]): void;
    error(...args: any[]): void;
    warn(...args: any[]): void;
    [x: string]: any,
  }

  type wrappedSetTimeout = (handler: TimerHandler, delay: number, ...args: any[]) => Timer;
  type wrappedClearTimeout = (ref: any) => void;

  interface Timer {
    /** The function to call when the timer elapses */
    readonly callback: TimerHandler;
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

  interface RegisteredTimer {
    owner?: any;
    get setTimeout(): wrappedSetTimeout;
    get clearTimeout(): wrappedClearTimeout;
  }

  interface ITimers {
    get setTimeout(): wrappedSetTimeout;
    get clearTimeout(): wrappedClearTimeout;
    register(owner?: any): RegisteredTimer;
    [x: string]: any;
  }

  interface TimersOptions {
    /** Defaults to builtin setTimeout */
    setTimeout?: typeof setTimeout;
    /** Defaults to builtin clearTimeout */
    clearTimeout?: typeof clearTimeout;
    [x: string]: any;
  }

  class Timers implements ITimers {
    options: TimersOptions;
    constructor(options?: TimersOptions);
    get executing(): Timer[];
    get setTimeout(): wrappedSetTimeout;
    get clearTimeout(): wrappedClearTimeout;
    register(owner?: any): RegisteredTimer;
  }

  interface IScripts {
    register(activity: any): Script | undefined;
    getScript(language: string, identifier: {id: string, [x: string]: any}): Script;
  }

  interface Activity extends Element<Activity> {
    get Behaviour(): ActivityBehaviour;
    get stopped(): boolean;
    get status(): string;
    get counters(): { taken: number, discarded: number };
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
    activate(): void;
    deactivate(): void;
    init(initContent?: any): void;
    run(runContent?: any): void;
    discard(discardContent?: any): void;
    next(): ElementBrokerMessage;
    shake(): void;
    evaluateOutbound(fromMessage: ElementBrokerMessage, discardRestAtTake: boolean, callback: (err: Error, evaluationResult: any) => void): void;
  }

  var BoundaryEvent: typeof ActivityBehaviour;
  var CallActivity: typeof ActivityBehaviour;
  var Dummy: typeof ActivityBehaviour;
  var TextAnnotation: typeof Dummy;
  var Group: typeof Dummy;
  var Category: typeof Dummy;
  var EndEvent: typeof ActivityBehaviour;
  var EventBasedGateway: typeof ActivityBehaviour;
  var ExclusiveGateway: typeof ActivityBehaviour;
  var InclusiveGateway: typeof ActivityBehaviour;
  var IntermediateCatchEvent: typeof ActivityBehaviour;
  var IntermediateThrowEvent: typeof ActivityBehaviour;
  var ParallelGateway: typeof ActivityBehaviour;
  var ReceiveTask: typeof ActivityBehaviour;
  var ScriptTask: typeof ActivityBehaviour;
  var ServiceTask: typeof ActivityBehaviour;
  var SendTask: typeof ServiceTask;
  var BusinessRuleTask: typeof ServiceTask;
  var SignalTask: typeof ActivityBehaviour;
  var ManualTask: typeof SignalTask;
  var UserTask: typeof SignalTask;
  var StartEvent: typeof ActivityBehaviour;
  var SubProcess: typeof ActivityBehaviour;
  var Task: typeof ActivityBehaviour;
  var Transaction: typeof ActivityBehaviour;

  var CancelEventDefinition: EventDefinition;
  var CompensateEventDefinition: EventDefinition;
  var ConditionalEventDefinition: EventDefinition;
  var ErrorEventDefinition: EventDefinition;
  var EscalationEventDefinition: EventDefinition;
  var LinkEventDefinition: EventDefinition;
  var MessageEventDefinition: EventDefinition;
  var SignalEventDefinition: EventDefinition;
  var TerminateEventDefinition: EventDefinition;

  const enum TimerType {
    TimeCycle = 'timeCycle',
    TimeDuration = 'timeDuration',
    TimeDate = 'timeDate',
  }

  type parsedTimer = {
    /** Expires at date time */
    expireAt?: Date,
    /** Repeat number of times */
    repeat?: number,
    /** Delay in milliseconds */
    delay?: number,
  };

  class TimerEventDefinition extends EventDefinition {
    /**
     * Parse timer type
     * @param timerType type of timer
     * @param timerValue resolved expression timer string
     */
    parse(timerType: TimerType, timerValue: string): parsedTimer;
  }

  class BpmnError {
    get id(): string;
    get type(): string;
    get name(): string;
    get errorCode(): string;
    resolve(executionMessage: ElementBrokerMessage, error: any): {
      id: string;
      type: string;
      messageType: string;
      name: string;
      code: string;
      inner?: any
    };
  }

  class ServiceImplementation {
    constructor(activity: Activity);
    get type(): string;
    get implementation(): string;
    get activity(): Activity;
    execute(executionMessage: ElementBrokerMessage, callback: CallableFunction): void;
  }

  class Message extends MessageElement {}
  class Signal extends MessageElement {}
  class Escalation extends MessageElement {}

  class ActivityError extends Error {
    type: string;
    description: string;
    /** Activity that threw error */
    source?: ElementBrokerMessage;
    /** Original error */
    inner?: Error;
    code?: string;
    constructor(description: string, sourceMessage: MessageMessage, inner?: Error);
  }

  interface Duration {
    years?: number;
    months?: number;
    weeks?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
    repeat?: number;
  }

  type ISODurationApi = {
    /** Parse PnYnMnDTnHnMnS format to object */
    parse: (durationString: string) => Duration,
    /** Convert ISO8601 duration object to an end Date. */
    end: (durationInput: Duration, startDate?: Date) => Date,
    /** Convert ISO8601 duration object to seconds */
    toSeconds: (durationInput: Duration, startDate?: Date) => number,
  }

  const ISODuration: ISODurationApi;
}

/**
 * Evaluate flow callback
 * @callback evaluateCallback
 * @param {Error} err Evaluation error
 * @param {boolean|object} evaluationResult If thruthy flow should be taken
 */
