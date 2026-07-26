declare module 'bpmn-elements' {
	import type { Broker, BrokerState, Consumer, MessageEnvelope, MessageFields, MessageProperties } from 'smqp';
	import type { SerializableContext, SerializableElement } from 'moddle-context-serializer';
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
	executionId: string;
	path?: Omit<ElementParent, 'path'>[];
  }

  /** Resolved signal-, message-, or escalation reference, shared by their `resolve` functions. */
  export interface ResolvedReference {
	id?: string;
	type?: string;
	messageType: string;
	name?: string;
	parent: ElementParent;
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

  // --- Element abstract bases ---------------------------------------------------

  export class ElementBase {
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
  export enum TimerTypeValue {
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

  export interface IActivityBehaviour {
	id: string;
	type: string;
	activity: Activity;
	environment: Environment;
	new (activity: Activity, context: ContextInstance): IActivityBehaviour;
	execute(executeMessage: ElementBrokerMessage): void;
  }

  export type Extension = (activity: any, context: any) => Partial<IExtension> | void;

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
  export enum DefinitionStatusValue {
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
  export enum ProcessStatusValue {
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
  export enum ActivityStatusValue {
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
	/** Defaults to builtin setTimeout */
	setTimeout?: typeof setTimeout;
	/** Defaults to builtin clearTimeout */
	clearTimeout?: typeof clearTimeout;
	[x: string]: any;
  }

  // --- Scripts ------------------------------------------------------------------

  export interface IScripts {
	register(activity: Activity): Script | undefined;
	getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
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
	get(activity: any): IExtensions[];
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
	/**
	 * Activity wraps any element (task, event, gateway) and orchestrates its lifecycle through the broker.
	 * @param Behaviour Element-specific behaviour constructor invoked per execution
	 * @param activityDef Parsed BPMN element definition
	 * @param context Per-execution registry and factory
	 */
		export class Activity {
		/**
		 * Activity wraps any element (task, event, gateway) and orchestrates its lifecycle through the broker.
		 * @param Behaviour Element-specific behaviour constructor invoked per execution
		 * @param activityDef Parsed BPMN element definition
		 * @param context Per-execution registry and factory
		 */
		constructor(Behaviour: IActivityBehaviour, activityDef: import("moddle-context-serializer").Activity, context: ContextInstance);
		id: string | undefined;
		type: string;
		name: string | undefined;
		
		behaviour: import("moddle-context-serializer").ActivityBehaviour;
		Behaviour: IActivityBehaviour;
		
		parent: import("moddle-context-serializer").Parent;
		
		logger: ILogger;
		environment: Environment;
		context: ContextInstance;
		
		status: ActivityStatus | undefined;
		broker: ElementBroker<Activity>;
		on: (eventName: string, callback: CallableFunction, eventOptions?: {
			once?: boolean;
			[x: string]: any;
		}) => import("smqp").Consumer;
		once: (eventName: string, callback: CallableFunction, eventOptions?: {
			[x: string]: any;
		}) => import("smqp").Consumer;
		waitFor: (eventName: string, onMessage?: ((routingKey: string, message: ElementBrokerMessage, owner: Activity) => boolean) | undefined) => Promise<IApi<Activity>>;
		emitFatal: (error: Error, content?: Record<string, any>) => void;
		/**
		 * Subscribe to inbound flows and start consuming the inbound queue.
		 * */
		activate(): void;
		/**
		 * Assert the inbound queue consumer when the activity has a trigger or is initialized.
		 * Idempotent: asserting the consumer again while one is active is a no-op.
		 * */
		consumeInbound(): void;
		/**
		 * Cancel inbound subscriptions and any pending run/format consumers.
		 */
		deactivate(): void;
		/**
		 * Initialise activity executionId and emit init event without starting the run.
		 * @param initContent Optional content merged into the init message
		 * @param properties Optional message properties merged into the init message properties
		 */
		init(initContent?: Record<string, any>, properties?: import("smqp").MessageProperties): void;
		/**
		 * Start running the activity by publishing run.enter and run.start.
		 * @param runContent Optional content merged into the run message
		 * @throws {Error} if the activity is already running
		 */
		run(runContent?: Record<string, any>): void;
		/**
		 * Snapshot activity state for recover.
		 * Returns undefined when nothing is running and `disableTrackState` is set.
		 * */
		getState(): ActivityState;
		/**
		 * Restore activity state captured by getState. Cannot be called while running.
		 * @returns this when state was applied
		 * @throws {Error} when activity is currently running
		 */
		recover(state?: ActivityState): this;
		stopped: boolean | undefined;
		/**
		 * Resume after recover. If no run has been started, falls back to activate.
		 * @throws {Error} when called on a running activity
		 */
		resume(): void;
		/**
		 * Discard the activity. Stops execution if running; the activity leaves without taking any outbound flow.
		 * @param discardContent Optional content propagated with the discard
		 * */
		discard(discardContent?: Record<string, any>): void;
		/**
		 * Subscribe to inbound triggers (sequence flows, attached activity, or compensation associations).
		 * @returns count of subscribed triggers
		 */
		addInboundListeners(): number;
		/**
		 * Cancel inbound trigger subscriptions added by addInboundListeners.
		 */
		removeInboundListeners(): void;
		/**
		 * Stop the activity. If not currently running, just cancels the inbound consumer.
		 */
		stop(): boolean | void;
		/**
		 * Advance one run-step when the environment runs in step mode. No-op otherwise.
		 */
		next(): false | ElementBrokerMessage | undefined;
		/**
		 * Walk outbound flows to discover the activity graph from this point.
		 */
		shake(): void;
		/**
		 * Evaluate outbound sequence flows for the given source message.
		 * @param fromMessage Source run message
		 * @param discardRestAtTake When true, take only the first matching flow and discard the rest
		 * */
		evaluateOutbound(fromMessage: ElementBrokerMessage, discardRestAtTake: boolean, callback: (err: Error, evaluationResult: any) => void): void;
		/**
		 * Resolve an Api wrapper for the activity, preferring the running execution if any.
		 * */
		getApi(message?: ElementBrokerMessage): IApi<Activity>;
		/**
		 * Look up another activity in the same context.
		 * */
		getActivityById(elementId: string): Activity | null;
		get counters(): {
			taken: number;
			discarded: number;
		};
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
	}
	/**
	 * Per-run execution orchestrator for an Activity. Instantiates the element-specific behaviour
	 * and drives the execute message flow over the activity broker.
	 * */
		export class ActivityExecution {
		/**
		 * Per-run execution orchestrator for an Activity. Instantiates the element-specific behaviour
		 * and drives the execute message flow over the activity broker.
		 * */
		constructor(activity: Activity, context: ContextInstance);
		activity: Activity;
		context: ContextInstance;
		id: string | undefined;
		broker: ElementBroker<Activity>;
		get completed(): boolean;
		/**
		 * Begin executing the activity behaviour. Resumes if the message is redelivered.
		 * @throws {Error} when message or executionId is missing
		 */
		execute(executeMessage: ElementBrokerMessage): number | undefined;
		executionId: string | undefined;
		source: IActivityBehaviour | undefined;
		/**
		 * Bind the execute queue and start consuming execute and api messages.
		 */
		activate(): void;
		/**
		 * Cancel execute and api consumers and unbind the execute queue.
		 */
		deactivate(): void;
		/**
		 * Discard the running execution.
		 */
		discard(): void;
		/**
		 * Resolve an Api wrapper, preferring a behaviour-specific Api when the source exposes one.
		 * */
		getApi(apiMessage?: ElementBrokerMessage): IApi<Activity>;
		/**
		 * Pass an execute message straight to the behaviour, executing first if no source is set up yet.
		 * */
		passthrough(executeMessage: ElementBrokerMessage): void;
		/**
		 * List currently postponed executions as Api wrappers, including those from sub-process behaviours.
		 */
		getPostponed(): IApi<Activity>[];
		/**
		 * Snapshot execution state, merging behaviour-specific state when the source provides it.
		 * */
		getState(): ActivityExecutionState;
		/**
		 * Restore execution state captured by getState.
		 * */
		recover(state?: ActivityExecutionState): this;
		/**
		 * Stop the execution via the activity api.
		 */
		stop(): void;
	}
	/**
	 * BPMN error.
	 * */
	export function BpmnError(errorDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance): {
		id: string | undefined;
		type: string | undefined;
		name: string;
		errorCode: any;
		resolve: (executionMessage: ElementBrokerMessage, error?: Error) => ResolvedReference & {
			code?: string;
		};
	};
	/**
	 * Build a runtime Context from a parsed BPMN definition.
	 * @param environment Existing environment to clone; a fresh one is created when omitted
	 */
	export function Context(definitionContext: import("moddle-context-serializer").SerializableContext, environment?: Environment): ContextInstance;
	/**
	 * Per-execution registry that lazily upserts activities, flows, and processes from the parsed BPMN definition.
	 * @param owner Process or sub-process activity that owns this context
	 * @param peersCache Shared converging parallel gateway peer cache; created at the root and propagated to every clone
	 */
		export class ContextInstance {
		/**
		 * Per-execution registry that lazily upserts activities, flows, and processes from the parsed BPMN definition.
		 * @param owner Process or sub-process activity that owns this context
		 * @param peersCache Shared converging parallel gateway peer cache; created at the root and propagated to every clone
		 */
		constructor(definitionContext: import("moddle-context-serializer").SerializableContext, environment: Environment, owner?: Process | Activity, peersCache?: Map<string, any>);
		id: string;
		name: string;
		type: string;
		/** Unique instance id */
		sid: string;
		definitionContext: import("moddle-context-serializer").SerializableContext;
		environment: Environment;
		/** Discovered parallel gateway peers, keyed by gateway id, shared with all clones. Runtime-only, not serialized. */
		peersCache: Map<any, any>;
		
		extensionsMapper: IExtensionsMapper;
		get owner(): Activity | Process | undefined;
		/**
		 * Get or create the activity instance for the given id.
		 * */
		getActivityById(activityId: string): Activity | null;
		/**
		 * Return the cached activity instance, instantiating it the first time it is referenced.
		 * */
		upsertActivity(activityDef: import("moddle-context-serializer").SerializableElement): Activity;
		/**
		 * Get or create the sequence flow instance for the given id.
		 * */
		getSequenceFlowById(sequenceFlowId: string): SequenceFlow | null;
		
		getInboundSequenceFlows(activityId: string): SequenceFlow[];
		
		getOutboundSequenceFlows(activityId: string): SequenceFlow[];
		
		getInboundAssociations(activityId: string): Association[];
		
		getOutboundAssociations(activityId: string): Association[];
		/**
		 * Get every activity in the definition, optionally narrowed to a parent scope.
		 * @param scopeId Process or sub-process id
		 */
		getActivities(scopeId?: string): Activity[];
		/**
		 * Get every sequence flow in the definition, optionally narrowed to a parent scope.
		 * @param scopeId Process or sub-process id
		 */
		getSequenceFlows(scopeId?: string): SequenceFlow[];
		/**
		 * Return the cached sequence flow, instantiating it the first time it is referenced.
		 * */
		upsertSequenceFlow(flowDefinition: import("moddle-context-serializer").SerializableElement): SequenceFlow;
		/**
		 * Get association flows
		 * @param scopeId Process or sub-process id
		 */
		getAssociations(scopeId?: string): Association[];
		
		upsertAssociation(associationDefinition: import("moddle-context-serializer").SerializableElement): Association;
		/**
		 * Create a new context that shares the parsed definition but optionally swaps environment and owner.
		 * 
		 */
		clone(newEnvironment?: Environment, newOwner?: Process | Activity): ContextInstance;
		/**
		 * Cached converging parallel gateway peers discovered by an earlier shake.
		 * */
		getShakenPeers(gatewayId: string): Array<[string, string[]]> | undefined;
		/**
		 * Store converging parallel gateway peers so subsequent runs can skip the graph shake.
		 * */
		setShakenPeers(gatewayId: string, peers: Array<[string, string[]]>): void;
		/**
		 * Get or create the process instance for the given id. Each process gets its own cloned environment.
		 * */
		getProcessById(processId: string): Process | null;
		/**
		 * Build a fresh, uncached process instance for the given id. Used by call activities.
		 * */
		getNewProcessById(processId: string): Process | null;
		/**
		 * Get every process in the definition.
		 * */
		getProcesses(): Process[];
		/**
		 * Get processes flagged executable in the definition.
		 * */
		getExecutableProcesses(): Process[];
		/**
		 * Get message flows that originate from the given process id.
		 * @param sourceId Source process id
		 * */
		getMessageFlows(sourceId: string): MessageFlow[];
		/**
		 * Get or create a data object instance for the given reference id.
		 * */
		getDataObjectById(referenceId: string): IIOData | undefined;
		/**
		 * Get or create a data store instance for the given reference id.
		 * */
		getDataStoreById(referenceId: string): IIOData | undefined;
		/**
		 * Get start activities, optionally filtered by referenced event definition or restricted to a parent scope.
		 * @param scopeId Process or sub-process id
		 */
		getStartActivities(filterOptions?: startActivityFilterOptions, scopeId?: string): Activity[];
		/**
		 * Inspect an activity def for link event definitions.
		 * */
		getLinkEventDefinitionInfo(activityDef: import("moddle-context-serializer").Activity): {
			linkBehaviour?: Function;
			linkNames?: string[];
		};
		/**
		 * Get activities whose event definitions include the given Behaviour with a matching name.
		 * @param Behaviour Behaviour constructor to match against `ed.Behaviour`
		 * @param scopeId Process or sub-process id
		 */
		getActivitiesByEventDefinitionBehaviour(Behaviour: Function, names: string[] | Iterable<string>, scopeId?: string): Activity[];
		/**
		 * Resolve user-registered extensions and the built-in BpmnIO extension for an activity.
		 * Returns undefined when the activity has no extensions to attach.
		 * */
		loadExtensions(activity: ElementBase): IExtension | undefined;
		/**
		 * Resolve the parent process or sub-process activity that owns the given activity.
		 * */
		getActivityParentById(activityId: string): Activity | Process | null;
	}
	/**
	 * Top-level wrapper for an executable BPMN definition. Owns its DefinitionExecution and
	 * mediates inter-process messaging.
	 * @param options When provided, environment is cloned and settings merged
	 */
		export class Definition {
		/**
		 * Top-level wrapper for an executable BPMN definition. Owns its DefinitionExecution and
		 * mediates inter-process messaging.
		 * @param options When provided, environment is cloned and settings merged
		 */
		constructor(context: ContextInstance, options?: EnvironmentOptions);
		id: string;
		
		type: string;
		name: string;
		
		environment: Environment;
		context: ContextInstance;
		broker: ElementBroker<Definition>;
		on: (eventName: string, callback: CallableFunction, eventOptions?: {
			once?: boolean;
			[x: string]: any;
		}) => import("smqp").Consumer;
		once: (eventName: string, callback: CallableFunction, eventOptions?: {
			[x: string]: any;
		}) => import("smqp").Consumer;
		waitFor: (eventName: string, onMessage?: ((routingKey: string, message: ElementBrokerMessage, owner: Definition) => boolean) | undefined) => Promise<IApi<Definition>>;
		emit: (eventName: string, content?: Record<string, any>, props?: any) => void;
		emitFatal: (error: Error, content?: Record<string, any>) => void;
		
		logger: ILogger;
		/**
		 * Start running the definition. Accepts run options, a callback, or both.
		 * The callback fires once on leave, stop, or error.
		 * @throws {Error} when already running and no callback is supplied
		 */
		run(options?: Record<string, any> | undefined): this;
		/**
		 * Start running the definition. Accepts run options, a callback, or both.
		 * The callback fires once on leave, stop, or error.
		 * @throws {Error} when already running and no callback is supplied
		 */
		run(options: Record<string, any>, callback: runCallback): this;
		/**
		 * Start running the definition. Accepts run options, a callback, or both.
		 * The callback fires once on leave, stop, or error.
		 * @throws {Error} when already running and no callback is supplied
		 */
		run(callback: runCallback): this;
		/**
		 * Resume after recover by republishing the last run message. The callback fires once on
		 * leave, stop, or error.
		 * */
		resume(callback?: runCallback): this;
		/**
		 * Snapshot definition state for recover.
		 * */
		getState(): DefinitionState;
		/**
		 * Restore definition state captured by getState.
		 * @throws {Error} when called on a running definition
		 */
		recover(state?: DefinitionState): this;
		/**
		 * Walk activity graphs to discover sequences. Limited to the activity's owning process
		 * when startId is given, otherwise all processes are shaken.
		 * */
		shake(startId?: string): ShakeResult | undefined;
		/**
		 * Get every process in the definition.
		 */
		getProcesses(): Process[];
		/**
		 * Get processes flagged executable in the definition.
		 */
		getExecutableProcesses(): Process[];
		/**
		 * Get processes that are currently running.
		 */
		getRunningProcesses(): Process[];
		
		getProcessById(processId: string): Process | undefined;
		/**
		 * Find an activity by id across all processes in the definition.
		 * */
		getActivityById(childId: string): Activity | null;
		/**
		 * Lookup any element (activity, flow, etc.) in the parsed definition by id.
		 * */
		getElementById(elementId: string): Activity | null;
		/**
		 * List currently postponed activities as Api wrappers.
		 * */
		getPostponed(filterFn?: filterPostponed | undefined): IApi<Activity>[];
		/**
		 * Resolve a Definition Api wrapper, preferring the running execution if any.
		 * @throws {Error} when the definition is not running and no message is given
		 */
		getApi(message?: ElementBrokerMessage): IApi<this>;
		/**
		 * Send a delegated signal to the running definition.
		 * 
		 */
		signal(message?: signalMessage): void;
		/**
		 * Cancel a running activity inside the definition by delegated api message.
		 * 
		 */
		cancelActivity(message?: signalMessage): void;
		/**
		 * Deliver a message to a referenced element. Resolves the message reference when the
		 * target element exposes a `resolve` method (e.g. message-, signal-, escalation events).
		 * */
		sendMessage(message: {
			id?: string;
			[x: string]: any;
		}): void;
		/**
		 * Stop the definition if running.
		 */
		stop(): void;
		get counters(): {
			completed: number;
			discarded: number;
		};
		get execution(): DefinitionExecution | undefined;
		get executionId(): string | undefined;
		get isRunning(): boolean;
		get status(): DefinitionStatus | undefined;
		get stopped(): boolean;
		get activityStatus(): ActivityStatus;
	}
	/**
	 * Drives the execution of a Definition. Activates executable processes, routes inter-process
	 * delegate messages and call activity hand-offs, and rolls completion up to the Definition.
	 * */
		export class DefinitionExecution {
		/**
		 * Drives the execution of a Definition. Activates executable processes, routes inter-process
		 * delegate messages and call activity hand-offs, and rolls completion up to the Definition.
		 * */
		constructor(definition: Definition, context: ContextInstance);
		id: string;
		type: string;
		broker: ElementBroker<Definition>;
		environment: Environment;
		context: ContextInstance;
		executionId: string | undefined;
		/**
		 * Activate executable processes and start the definition execution. Resumes if the message
		 * is redelivered. When `content.processId` is set, only that process is started.
		 * @throws {Error} when message or executionId is missing
		 */
		execute(executeMessage: ElementBrokerMessage): number | true | undefined;
		/**
		 * Resume after recover by reactivating running processes.
		 */
		resume(): number | undefined;
		/**
		 * Restore execution state captured by getState. Reinstates running processes from the snapshot.
		 * @param recoveredVersion State version
		 * */
		recover(state?: DefinitionExecutionState, recoveredVersion?: number): this;
		/**
		 * Stop the running execution via the api.
		 */
		stop(): void;
		/**
		 * Get every process in the definition (running first, then any non-running by id).
		 * */
		getProcesses(): Process[];
		
		getProcessById(processId: string): Process | undefined;
		/**
		 * Get every process matching the given id (call activities can spawn duplicates).
		 * */
		getProcessesById(processId: string): Process[];
		
		getProcessByExecutionId(processExecutionId: string): Process | undefined;
		/**
		 * Get processes that have an executionId, i.e. are currently running.
		 * */
		getRunningProcesses(): Process[];
		/**
		 * Get processes flagged executable in the definition.
		 * */
		getExecutableProcesses(): Process[];
		/**
		 * Snapshot execution state for recover.
		 * */
		getState(): DefinitionExecutionState;
		/**
		 * Resolve a Definition Api or, when the message belongs to a child process, its process Api.
		 * */
		getApi(apiMessage?: ElementBrokerMessage): IApi<Definition>;
		/**
		 * List currently postponed activities across every running process.
		 * */
		getPostponed(filterFn?: filterPostponed | undefined): IApi<Activity>[];
		get stopped(): boolean;
		get completed(): boolean;
		get status(): DefinitionStatus;
		get processes(): Process[];
		get postponedCount(): number;
		get isRunning(): boolean;
		get activityStatus(): ActivityStatus;
	}
	/**
	 * Placeholder activity for non-executable elements (text annotations, groups, categories).
	 * */
	export function Dummy(activityDef: import("moddle-context-serializer").Activity): {
		id: string;
		type: string;
		name: string | undefined;
		behaviour: Record<string, any>;
		parent: ElementParent;
		placeholder: true;
	};
	/**
	 * Holds global execution config: variables, injected services, timers, scripts engine,
	 * expressions, Logger factory, and settings such as `batchSize`. Cloned and merged per Definition.
	 * 
	 */
		export class Environment {
		/**
		 * Holds global execution config: variables, injected services, timers, scripts engine,
		 * expressions, Logger factory, and settings such as `batchSize`. Cloned and merged per Definition.
		 * 
		 */
		constructor(options?: EnvironmentOptions);
		options: EnvironmentOptions;
		
		expressions: IExpressions;
		extensions: Record<string, Extension> | undefined;
		output: any;
		
		scripts: IScripts;
		
		timers: ITimers;
		
		settings: EnvironmentSettings;
		
		Logger: LoggerFactory;
		get variables(): Record<string, any>;
		set services(value: Record<string, ServiceFunction>);
		get services(): Record<string, ServiceFunction>;
		/**
		 * Snapshot environment state for recover.
		 * */
		getState(): EnvironmentState;
		/**
		 * Restore environment state captured by getState. Merges into the existing settings,
		 * variables, and output rather than replacing them.
		 * */
		recover(state?: EnvironmentState): this;
		/**
		 * Clone the environment, optionally overriding options. Services are merged when
		 * `overrideOptions.services` is supplied.
		 * */
		clone(overrideOptions?: EnvironmentOptions): Environment;
		/**
		 * Merge variables into the environment. Non-objects are ignored.
		 * */
		assignVariables(newVars: Record<string, any>): void;
		/**
		 * Merge settings into the environment. Non-objects are ignored.
		 * */
		assignSettings(newSettings: EnvironmentSettings): this;
		/**
		 * Resolve a registered script by language and identifier.
		 * */
		getScript(...args: any[]): Script;
		/**
		 * Register a script for an activity, delegating to the configured scripts engine.
		 * */
		registerScript(...args: any[]): Script | undefined;
		/**
		 * Lookup a registered service by name.
		 * */
		getServiceByName(serviceName: string): ServiceFunction | undefined;
		/**
		 * Resolve an expression with the environment as scope, optionally extended by an element message.
		 * @param message Element message merged onto the resolution scope
		 * 
		 */
		resolveExpression(expression: string, message?: ElementBrokerMessage, expressionFnContext?: any): any;
		/**
		 * Register a service callable by name.
		 * @param name service function name
		 * @param fn service function
		 */
		addService(name: string, fn: ServiceFunction): void;
	}
	/**
	 * Builtin data object. Reads from / writes to `environment.variables._data`.
	 * */
		export class DataObject {
		/**
		 * Builtin data object. Reads from / writes to `environment.variables._data`.
		 * */
		constructor(dataObjectDef: import("moddle-context-serializer").DataObject, { environment }: ContextInstance);
		id: string | undefined;
		type: string | undefined;
		name: string | undefined;
		
		behaviour: Record<string, any>;
		
		parent: import("moddle-context-serializer").Parent | undefined;
		environment: Environment;
		
		read(broker: import("smqp").Broker, exchange: string, routingKeyPrefix: string, messageProperties?: Record<string, any>): void;
		
		write(broker: import("smqp").Broker, exchange: string, routingKeyPrefix: string, value: any, messageProperties?: Record<string, any>): void;
	}
	/**
	 * Builtin data store. Reads from / writes to `environment.variables._data`.
	 * */
		export class DataStore {
		/**
		 * Builtin data store. Reads from / writes to `environment.variables._data`.
		 * */
		constructor(dataStoreDef: import("moddle-context-serializer").DataStore, { environment }: ContextInstance);
		id: string | undefined;
		type: string | undefined;
		name: string | undefined;
		
		behaviour: Record<string, any>;
		
		parent: import("moddle-context-serializer").Parent | undefined;
		environment: Environment;
		
		read(broker: import("smqp").Broker, exchange: string, routingKeyPrefix: string, messageProperties?: Record<string, any>): void;
		
		write(broker: import("smqp").Broker, exchange: string, routingKeyPrefix: string, value: any, messageProperties?: Record<string, any>): void;
	}
	/**
	 * Builtin data store reference. Reads from / writes to `environment.variables._data`.
	 * */
		export class DataStoreReference {
		/**
		 * Builtin data store reference. Reads from / writes to `environment.variables._data`.
		 * */
		constructor(dataObjectDef: import("moddle-context-serializer").DataStore, { environment }: ContextInstance);
		id: string | undefined;
		type: string | undefined;
		name: string | undefined;
		
		behaviour: Record<string, any>;
		
		parent: import("moddle-context-serializer").Parent | undefined;
		environment: Environment;
		
		read(broker: import("smqp").Broker, exchange: string, routingKeyPrefix: string, messageProperties?: Record<string, any>): void;
		
		write(broker: import("smqp").Broker, exchange: string, routingKeyPrefix: string, value: any, messageProperties?: Record<string, any>): void;
	}
	/**
	 * Escalation reference element. Resolves the escalation name expression against the execution message.
	 * */
		export class Escalation {
		/**
		 * Escalation reference element. Resolves the escalation name expression against the execution message.
		 * */
		constructor(escalationDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance);
		id: string | undefined;
		type: string | undefined;
		name: string | undefined;
		
		parent: ElementParent;
		environment: Environment | undefined;
		/**
		 * Resolve escalation reference for the given execution message.
		 * */
		resolve(executionMessage: ElementBrokerMessage): ResolvedReference;
	}
	/**
	 * Activity ioSpecification behaviour. Reads bound data objects on enter and writes them on completion.
	 * */
		export class InputOutputSpecification {
		/**
		 * Activity ioSpecification behaviour. Reads bound data objects on enter and writes them on completion.
		 * */
		constructor(activity: Activity, ioSpecificationDef: import("moddle-context-serializer").IoSpecification, context: ContextInstance);
		id: string | undefined;
		type: string;
		behaviour: {
			dataInputs?: import("moddle-context-serializer").IElement[];
			dataOutputs?: import("moddle-context-serializer").IElement[];
		};
		activity: Activity;
		broker: ElementBroker<Activity>;
		context: ContextInstance;
		
		activate(message?: ElementBrokerMessage): void;
		deactivate(): void;
	}
	/**
	 * Process lane. Wraps a `<bpmn:lane>` definition and points back to its owning process;
	 * activities reference their lane through `Activity.lane`.
	 * */
		export class Lane {
		/**
		 * Process lane. Wraps a `<bpmn:lane>` definition and points back to its owning process;
		 * activities reference their lane through `Activity.lane`.
		 * */
		constructor(process: Process, laneDefinition: import("moddle-context-serializer").SerializableElement);
		id: string | undefined;
		type: string | undefined;
		
		name: string;
		
		parent: import("moddle-context-serializer").Parent;
		
		behaviour: Record<string, any>;
		environment: Environment;
		broker: ElementBroker<Process>;
		context: ContextInstance;
		logger: ILogger;
		get process(): Process;
	}
	/**
	 * Loop characteristics
	 * */
		export class MultiInstanceLoopCharacteristics {
		/**
		 * Loop characteristics
		 * */
		constructor(activity: Activity, loopCharacteristics: import("moddle-context-serializer").SerializableElement);
		activity: Activity;
		loopCharacteristics: import("moddle-context-serializer").SerializableElement<Record<string, any>>;
		type: string;
		
		isSequential: boolean;
		
		collection: string | undefined;
		
		loopCardinality: number | undefined;
		loopType: string | undefined;
		
		elementVariable: string | undefined;
		
		characteristics: Characteristics;
		execution: any;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Per-execution snapshot of resolved loop characteristics (cardinality, collection, conditions).
	 * */
		class Characteristics {
		/**
		 * Per-execution snapshot of resolved loop characteristics (cardinality, collection, conditions).
		 * */
		constructor(activity: Activity, loopCharacteristics: import("moddle-context-serializer").SerializableElement, executeMessage: ElementBrokerMessage);
		activity: Activity;
		behaviour: Record<string, any>;
		message: ElementBrokerMessage;
		type: string;
		id: string | undefined;
		broker: ElementBroker<Activity>;
		parentExecutionId: string | undefined;
		
		isSequential: boolean;
		output: any;
		parent: ElementParent;
		loopCardinality: number | undefined;
		startCondition: string | undefined;
		completionCondition: string;
		collection: any[] | undefined;
		
		elementVariable: string;
		cardinality: number | undefined;
		logger: ILogger;
		batchSize: number;
		
		getContent(): ElementMessageContent;
		
		next(index: number): ElementMessageContent;
		/**
		 * @returns cardinality
		 */
		getCardinality(collection?: any): number | undefined;
		
		getCollection(): any[] | undefined;
		
		isStartConditionMet(message: ElementBrokerMessage): any;
		
		isCompletionConditionMet(message: ElementBrokerMessage): any;
		
		complete(content: ElementMessageContent, allDiscarded?: boolean): void;
		
		subscribe(onIterationCompleteMessage: ElementBrokerMessage): void;
		stop(): void;
	}
	/**
	 * Message reference element. Resolves the message name expression against the execution message.
	 * */
		export class Message {
		/**
		 * Message reference element. Resolves the message name expression against the execution message.
		 * */
		constructor(messageDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance);
		id: string | undefined;
		type: string | undefined;
		name: string | undefined;
		
		parent: ElementParent;
		environment: Environment | undefined;
		/**
		 * Resolve message reference for the given execution message.
		 * */
		resolve(executionMessage: ElementBrokerMessage): ResolvedReference;
	}
	/**
	 * Owns one `<bpmn:process>`. Wraps the structural definition and orchestrates flow traversal,
	 * joins, and parallel activation through ProcessExecution.
	 * */
		export class Process {
		/**
		 * Owns one `<bpmn:process>`. Wraps the structural definition and orchestrates flow traversal,
		 * joins, and parallel activation through ProcessExecution.
		 * */
		constructor(processDef: import("moddle-context-serializer").Process, context: ContextInstance);
		id: string | undefined;
		type: string;
		name: string | undefined;
		
		parent: ElementParent;
		
		behaviour: import("moddle-context-serializer").Process["behaviour"];
		isExecutable: any;
		environment: Environment;
		context: ContextInstance;
		broker: ElementBroker<Process>;
		on: (eventName: string, callback: CallableFunction, eventOptions?: {
			once?: boolean;
			[x: string]: any;
		}) => import("smqp").Consumer;
		once: (eventName: string, callback: CallableFunction, eventOptions?: {
			[x: string]: any;
		}) => import("smqp").Consumer;
		waitFor: (eventName: string, onMessage?: ((routingKey: string, message: ElementBrokerMessage, owner: Process) => boolean) | undefined) => Promise<IApi<Process>>;
		emitFatal: (error: Error, content?: Record<string, any>) => void;
		logger: ILogger;
		/**
		 * Allocate an executionId and emit init event without starting the run.
		 * @param useAsExecutionId Override for the generated execution id
		 */
		init(useAsExecutionId?: string): void;
		/**
		 * Start running the process by publishing run.enter, run.start, and run.execute.
		 * @param runContent Optional content merged into the run message
		 * @throws {Error} when the process is already running
		 */
		run(runContent?: Record<string, any>): void;
		/**
		 * Resume after recover by republishing the last run message.
		 * @throws {Error} when called on a running process
		 */
		resume(): this;
		/**
		 * Snapshot process state for recover.
		 * */
		getState(): ProcessState;
		/**
		 * Restore process state captured by getState.
		 * @param recoveredVersion State version
		 * @throws {Error} when called on a running process
		 */
		recover(state?: ProcessState, recoveredVersion?: number): this;
		/**
		 * Walk activity graph from the given start id, or every start activity when omitted.
		 * */
		shake(startId?: string): ShakeResult;
		/**
		 * Stop the process if running.
		 */
		stop(): void;
		/**
		 * Resolve a Process Api wrapper, preferring the running execution if any.
		 * */
		getApi(message?: ElementBrokerMessage): IApi<this>;
		/**
		 * Send a delegated signal to the running process.
		 * 
		 */
		signal(message?: signalMessage): void;
		/**
		 * Cancel a running activity inside the process by delegated api message.
		 * 
		 */
		cancelActivity(message?: signalMessage): void;
		/**
		 * Deliver a message to a target activity or start activity that references it.
		 * Starts the process if a target is found and the process is idle.
		 * */
		sendMessage(message: ElementBrokerMessage): void;
		
		getActivityById(childId: string): Activity | null;
		/**
		 * Get every activity in the process scope.
		 */
		getActivities(): Activity[];
		/**
		 * Get start activities, optionally filtered by referenced event definition.
		 * 
		 */
		getStartActivities(filterOptions?: startActivityFilterOptions): Activity[];
		/**
		 * Get sequence flows in the process scope.
		 */
		getSequenceFlows(): SequenceFlow | SequenceFlow[];
		
		getLaneById(laneId: string): Lane | undefined;
		/**
		 * List currently postponed activities as Api wrappers.
		 * */
		getPostponed(filterFn?: filterPostponed | undefined): IApi<Activity>[];
		get counters(): {
			completed: number;
			discarded: number;
		};
		get lanes(): Lane[] | undefined;
		get extensions(): IExtension | undefined;
		get stopped(): boolean;
		get isRunning(): boolean;
		get executionId(): string | undefined;
		get execution(): ProcessExecution | undefined;
		get status(): ProcessStatus | undefined;
		get activityStatus(): ActivityStatus;
	}
	/**
	 * Activity properties behaviour. Resolves bound data input/output references during the run.
	 * */
	export function Properties(activity: Activity, propertiesDef: {
		type: "properties";
		values: import("moddle-context-serializer").IElement[];
	}, context: ContextInstance): void;
	export class Properties {
		/**
		 * Activity properties behaviour. Resolves bound data input/output references during the run.
		 * */
		constructor(activity: Activity, propertiesDef: {
			type: "properties";
			values: import("moddle-context-serializer").IElement[];
		}, context: ContextInstance);
		activity: Activity;
		broker: ElementBroker<Activity>;
		
		activate(message: ElementBrokerMessage): void;
		deactivate(): void;
	}
	/**
	 * Service implementation
	 * */
		export class ServiceImplementation {
		/**
		 * Service implementation
		 * */
		constructor(activity: Activity);
		type: string;
		implementation: any;
		activity: Activity;
		execute(executionMessage: any, callback: any): any;
	}
	/**
	 * Signal reference element. Resolves the signal name expression against the execution message.
	 * */
		export class Signal {
		/**
		 * Signal reference element. Resolves the signal name expression against the execution message.
		 * */
		constructor(signalDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance);
		id: string | undefined;
		type: string | undefined;
		name: string | undefined;
		
		parent: ElementParent;
		environment: Environment | undefined;
		/**
		 * Resolve signal reference for the given execution message.
		 * */
		resolve(executionMessage: ElementBrokerMessage): ResolvedReference;
	}
	/**
	 * Standard loop characteristics
	 * */
	export function StandardLoopCharacteristics(activity: Activity, loopCharacteristics: import("moddle-context-serializer").SerializableElement): MultiInstanceLoopCharacteristics;
	/**
	 * Default timers handler
	 * 
	 */
		export class Timers {
		/**
		 * Default timers handler
		 * 
		 */
		constructor(options?: TimersOptions);
		count: number;
		
		options: Required<TimersOptions>;
		
		setTimeout: wrappedSetTimeout;
		
		clearTimeout: wrappedClearTimeout;
		get executing(): Timer[];
		register(owner: any): RegisteredTimers;
	}

		class RegisteredTimers {
		
		constructor(timersApi: Timers, owner: any);
		owner: any;
		
		setTimeout: wrappedSetTimeout;
		
		clearTimeout: wrappedClearTimeout;
	}
	export class ActivityError extends Error {
		
		constructor(description: string, sourceMessage?: ElementBrokerMessage, inner?: Error | {
			name?: string;
			code?: string | number;
		});
		
		type: string;
		
		description: string;
		
		source: Pick<ElementBrokerMessage, "fields" | "content" | "properties"> | undefined;
		
		inner: Error | {
			name?: string;
			code?: string | number;
		} | undefined;
		
		code: string | number | undefined;
	}
	export class RunError extends ActivityError {
	}
	/**
	 * Drives the execution of a single process or sub-process: activates children, routes activity
	 * events, and rolls completion up to the owning Process or sub-process Activity.
	 * */
		class ProcessExecution {
		/**
		 * Drives the execution of a single process or sub-process: activates children, routes activity
		 * events, and rolls completion up to the owning Process or sub-process Activity.
		 * */
		constructor(parentActivity: Process | Activity, context: ContextInstance);
		id: string | undefined;
		type: string;
		isSubProcess: any;
		isTransaction: any;
		isAdHoc: any;
		broker: ElementBroker<Process> | ElementBroker<Activity>;
		environment: Environment;
		context: ContextInstance;
		/**
		 * Process exection id
		 * */
		executionId: string;
		/**
		 * Activate children and start the process execution. Resumes if the message is redelivered.
		 * @throws {Error} when message or executionId is missing
		 */
		execute(executeMessage: ElementBrokerMessage): true | void;
		/**
		 * Resume after recover, resuming any postponed children.
		 */
		resume(): void;
		/**
		 * Snapshot execution state including children, flows, message flows, and associations.
		 * */
		getState(): ProcessExecutionState;
		/**
		 * Restore execution state captured by getState.
		 * @param recoveredVersion State version
		 * */
		recover(state?: ProcessExecutionState, recoveredVersion?: number): this;
		/**
		 * Walk activity graph from the given start id, or every start activity when omitted.
		 * */
		shake(fromId?: string): ShakeResult;
		/**
		 * Stop the running process execution via the api.
		 */
		stop(): void;
		/**
		 * List currently postponed children as Api wrappers.
		 * 
		 */
		getPostponed(filterFn?: filterPostponed): IApi<Activity>[];
		/**
		 * Queue a discard message that propagates to all running children.
		 */
		discard(): void;
		/**
		 * Queue a cancel message that propagates to all running children.
		 */
		cancel(): void;
		/**
		 * Get child activities in the process scope.
		 * */
		getActivities(): Activity[];
		
		getActivityById(activityId: string): Activity;
		/**
		 * Get sequence flows in the process scope.
		 * */
		getSequenceFlows(): SequenceFlow;
		/**
		 * Get associations in the process scope.
		 * */
		getAssociations(): Association;
		/**
		 * Resolve a process or child Api for the given message.
		 * */
		getApi(message?: ElementBrokerMessage): IApi<Process>;
		/**
		 * List the process's start activities (isStart children) as their runtime instances.
		 * */
		getStartActivities(): Activity[];
		get stopped(): boolean;
		get completed(): boolean;
		get status(): ProcessStatus;
		get postponedCount(): number;
		get isRunning(): boolean;
		get activityStatus(): ActivityStatus;
	}
	/**
	 * Sequence flow connecting two activities. Owns its broker and publishes take/discard/looped
	 * events; activities subscribe to drive their inbound queue.
	 * */
		export class SequenceFlow {
		/**
		 * Sequence flow connecting two activities. Owns its broker and publishes take/discard/looped
		 * events; activities subscribe to drive their inbound queue.
		 * */
		constructor(flowDef: import("moddle-context-serializer").SequenceFlow, { environment }: ContextInstance);
		id: string | undefined;
		type: string;
		name: string | undefined;
		parent: ElementParent;
		
		behaviour: Record<string, any>;
		sourceId: string;
		targetId: string;
		isDefault: boolean | undefined;
		isSequenceFlow: boolean;
		environment: Environment;
		logger: ILogger;
		broker: import("smqp").Broker;
		on: any;
		once: any;
		waitFor: any;
		emitFatal: any;
		get counters(): {
			take: number;
			discard: number;
			looped: number;
		};
		/**
		 * Take the flow and publish flow.take.
		 * 
		 */
		take(content?: Record<string, any>): boolean;
		/**
		 * Discard the flow and publish flow.discard.
		 *
		 * @deprecated The execution runtime no longer discards sequence flows, so this is a no-op during a run. It will be removed in a future version.
		 * 
		 */
		discard(content?: Record<string, any>): void;
		/**
		 * Snapshot flow state. Returns undefined when the broker has no state and `disableTrackState`
		 * is set.
		 * */
		getState(): SequenceFlowState | undefined;
		/**
		 * Restore flow state captured by getState.
		 * */
		recover(state: SequenceFlowState): void;
		/**
		 * Resolve a Flow Api wrapper.
		 * */
		getApi(message?: ElementBrokerMessage): IApi<this>;
		/**
		 * Stop the flow's broker.
		 */
		stop(): void;
		/**
		 * Walk the flow as part of a process shake. Detects loops and publishes flow.shake.loop
		 * when the target was already visited, otherwise flow.shake.
		 * */
		shake(message: ElementBrokerMessage): number | undefined;
		/**
		 * Resolve the flow's condition (script or expression). Returns null when no condition is set.
		 * Emits a fatal error when the script language is missing or unsupported.
		 * */
		getCondition(): ICondition | null;
		/**
		 * Build a flow event message body, optionally merging override content.
		 * */
		createMessage(override?: Record<string, any>): ElementMessageContent;
		/**
		 * Evaluate the flow's condition for the source activity message. Default flows are always taken.
		 * @param fromMessage Source activity message
		 * @param callback Callback with truthy result if flow should be taken
		 */
		evaluate(fromMessage: ElementBrokerMessage, callback: (err: Error | null, result?: boolean | unknown) => void): void;
	}
	/**
	 * Enriches an element run message via async format start/end messages on the `format` exchange
	 * before the run message is continued. Handlers publish enrichment by responding to a start
	 * message with a matching end (or error) routing key.
	 * */
		class Formatter {
		/**
		 * Enriches an element run message via async format start/end messages on the `format` exchange
		 * before the run message is continued. Handlers publish enrichment by responding to a start
		 * message with a matching end (or error) routing key.
		 * */
		constructor(element: ElementBase);
		id: string;
		broker: import("smqp").Broker;
		logger: ILogger;
		/**
		 * Format the given run message. Callback fires with `(err, content, formatted)` once
		 * formatting completes; `formatted` is true when content was actually enriched.
		 * */
		format(message: ElementBrokerMessage, callback: (err: Error | null, content?: ElementMessageContent, formatted?: boolean) => void): void;
	}
	/**
	 * Association connecting a source and target activity. Used to drive compensation —
	 * activities marked `isForCompensation` subscribe to inbound association events.
	 * */
		export class Association {
		/**
		 * Association connecting a source and target activity. Used to drive compensation —
		 * activities marked `isForCompensation` subscribe to inbound association events.
		 * */
		constructor(associationDef: import("moddle-context-serializer").Association, { environment }: ContextInstance);
		id: string | undefined;
		type: string;
		name: string | undefined;
		parent: ElementParent;
		
		behaviour: Record<string, any>;
		sourceId: string;
		targetId: string;
		isAssociation: boolean;
		environment: Environment;
		logger: ILogger;
		broker: import("smqp").Broker;
		on: any;
		once: any;
		waitFor: any;
		get counters(): {
			take: number;
			discard: number;
		};
		/**
		 * Take the association and publish association.take.
		 * 
		 */
		take(content?: Record<string, any>): boolean;
		/**
		 * Discard the association and publish association.discard.
		 * 
		 */
		discard(content?: Record<string, any>): boolean;
		/**
		 * Snapshot association state. Returns undefined when broker has no state and
		 * `disableTrackState` is set.
		 * */
		getState(): AssociationState | undefined;
		/**
		 * Restore association state captured by getState.
		 * */
		recover(state: AssociationState): void;
		/**
		 * Resolve an association-scoped Api wrapper.
		 * */
		getApi(message?: ElementBrokerMessage): IApi<this>;
		/**
		 * Stop the association's broker.
		 */
		stop(): void;
	}
	/**
	 * Message flow connecting a source activity (or process) to a target. Subscribes to the
	 * source's `end` event and publishes `message.outbound` whenever the source completes,
	 * carrying any message payload through to the target.
	 * */
		export class MessageFlow {
		/**
		 * Message flow connecting a source activity (or process) to a target. Subscribes to the
		 * source's `end` event and publishes `message.outbound` whenever the source completes,
		 * carrying any message payload through to the target.
		 * */
		constructor(flowDef: import("moddle-context-serializer").MessageFlow, context: ContextInstance);
		id: string | undefined;
		type: string;
		name: string | undefined;
		parent: ElementParent;
		source: import("moddle-context-serializer").MessageFlowEndpoint;
		target: import("moddle-context-serializer").MessageFlowEndpoint;
		
		behaviour: Record<string, any>;
		environment: Environment;
		context: ContextInstance;
		broker: ElementBroker<MessageFlow>;
		on: (eventName: string, callback: CallableFunction, eventOptions?: {
			once?: boolean;
			[x: string]: any;
		}) => import("smqp").Consumer;
		once: (eventName: string, callback: CallableFunction, eventOptions?: {
			[x: string]: any;
		}) => import("smqp").Consumer;
		emit: (eventName: string, content?: Record<string, any>, props?: any) => void;
		waitFor: (eventName: string, onMessage?: ((routingKey: string, message: ElementBrokerMessage, owner: MessageFlow) => boolean) | undefined) => Promise<IApi<MessageFlow>>;
		logger: ILogger;
		get counters(): {
			messages: number;
		};
		/**
		 * Snapshot message-flow state. Returns undefined when broker has no state and
		 * `disableTrackState` is set.
		 * */
		getState(): MessageFlowState | undefined;
		/**
		 * Restore message-flow state captured by getState.
		 * */
		recover(state: MessageFlowState): void;
		/**
		 * Resolve a message-scoped Api wrapper.
		 * */
		getApi(message?: ElementBrokerMessage): IApi<this>;
		/**
		 * Subscribe to the source element's message and end events to bridge the message across.
		 */
		activate(): void;
		/**
		 * Cancel the source element subscriptions added by activate.
		 */
		deactivate(): void;
	}
	/**
	 * Boundary event
	 * */
	export function BoundaryEvent(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Boundary event behaviour
	 * */
		export class BoundaryEventBehaviour {
		/**
		 * Boundary event behaviour
		 * */
		constructor(activity: Activity);
		id: string | undefined;
		type: string;
		attachedTo: Activity | null;
		activity: Activity;
		environment: Environment;
		broker: ElementBroker<Activity>;
		get executionId(): string | undefined;
		get cancelActivity(): boolean;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * End event
	 * */
	export function EndEvent(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * End event behaviour
	 * */
		export class EndEventBehaviour {
		/**
		 * End event behaviour
		 * */
		constructor(activity: Activity);
		id: string | undefined;
		type: string;
		broker: ElementBroker<Activity>;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Intermediate catch event
	 * */
	export function IntermediateCatchEvent(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Intermediate catch event behaviour
	 * */
		export class IntermediateCatchEventBehaviour {
		/**
		 * Intermediate catch event behaviour
		 * */
		constructor(activity: Activity);
		id: string | undefined;
		type: string;
		broker: ElementBroker<Activity>;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Intermediate throw event
	 * */
	export function IntermediateThrowEvent(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Intermediate throw event behaviour
	 * */
		export class IntermediateThrowEventBehaviour {
		/**
		 * Intermediate throw event behaviour
		 * */
		constructor(activity: Activity);
		id: string | undefined;
		type: string;
		broker: ElementBroker<Activity>;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Start event
	 * */
	export function StartEvent(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Start event behaviour
	 * */
		export class StartEventBehaviour {
		/**
		 * Start event behaviour
		 * */
		constructor(activity: Activity);
		id: string | undefined;
		type: string;
		activity: Activity;
		broker: ElementBroker<Activity>;
		get executionId(): string | undefined;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Event based gateway
	 * */
	export function EventBasedGateway(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Event based gateway behaviour
	 * */
		export class EventBasedGatewayBehaviour {
		/**
		 * Event based gateway behaviour
		 * */
		constructor(activity: Activity, context: ContextInstance);
		id: string | undefined;
		type: string;
		activity: Activity;
		broker: ElementBroker<Activity>;
		context: ContextInstance;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Exclusive gateway
	 * */
	export function ExclusiveGateway(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Exclusive gateway behaviour
	 * */
		export class ExclusiveGatewayBehaviour {
		/**
		 * Exclusive gateway behaviour
		 * */
		constructor(activity: Activity);
		id: string | undefined;
		type: string;
		broker: ElementBroker<Activity>;
		
		execute({ content }: ElementBrokerMessage): void;
	}
	/**
	 * Inclusive gateway
	 * */
	export function InclusiveGateway(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Inclusive gateway behaviour
	 * */
		export class InclusiveGatewayBehaviour {
		/**
		 * Inclusive gateway behaviour
		 * */
		constructor(activity: Activity);
		id: string | undefined;
		type: string;
		broker: ElementBroker<Activity>;
		
		execute({ content }: ElementBrokerMessage): void;
	}
	/**
	 * Parallel gateway
	 * */
		export class ParallelGateway {
		/**
		 * Parallel gateway
		 * */
		constructor(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance);
		id: string | undefined;
	}
	/**
	 * Parallel gateway behaviour
	 * */
		export class ParallelGatewayBehaviour {
		/**
		 * Parallel gateway behaviour
		 * */
		constructor(activity: Activity);
		id: string | undefined;
		type: string;
		activity: Activity;
		broker: ElementBroker<Activity>;
		/**
		 * Inbound taken sequence flow sequences
		 * */
		inbound: Set<ElementMessageContent>;
		get executionId(): string | undefined;
		
		execute(executeMessage: ElementBrokerMessage): void;
		/**
		 * Setup peer monitor
		 * */
		setup(executeMessage: ElementBrokerMessage): void;
		peerMonitor: PeerMonitor | undefined;
	}
	/**
	 * Peer monitor
	 * @param activity parallel gateway activity
	 * @param targets parallel gateway peer target activities
	 */
		class PeerMonitor {
		/**
		 * Peer monitor
		 * @param activity parallel gateway activity
		 * @param targets parallel gateway peer target activities
		 */
		constructor(activity: Activity, targets: Map<string, Activity>);
		activity: Activity;
		id: string | undefined;
		broker: ElementBroker<Activity>;
		running: Map<any, any>;
		watching: Map<any, any>;
		targets: Map<string, Activity>;
		inbound: any[];
		get isRunning(): boolean;
		/**
		 * Execute peer monitor
		 * @returns number of running peers
		 */
		execute(executeMessage: ElementBrokerMessage): number;
		/**
		 * Monitor peer activity
		 * */
		monitor(peerActivity: Activity): void;
		stop(): void;
	}
	/**
	 * Transaction
	 * */
	export function Transaction(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Ad-hoc sub process
	 * */
	export function AdHocSubProcess(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Ad-hoc sub process behaviour. Reuses {@link SubProcessBehaviour} for execution and adds
	 * ad-hoc policy — inner-activity ordering, completion condition and cancellation of remaining
	 * instances. It subscribes to the sub process event topic and arms/cancels inner activities
	 * through public API only, so it can be subclassed or replaced without execution internals.
	 */
	export class AdHocSubProcessBehaviour extends SubProcessBehaviour {
		sequential: boolean;
		cancelRemaining: boolean;
		completionCondition: any;
		/**
		 * Arm the inner start activities of the given execution — all in parallel, or the first when
		 * sequential. Override to customise ad-hoc ordering.
		 * 
		 */
		startInner(execution?: ProcessExecution): void;
		/**
		 * Sequential ordering: arm the next not-yet-run inner start activity. Returns whether one was armed.
		 * */
		armNext(execution?: ProcessExecution): boolean;
		/**
		 * Evaluate the completion condition against the inner activity that just left. Override to
		 * customise ad-hoc completion.
		 * */
		completionMet(message: ElementBrokerMessage, execution: ProcessExecution): boolean;
	}
	/**
	 * Call activity
	 * */
	export function CallActivity(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Call activity behaviour
	 * */
		export class CallActivityBehaviour {
		/**
		 * Call activity behaviour
		 * */
		constructor(activity: Activity);
		id: string | undefined;
		type: string;
		calledElement: any;
		
		loopCharacteristics: MultiInstanceLoopCharacteristics | undefined;
		activity: Activity;
		broker: ElementBroker<Activity>;
		environment: Environment;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Receive task
	 * */
	export function ReceiveTask(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Receive task behaviour
	 * */
		export class ReceiveTaskBehaviour {
		/**
		 * Receive task behaviour
		 * */
		constructor(activity: Activity);
		id: string | undefined;
		type: string;
		
		reference: EventReference;
		
		loopCharacteristics: MultiInstanceLoopCharacteristics | undefined;
		activity: Activity;
		broker: ElementBroker<Activity>;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Script task
	 * */
	export function ScriptTask(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Script task behaviour
	 * */
		export class ScriptTaskBehaviour {
		/**
		 * Script task behaviour
		 * */
		constructor(activity: Activity);
		id: string | undefined;
		type: string;
		scriptFormat: string | undefined;
		
		loopCharacteristics: MultiInstanceLoopCharacteristics | undefined;
		activity: Activity;
		environment: Environment;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Service task
	 * */
	export function ServiceTask(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Service task behaviour
	 * */
		export class ServiceTaskBehaviour {
		/**
		 * Service task behaviour
		 * */
		constructor(activity: Activity);
		id: string | undefined;
		type: string;
		
		loopCharacteristics: MultiInstanceLoopCharacteristics | undefined;
		activity: Activity;
		environment: Environment;
		broker: ElementBroker<Activity>;
		/**
		 * Service function instance
		 * */
		service: IService | undefined;
		
		execute(executeMessage: ElementBrokerMessage): void;
		/**
		 * Resolve the service instance backing this run.
		 * */
		getService(message: ElementBrokerMessage): IService | undefined;
	}
	/**
	 * Signal task
	 * */
	export function SignalTask(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Signal task behaviour
	 * */
		export class SignalTaskBehaviour {
		/**
		 * Signal task behaviour
		 * */
		constructor(activity: Activity);
		id: string | undefined;
		type: string;
		
		loopCharacteristics: MultiInstanceLoopCharacteristics | undefined;
		activity: Activity;
		broker: ElementBroker<Activity>;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Sub process
	 * @param Behaviour behaviour class, defaults to {@link SubProcessBehaviour}
	 */
	export function SubProcess(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance, Behaviour?: CallableFunction): Activity;
	/**
	 * Sub process behaviour
	 * */
		export class SubProcessBehaviour {
		/**
		 * Sub process behaviour
		 * */
		constructor(activity: Activity, context: ContextInstance);
		id: string | undefined;
		type: string;
		
		loopCharacteristics: MultiInstanceLoopCharacteristics | undefined;
		activity: Activity;
		context: ContextInstance;
		environment: Environment;
		broker: ElementBroker<Activity>;
		executionId: string | undefined;
		get execution(): ProcessExecution | undefined;
		get executions(): ProcessExecution[];
		
		execute(executeMessage: ElementBrokerMessage): void;
		/**
		 * Get SubProcess state
		 * */
		getState(): ProcessExecutionState[];
		/**
		 * Recover SubProcess
		 * 
		 */
		recover(state?: ProcessExecutionState[]): void;
		
		getPostponed(): ReturnType<ProcessExecution["getPostponed"]>;
		
		getApi(apiMessage: ElementBrokerMessage): IApi<this> | undefined;
	}
	/**
	 * Task
	 * */
	export function Task(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Task behaviour
	 * */
		export class TaskBehaviour {
		/**
		 * Task behaviour
		 * */
		constructor(activity: Activity);
		id: string | undefined;
		type: string;
		
		loopCharacteristics: MultiInstanceLoopCharacteristics | undefined;
		broker: ElementBroker<Activity>;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Cancel event definition
	 * */
		export class CancelEventDefinition {
		/**
		 * Cancel event definition
		 * */
		constructor(activity: Activity, eventDefinition: import("moddle-context-serializer").EventDefinition);
		id: string | undefined;
		type: string | undefined;
		
		reference: EventReference;
		isThrowing: boolean;
		activity: Activity;
		environment: Environment;
		broker: ElementBroker<Activity>;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): void;
		
		executeCatch(executeMessage: ElementBrokerMessage): void;
		
		executeThrow(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Compensate event definition
	 * */
		export class CompensateEventDefinition {
		/**
		 * Compensate event definition
		 * */
		constructor(activity: Activity, eventDefinition: import("moddle-context-serializer").EventDefinition, context: ContextInstance);
		id: string | undefined;
		type: string | undefined;
		
		reference: EventReference;
		isThrowing: boolean;
		activity: Activity;
		broker: ElementBroker<Activity>;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): void;
		
		executeCatch(executeMessage: ElementBrokerMessage): void;
		
		executeThrow(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Conditional event definition
	 * @param index event definition index
	 */
		export class ConditionalEventDefinition {
		/**
		 * Conditional event definition
		 * @param index event definition index
		 */
		constructor(activity: Activity, eventDefinition: import("moddle-context-serializer").EventDefinition, _context: ContextInstance, index: number);
		id: string | undefined;
		type: string;
		behaviour: {};
		activity: Activity;
		environment: Environment;
		broker: ElementBroker<Activity>;
		logger: ILogger;
		condition: ICondition | null;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): void;
		/**
		 * Evaluate condition
		 * */
		evaluate(message: ElementBrokerMessage, callback: CallableFunction): void;
		/**
		 * Handle evaluate result or error
		 * @param err Condition evaluation error
		 * @param result Result from evaluated condition, completes execution if truthy
		 * */
		evaluateCallback(err: Error | null, result: any): void;
		/**
		 * Get condition
		 * @param index Eventdefinition sequence number, used to name registered script
		 * */
		getCondition(index: number): ICondition | null;
	}
	/**
	 * Error event definition
	 * */
		export class ErrorEventDefinition {
		/**
		 * Error event definition
		 * */
		constructor(activity: Activity, eventDefinition: import("moddle-context-serializer").EventDefinition);
		id: string | undefined;
		type: string;
		
		reference: EventReference;
		isThrowing: boolean;
		activity: Activity;
		environment: Environment;
		broker: ElementBroker<Activity>;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): void;
		
		executeCatch(executeMessage: ElementBrokerMessage): void;
		
		executeThrow(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Escalation event definition
	 * */
		export class EscalationEventDefinition {
		/**
		 * Escalation event definition
		 * */
		constructor(activity: Activity, eventDefinition: import("moddle-context-serializer").EventDefinition);
		id: string | undefined;
		type: string | undefined;
		
		reference: EventReference;
		isThrowing: boolean;
		activity: Activity;
		broker: ElementBroker<Activity>;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): void;
		
		executeCatch(executeMessage: ElementBrokerMessage): void;
		
		executeThrow(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Link event definition
	 * */
		export class LinkEventDefinition {
		/**
		 * Link event definition
		 * */
		constructor(activity: Activity, eventDefinition: import("moddle-context-serializer").EventDefinition);
		id: string | undefined;
		type: string;
		
		reference: EventReference;
		isThrowing: boolean;
		activity: Activity;
		broker: ElementBroker<Activity>;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): void;
		
		executeCatch(executeMessage: ElementBrokerMessage): void;
		
		executeThrow(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Message event definition
	 * */
		export class MessageEventDefinition {
		/**
		 * Message event definition
		 * */
		constructor(activity: Activity, eventDefinition: import("moddle-context-serializer").EventDefinition);
		id: string | undefined;
		type: string;
		
		reference: EventReference;
		isThrowing: boolean;
		activity: Activity;
		broker: ElementBroker<Activity>;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): void;
		
		executeCatch(executeMessage: ElementBrokerMessage): void;
		
		executeThrow(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Signal event definition
	 * */
		export class SignalEventDefinition {
		/**
		 * Signal event definition
		 * */
		constructor(activity: Activity, eventDefinition: import("moddle-context-serializer").EventDefinition);
		id: string | undefined;
		type: string | undefined;
		
		reference: EventReference;
		isThrowing: boolean;
		activity: Activity;
		broker: ElementBroker<Activity>;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): void;
		
		executeCatch(executeMessage: ElementBrokerMessage): void;
		
		executeThrow(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Terminate event definition
	 * */
		export class TerminateEventDefinition {
		/**
		 * Terminate event definition
		 * */
		constructor(activity: Activity, eventDefinition: import("moddle-context-serializer").EventDefinition);
		id: string | undefined;
		type: string;
		activity: Activity;
		broker: ElementBroker<Activity>;
		logger: ILogger;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Timer event definition
	 * */
		export class TimerEventDefinition {
		/**
		 * Timer event definition
		 * */
		constructor(activity: Activity, eventDefinition: import("moddle-context-serializer").EventDefinition);
		type: string;
		activity: Activity;
		environment: Environment;
		eventDefinition: import("moddle-context-serializer").EventDefinition;
		timeDuration: string | undefined;
		timeCycle: string | undefined;
		timeDate: string | undefined;
		broker: ElementBroker<Activity>;
		logger: ILogger;
		get executionId(): string;
		get stopped(): boolean;
		get timer(): Timer | null;
		
		execute(executeMessage: ElementBrokerMessage): void;
		startedAt: Date | undefined;
		stop(): void;
		/**
		 * Parse timer
		 * */
		parse(timerType: TimerType, value: string): parsedTimer;
	}

	export { Consumer, MessageFields, MessageProperties, SerializableContext, SerializableElement };
	export const BusinessRuleTask: typeof ServiceTask;
	export const SendTask: typeof ServiceTask;
	export const ManualTask: typeof SignalTask;
	export const UserTask: typeof SignalTask;
	export const TextAnnotation: typeof Dummy;
	export const Group: typeof Dummy;
	export const Category: typeof Dummy;
}

declare module 'bpmn-elements/errors' {
	import type { MessageEnvelope } from 'smqp';
	import type { ElementBrokerMessage, ElementMessageContent, ElementParent } from 'bpmn-elements';
	import { ActivityError, RunError } from 'bpmn-elements';
	export { ActivityError, RunError };

	/**
	 * Get an Error from an error message.
	 * */
	export function makeErrorFromMessage(errorMessage: ElementBrokerMessage): Error | ActivityError | RunError | BpmnError;
	export class BpmnError extends Error {
		
		constructor(description: string, behaviour?: {
			id?: string;
			name?: string;
			errorCode?: string | number;
			code?: string;
		}, sourceMessage?: ElementBrokerMessage);
		
		type: string;
		
		description: string;
		
		code: string | undefined;
		
		id: string | undefined;
		
		source: Pick<ElementBrokerMessage, "fields" | "content" | "properties"> | undefined;
	}

	export {};
}


declare module 'bpmn-elements/events' {
	export { BoundaryEvent, BoundaryEventBehaviour, EndEvent, EndEventBehaviour, IntermediateCatchEvent, IntermediateCatchEventBehaviour, IntermediateThrowEvent, IntermediateThrowEventBehaviour, StartEvent, StartEventBehaviour } from 'bpmn-elements';
}

declare module 'bpmn-elements/eventDefinitions' {
	export { CancelEventDefinition, CompensateEventDefinition, ConditionalEventDefinition, ErrorEventDefinition, EscalationEventDefinition, LinkEventDefinition, MessageEventDefinition, SignalEventDefinition, TerminateEventDefinition, TimerEventDefinition } from 'bpmn-elements';
}

declare module 'bpmn-elements/flows' {
	export { Association, MessageFlow, SequenceFlow } from 'bpmn-elements';
}

declare module 'bpmn-elements/gateways' {
	export { EventBasedGateway, EventBasedGatewayBehaviour, ExclusiveGateway, ExclusiveGatewayBehaviour, InclusiveGateway, InclusiveGatewayBehaviour, ParallelGateway, ParallelGatewayBehaviour } from 'bpmn-elements';
}

declare module 'bpmn-elements/tasks' {
	export { AdHocSubProcess, AdHocSubProcessBehaviour, CallActivity, CallActivityBehaviour, ReceiveTask, ReceiveTaskBehaviour, ScriptTask, ScriptTaskBehaviour, ServiceTask, ServiceTaskBehaviour, SignalTask, SignalTaskBehaviour, SubProcess, SubProcessBehaviour, Task, TaskBehaviour, Transaction } from 'bpmn-elements';
}
