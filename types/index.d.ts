declare module 'bpmn-elements' {
	import type { Broker, BrokerState, Consumer, MessageEnvelope, MessageFields, MessageProperties } from 'smqp';
	import type { SerializableContext, SerializableElement } from 'moddle-context-serializer';
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

  export class Element<T> extends ElementBase {
	get broker(): ElementBroker<T>;
	stop(): void;
	resume(): void;
	getApi(message?: ElementBrokerMessage): IApi<T>;
	on(eventName: string, callback: CallableFunction, options?: any): any;
	once(eventName: string, callback: CallableFunction, options?: any): any;
	waitFor(eventName: string, options?: any): Promise<IApi<T>>;
  }

  export class MessageElement {
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

  export interface EventDefinitionReference {
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
	get reference(): EventDefinitionReference;
	[x: string]: any;
	execute(executeMessage: ElementBrokerMessage): void;
  }

  export enum TimerType {
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

  export enum DefinitionRunStatus {
	Entered = 'entered',
	Start = 'start',
	Executing = 'executing',
	End = 'end',
	Discarded = 'discarded',
  }

  export enum ProcessRunStatus {
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
  export enum ActivityStatus {
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
  export enum ActivityRunStatus {
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
	register(activity: Activity): Script | undefined;
	getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
  }

  export interface Script {
	execute(executionContext: ExecutionScope, callback: CallableFunction): void;
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
		behaviour: {
			eventDefinitions: any;
		};
		Behaviour: IActivityBehaviour;
		
		parent: import("moddle-context-serializer").Parent;
		
		logger: ILogger;
		environment: Environment;
		context: ContextInstance;
		
		status: ActivityRunStatus;
		broker: import("smqp").Broker;
		on: (eventName: string, callback: CallableFunction, eventOptions?: {
			once?: boolean;
			[x: string]: any;
		}) => import("smqp").Consumer;
		once: (eventName: string, callback: CallableFunction, eventOptions?: {
			[x: string]: any;
		}) => import("smqp").Consumer;
		waitFor: (eventName: string, onMessage?: (routingKey: string, message: ElementBrokerMessage, owner: any) => boolean) => Promise<any>;
		emitFatal: (error: Error, content?: Record<string, any>) => void;
		/**
		 * Subscribe to inbound flows and start consuming the inbound queue.
		 * */
		activate(): void;
		/**
		 * Cancel inbound subscriptions and any pending run/format consumers.
		 */
		deactivate(): void;
		/**
		 * Initialise activity executionId and emit init event without starting the run.
		 * @param initContent Optional content merged into the init message
		 */
		init(initContent?: Record<string, any>): void;
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
		 * Discard the activity. Stops execution if running and discards outbound flows.
		 * @param discardContent Optional content propagated with the discard
		 */
		discard(discardContent?: Record<string, any>): any;
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
		broker: import("smqp").Broker;
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
		resolve: (executionMessage: ElementBrokerMessage, error?: Error) => {
			id?: string;
			type?: string;
			messageType: string;
			name: string;
			code: string | undefined;
			inner?: Error;
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
	 */
		export class ContextInstance {
		/**
		 * Per-execution registry that lazily upserts activities, flows, and processes from the parsed BPMN definition.
		 * @param owner Process or sub-process activity that owns this context
		 */
		constructor(definitionContext: import("moddle-context-serializer").SerializableContext, environment: Environment, owner?: Process | Activity);
		id: string;
		name: string;
		type: string;
		/** Unique instance id */
		sid: string;
		definitionContext: import("moddle-context-serializer").SerializableContext;
		environment: Environment;
		
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
		id: string | undefined;
		
		type: string;
		name: string | undefined;
		
		environment: Environment;
		context: ContextInstance | undefined;
		
		broker: import("smqp").Broker;
		on: ((eventName: string, callback: CallableFunction, eventOptions?: {
			once?: boolean;
			[x: string]: any;
		}) => import("smqp").Consumer) | undefined;
		once: ((eventName: string, callback: CallableFunction, eventOptions?: {
			[x: string]: any;
		}) => import("smqp").Consumer) | undefined;
		waitFor: ((eventName: string, onMessage?: (routingKey: string, message: ElementBrokerMessage, owner: any) => boolean) => Promise<any>) | undefined;
		emit: ((eventName: string, content?: Record<string, any>, props?: any) => void) | undefined;
		emitFatal: ((error: Error, content?: Record<string, any>) => void) | undefined;
		
		logger: ILogger;
		/**
		 * Start running the definition. Accepts run options, a callback, or both.
		 * The callback fires once on leave, stop, or error.
		 * @throws {Error} when already running and no callback is supplied
		 */
		run(optionsOrCallback?: Record<string, any> | runCallback, optionalCallback?: runCallback): this;
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
		 * 
		 */
		getPostponed(...args: any[]): never[] | IApi<Activity>;
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
		get status(): string | undefined;
		get stopped(): boolean;
		get activityStatus(): string;
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
		id: string | undefined;
		type: string;
		broker: import("smqp").Broker;
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
		 * */
		recover(state?: DefinitionExecutionState): this;
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
		getPostponed(...args: any[]): IApi<Activity>;
		get stopped(): boolean;
		get completed(): boolean;
		get status(): string;
		get processes(): Process[];
		get postponedCount(): number;
		get isRunning(): boolean;
		get activityStatus(): string;
	}
	/**
	 * Placeholder activity for non-executable elements (text annotations, groups, categories).
	 * */
	export function Category(activityDef: import("moddle-context-serializer").Activity): {
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
		set services(value: Record<string, CallableFunction>);
		get services(): Record<string, CallableFunction>;
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
		getServiceByName(serviceName: string): CallableFunction;
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
		addService(name: string, fn: CallableFunction): void;
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
		
		read(broker: import("smqp").Broker, exchange: string, routingKeyPrefix: string, messageProperties?: Record<string, any>): number | undefined;
		
		write(broker: import("smqp").Broker, exchange: string, routingKeyPrefix: string, value: any, messageProperties?: Record<string, any>): number | undefined;
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
		
		read(broker: import("smqp").Broker, exchange: string, routingKeyPrefix: string, messageProperties?: Record<string, any>): number | undefined;
		
		write(broker: import("smqp").Broker, exchange: string, routingKeyPrefix: string, value: any, messageProperties?: Record<string, any>): number | undefined;
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
		
		read(broker: import("smqp").Broker, exchange: string, routingKeyPrefix: string, messageProperties?: Record<string, any>): number | undefined;
		
		write(broker: import("smqp").Broker, exchange: string, routingKeyPrefix: string, value: any, messageProperties?: Record<string, any>): number | undefined;
	}
	export function Escalation(signalDef: any, context: any): {
		id: any;
		type: any;
		name: any;
		parent: any;
		resolve: (executionMessage: any) => {
			id: any;
			type: any;
			messageType: string;
			name: any;
			parent: any;
		};
	};
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
		broker: import("smqp").Broker;
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
		broker: import("smqp").Broker;
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
		broker: import("smqp").Broker;
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
	export function Message(messageDef: any, context: any): {
		id: any;
		type: any;
		name: any;
		parent: any;
		resolve: (executionMessage: any) => any;
	};
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
		broker: import("smqp").Broker;
		on: (eventName: string, callback: CallableFunction, eventOptions?: {
			once?: boolean;
			[x: string]: any;
		}) => import("smqp").Consumer;
		once: (eventName: string, callback: CallableFunction, eventOptions?: {
			[x: string]: any;
		}) => import("smqp").Consumer;
		waitFor: (eventName: string, onMessage?: (routingKey: string, message: ElementBrokerMessage, owner: any) => boolean) => Promise<any>;
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
		 * @throws {Error} when called on a running process
		 */
		recover(state?: ProcessState): this;
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
		 * 
		 */
		getPostponed(...args: any[]): IApi<Activity>[];
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
		get status(): string | undefined;
		get activityStatus(): string;
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
		broker: import("smqp").Broker;
		
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
	export function Signal(signalDef: any, context: any): {
		id: any;
		type: any;
		name: any;
		parent: any;
		resolve: (executionMessage: any) => any;
	};
	/**
	 * Standard loop characteristics
	 * */
	export function StandardLoopCharacteristics(activity: Activity, loopCharacteristics: import("moddle-context-serializer").SerializableElement): MultiInstanceLoopCharacteristics;
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
		broker: import("smqp").Broker;
		environment: Environment;
		context: ContextInstance;
		executionId: string | undefined;
		/**
		 * Activate children and start the process execution. Resumes if the message is redelivered.
		 * @throws {Error} when message or executionId is missing
		 */
		execute(executeMessage: ElementBrokerMessage): true | void;
		/**
		 * Resume after recover. Reshakes elements when there are converging gateways or multiple
		 * start activities, then resumes any postponed children.
		 */
		resume(): void;
		/**
		 * Snapshot execution state including children, flows, message flows, and associations.
		 * */
		getState(): ProcessExecutionState;
		/**
		 * Restore execution state captured by getState.
		 * */
		recover(state?: ProcessExecutionState): this;
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
		get stopped(): boolean;
		get completed(): boolean;
		get status(): string;
		get postponedCount(): number;
		get isRunning(): boolean;
		get activityStatus(): string;
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
		on: (eventName: string, callback: CallableFunction, eventOptions?: {
			once?: boolean;
			[x: string]: any;
		}) => import("smqp").Consumer;
		once: (eventName: string, callback: CallableFunction, eventOptions?: {
			[x: string]: any;
		}) => import("smqp").Consumer;
		waitFor: (eventName: string, onMessage?: (routingKey: string, message: ElementBrokerMessage, owner: any) => boolean) => Promise<any>;
		emitFatal: (error: Error, content?: Record<string, any>) => void;
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
		 * Discard the flow and publish flow.discard. Detects loops via discardSequence and emits
		 * flow.looped instead when the target id is already in the sequence.
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
		getCondition(): ISequenceFlowCondition | null;
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
		on: (eventName: string, callback: CallableFunction, eventOptions?: {
			once?: boolean;
			[x: string]: any;
		}) => import("smqp").Consumer;
		once: (eventName: string, callback: CallableFunction, eventOptions?: {
			[x: string]: any;
		}) => import("smqp").Consumer;
		waitFor: (eventName: string, onMessage?: (routingKey: string, message: ElementBrokerMessage, owner: any) => boolean) => Promise<any>;
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
		broker: import("smqp").Broker;
		on: (eventName: string, callback: CallableFunction, eventOptions?: {
			once?: boolean;
			[x: string]: any;
		}) => import("smqp").Consumer;
		once: (eventName: string, callback: CallableFunction, eventOptions?: {
			[x: string]: any;
		}) => import("smqp").Consumer;
		emit: (eventName: string, content?: Record<string, any>, props?: any) => void;
		waitFor: (eventName: string, onMessage?: (routingKey: string, message: ElementBrokerMessage, owner: any) => boolean) => Promise<any>;
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
	 * End event
	 * */
	export function EndEvent(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Intermediate catch event
	 * */
	export function IntermediateCatchEvent(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Intermediate throw event
	 * */
	export function IntermediateThrowEvent(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Start event
	 * */
	export function StartEvent(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Event based gateway
	 * */
	export function EventBasedGateway(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Exclusive gateway
	 * */
	export function ExclusiveGateway(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Inclusive gateway
	 * */
	export function InclusiveGateway(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
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
	 * Call activity
	 * */
	export function CallActivity(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Receive task
	 * */
	export function ReceiveTask(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Script task
	 * */
	export function ScriptTask(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Service task
	 * */
	export function SendTask(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Signal task
	 * */
	export function UserTask(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Sub process
	 * */
	export function AdHocSubProcess(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Task
	 * */
	export function Task(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Transaction
	 * */
	export function Transaction(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
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
		
		reference: EventDefinitionReference;
		isThrowing: boolean;
		activity: Activity;
		environment: Environment;
		broker: import("smqp").Broker;
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
		
		reference: EventDefinitionReference;
		isThrowing: boolean;
		activity: Activity;
		broker: import("smqp").Broker;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): number | import("smqp").Consumer | undefined;
		
		executeCatch(executeMessage: ElementBrokerMessage): import("smqp").Consumer | undefined;
		
		executeThrow(executeMessage: ElementBrokerMessage): number | undefined;
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
		broker: import("smqp").Broker;
		logger: ILogger;
		condition: ScriptCondition | ExpressionCondition | null;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): void;
		/**
		 * Evaluate condition
		 * */
		evaluate(message: ElementBrokerMessage, callback: CallableFunction): any;
		/**
		 * Handle evaluate result or error
		 * @param err Condition evaluation error
		 * @param result Result from evaluated condition, completes execution if truthy
		 */
		evaluateCallback(err: Error | null, result: any): number | undefined;
		/**
		 * Get condition
		 * @param index Eventdefinition sequence number, used to name registered script
		 * */
		getCondition(index: number): ExpressionCondition | ScriptCondition | null;
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
		
		reference: EventDefinitionReference;
		isThrowing: boolean;
		activity: Activity;
		environment: Environment;
		broker: import("smqp").Broker;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): number | void;
		
		executeCatch(executeMessage: ElementBrokerMessage): void;
		
		executeThrow(executeMessage: ElementBrokerMessage): number | undefined;
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
		
		reference: EventDefinitionReference;
		isThrowing: boolean;
		activity: Activity;
		broker: import("smqp").Broker;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): number | void;
		
		executeCatch(executeMessage: ElementBrokerMessage): void;
		
		executeThrow(executeMessage: ElementBrokerMessage): number | undefined;
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
		
		reference: EventDefinitionReference;
		isThrowing: boolean;
		activity: Activity;
		broker: import("smqp").Broker;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): number | undefined;
		
		executeCatch(executeMessage: ElementBrokerMessage): number | undefined;
		
		executeThrow(executeMessage: ElementBrokerMessage): number | undefined;
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
		
		reference: EventDefinitionReference;
		isThrowing: boolean;
		activity: Activity;
		broker: import("smqp").Broker;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): number | void;
		
		executeCatch(executeMessage: ElementBrokerMessage): void;
		
		executeThrow(executeMessage: ElementBrokerMessage): number | undefined;
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
		
		reference: EventDefinitionReference;
		isThrowing: boolean;
		activity: Activity;
		broker: import("smqp").Broker;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): number | void;
		
		executeCatch(executeMessage: ElementBrokerMessage): void;
		
		executeThrow(executeMessage: ElementBrokerMessage): number | undefined;
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
		broker: import("smqp").Broker;
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
		broker: import("smqp").Broker;
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
		parse(timerType: string, value: string): {
			expireAt: Date | undefined;
			repeat: number | undefined;
			delay: number | undefined;
		};
	}
	/**
	 * Script condition
	 * */
		class ScriptCondition {
		/**
		 * Script condition
		 * */
		constructor(owner: ElementBase, script: any, language: string);
		type: string;
		language: string;
		/**
		 * Execute
		 * */
		execute(message: any, callback: CallableFunction): any;
	}
	/**
	 * Expression condition
	 * */
		class ExpressionCondition {
		/**
		 * Expression condition
		 * */
		constructor(owner: ElementBase, expression: string);
		type: string;
		expression: string;
		/**
		 * Execute
		 * */
		execute(message: ElementBrokerMessage, callback: CallableFunction): any;
	}

	export { Consumer, MessageFields, MessageProperties, SerializableContext, SerializableElement };
}

declare module 'bpmn-elements/errors' {
	import type { MessageEnvelope } from 'smqp';
	import type { ElementBrokerMessage, ElementMessageContent, ElementParent } from 'bpmn-elements';

	/**
	 * Get an Error from an error message.
	 * */
	export function makeErrorFromMessage(errorMessage: ElementBrokerMessage): Error | ActivityError | RunError | BpmnError;
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
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableElement } from 'moddle-context-serializer';
	import type { Activity, ActivityError, ActivityExecution, ActivityExecutionState, ActivityRunStatus, ActivityState, Association, AssociationState, ContextInstance, ElementBase, ElementBroker, ElementBrokerMessage, ElementMessageContent, ElementParent, ElementState, Environment, EnvironmentOptions, EnvironmentSettings, EnvironmentState, EventDefinition, EventDefinitionReference, ExecutionScope, Extension, IActivityBehaviour, IApi, IExpressions, IExtension, IExtensions, IExtensionsMapper, IIOData, ILogger, IScripts, ISequenceFlowCondition, ITimers, Lane, LoggerFactory, MessageFlow, MessageFlowState, Process, ProcessExecutionState, ProcessState, RegisteredTimer, Script, SequenceFlow, SequenceFlowState, ShakeResult, ShakeSequenceItem, ShakenSequence, Timer, completedCounters, filterPostponed, signalMessage, startActivityFilterOptions, wrappedClearTimeout, wrappedSetTimeout } from 'bpmn-elements';

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
		broker: import("smqp").Broker;
		get executionId(): string | undefined;
		get cancelActivity(): unknown;
		
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
		broker: import("smqp").Broker;
		
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
		broker: import("smqp").Broker;
		
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
		broker: import("smqp").Broker;
		
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
		broker: import("smqp").Broker;
		get executionId(): string | undefined;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Event definition execution orchestrator. Drives a sequence of event definitions for the
	 * activity and publishes the completed routing key when the last definition completes.
	 * @param completedRoutingKey Routing key to publish on completion, defaults to `execute.completed`
	 */
		class EventDefinitionExecution {
		/**
		 * Event definition execution orchestrator. Drives a sequence of event definitions for the
		 * activity and publishes the completed routing key when the last definition completes.
		 * @param completedRoutingKey Routing key to publish on completion, defaults to `execute.completed`
		 */
		constructor(activity: Activity, eventDefinitions: EventDefinition[], completedRoutingKey?: string);
		id: string | undefined;
		activity: Activity;
		broker: import("smqp").Broker;
		eventDefinitions: EventDefinition[];
		completedRoutingKey: string;
		get completed(): boolean;
		get stopped(): boolean;
		
		execute(executeMessage: ElementBrokerMessage): void;
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
		broker: import("smqp").Broker;
		environment: Environment;
		context: ContextInstance;
		executionId: string | undefined;
		/**
		 * Activate children and start the process execution. Resumes if the message is redelivered.
		 * @throws {Error} when message or executionId is missing
		 */
		execute(executeMessage: ElementBrokerMessage): true | void;
		/**
		 * Resume after recover. Reshakes elements when there are converging gateways or multiple
		 * start activities, then resumes any postponed children.
		 */
		resume(): void;
		/**
		 * Snapshot execution state including children, flows, message flows, and associations.
		 * */
		getState(): ProcessExecutionState;
		/**
		 * Restore execution state captured by getState.
		 * */
		recover(state?: ProcessExecutionState): this;
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
		get stopped(): boolean;
		get completed(): boolean;
		get status(): string;
		get postponedCount(): number;
		get isRunning(): boolean;
		get activityStatus(): string;
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

	export {};
}

declare module 'bpmn-elements/eventDefinitions' {
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableElement } from 'moddle-context-serializer';
	import type { Activity, ActivityError, ActivityExecution, ActivityExecutionState, ActivityRunStatus, ActivityState, Association, AssociationState, ContextInstance, ElementBase, ElementBroker, ElementBrokerMessage, ElementMessageContent, ElementParent, ElementState, Environment, EnvironmentOptions, EnvironmentSettings, EnvironmentState, EventDefinition, EventDefinitionReference, ExecutionScope, Extension, IActivityBehaviour, IApi, IExpressions, IExtension, IExtensions, IExtensionsMapper, IIOData, ILogger, IScripts, ISequenceFlowCondition, ITimers, Lane, LoggerFactory, MessageFlow, MessageFlowState, Process, ProcessExecutionState, ProcessState, RegisteredTimer, Script, SequenceFlow, SequenceFlowState, ShakeResult, ShakeSequenceItem, ShakenSequence, Timer, completedCounters, filterPostponed, signalMessage, startActivityFilterOptions, wrappedClearTimeout, wrappedSetTimeout } from 'bpmn-elements';

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
		
		reference: EventDefinitionReference;
		isThrowing: boolean;
		activity: Activity;
		environment: Environment;
		broker: import("smqp").Broker;
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
		
		reference: EventDefinitionReference;
		isThrowing: boolean;
		activity: Activity;
		broker: import("smqp").Broker;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): number | import("smqp").Consumer | undefined;
		
		executeCatch(executeMessage: ElementBrokerMessage): import("smqp").Consumer | undefined;
		
		executeThrow(executeMessage: ElementBrokerMessage): number | undefined;
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
		broker: import("smqp").Broker;
		logger: ILogger;
		condition: ScriptCondition | ExpressionCondition | null;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): void;
		/**
		 * Evaluate condition
		 * */
		evaluate(message: ElementBrokerMessage, callback: CallableFunction): any;
		/**
		 * Handle evaluate result or error
		 * @param err Condition evaluation error
		 * @param result Result from evaluated condition, completes execution if truthy
		 */
		evaluateCallback(err: Error | null, result: any): number | undefined;
		/**
		 * Get condition
		 * @param index Eventdefinition sequence number, used to name registered script
		 * */
		getCondition(index: number): ExpressionCondition | ScriptCondition | null;
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
		
		reference: EventDefinitionReference;
		isThrowing: boolean;
		activity: Activity;
		environment: Environment;
		broker: import("smqp").Broker;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): number | void;
		
		executeCatch(executeMessage: ElementBrokerMessage): void;
		
		executeThrow(executeMessage: ElementBrokerMessage): number | undefined;
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
		
		reference: EventDefinitionReference;
		isThrowing: boolean;
		activity: Activity;
		broker: import("smqp").Broker;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): number | void;
		
		executeCatch(executeMessage: ElementBrokerMessage): void;
		
		executeThrow(executeMessage: ElementBrokerMessage): number | undefined;
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
		
		reference: EventDefinitionReference;
		isThrowing: boolean;
		activity: Activity;
		broker: import("smqp").Broker;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): number | undefined;
		
		executeCatch(executeMessage: ElementBrokerMessage): number | undefined;
		
		executeThrow(executeMessage: ElementBrokerMessage): number | undefined;
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
		
		reference: EventDefinitionReference;
		isThrowing: boolean;
		activity: Activity;
		broker: import("smqp").Broker;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): number | void;
		
		executeCatch(executeMessage: ElementBrokerMessage): void;
		
		executeThrow(executeMessage: ElementBrokerMessage): number | undefined;
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
		
		reference: EventDefinitionReference;
		isThrowing: boolean;
		activity: Activity;
		broker: import("smqp").Broker;
		logger: ILogger;
		get executionId(): string;
		
		execute(executeMessage: ElementBrokerMessage): number | void;
		
		executeCatch(executeMessage: ElementBrokerMessage): void;
		
		executeThrow(executeMessage: ElementBrokerMessage): number | undefined;
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
		broker: import("smqp").Broker;
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
		broker: import("smqp").Broker;
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
		parse(timerType: string, value: string): {
			expireAt: Date | undefined;
			repeat: number | undefined;
			delay: number | undefined;
		};
	}
	/**
	 * Script condition
	 * */
		class ScriptCondition {
		/**
		 * Script condition
		 * */
		constructor(owner: ElementBase, script: any, language: string);
		type: string;
		language: string;
		/**
		 * Execute
		 * */
		execute(message: any, callback: CallableFunction): any;
	}
	/**
	 * Expression condition
	 * */
		class ExpressionCondition {
		/**
		 * Expression condition
		 * */
		constructor(owner: ElementBase, expression: string);
		type: string;
		expression: string;
		/**
		 * Execute
		 * */
		execute(message: ElementBrokerMessage, callback: CallableFunction): any;
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
		broker: import("smqp").Broker;
		environment: Environment;
		context: ContextInstance;
		executionId: string | undefined;
		/**
		 * Activate children and start the process execution. Resumes if the message is redelivered.
		 * @throws {Error} when message or executionId is missing
		 */
		execute(executeMessage: ElementBrokerMessage): true | void;
		/**
		 * Resume after recover. Reshakes elements when there are converging gateways or multiple
		 * start activities, then resumes any postponed children.
		 */
		resume(): void;
		/**
		 * Snapshot execution state including children, flows, message flows, and associations.
		 * */
		getState(): ProcessExecutionState;
		/**
		 * Restore execution state captured by getState.
		 * */
		recover(state?: ProcessExecutionState): this;
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
		get stopped(): boolean;
		get completed(): boolean;
		get status(): string;
		get postponedCount(): number;
		get isRunning(): boolean;
		get activityStatus(): string;
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

	export {};
}

declare module 'bpmn-elements/flows' {
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableElement } from 'moddle-context-serializer';
	import type { Activity, ActivityError, ActivityExecution, ActivityExecutionState, ActivityRunStatus, ActivityState, AssociationState, ContextInstance, ElementBase, ElementBroker, ElementBrokerMessage, ElementMessageContent, ElementParent, ElementState, Environment, EnvironmentOptions, EnvironmentSettings, EnvironmentState, EventDefinition, EventDefinitionReference, ExecutionScope, Extension, IActivityBehaviour, IApi, IExpressions, IExtension, IExtensions, IExtensionsMapper, IIOData, ILogger, IScripts, ISequenceFlowCondition, ITimers, Lane, LoggerFactory, MessageFlowState, Process, ProcessExecutionState, ProcessState, RegisteredTimer, Script, SequenceFlowState, ShakeResult, ShakeSequenceItem, ShakenSequence, Timer, completedCounters, filterPostponed, signalMessage, startActivityFilterOptions, wrappedClearTimeout, wrappedSetTimeout } from 'bpmn-elements';

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
		on: (eventName: string, callback: CallableFunction, eventOptions?: {
			once?: boolean;
			[x: string]: any;
		}) => import("smqp").Consumer;
		once: (eventName: string, callback: CallableFunction, eventOptions?: {
			[x: string]: any;
		}) => import("smqp").Consumer;
		waitFor: (eventName: string, onMessage?: (routingKey: string, message: ElementBrokerMessage, owner: any) => boolean) => Promise<any>;
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
		broker: import("smqp").Broker;
		on: (eventName: string, callback: CallableFunction, eventOptions?: {
			once?: boolean;
			[x: string]: any;
		}) => import("smqp").Consumer;
		once: (eventName: string, callback: CallableFunction, eventOptions?: {
			[x: string]: any;
		}) => import("smqp").Consumer;
		emit: (eventName: string, content?: Record<string, any>, props?: any) => void;
		waitFor: (eventName: string, onMessage?: (routingKey: string, message: ElementBrokerMessage, owner: any) => boolean) => Promise<any>;
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
		on: (eventName: string, callback: CallableFunction, eventOptions?: {
			once?: boolean;
			[x: string]: any;
		}) => import("smqp").Consumer;
		once: (eventName: string, callback: CallableFunction, eventOptions?: {
			[x: string]: any;
		}) => import("smqp").Consumer;
		waitFor: (eventName: string, onMessage?: (routingKey: string, message: ElementBrokerMessage, owner: any) => boolean) => Promise<any>;
		emitFatal: (error: Error, content?: Record<string, any>) => void;
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
		 * Discard the flow and publish flow.discard. Detects loops via discardSequence and emits
		 * flow.looped instead when the target id is already in the sequence.
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
		getCondition(): ISequenceFlowCondition | null;
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
		broker: import("smqp").Broker;
		environment: Environment;
		context: ContextInstance;
		executionId: string | undefined;
		/**
		 * Activate children and start the process execution. Resumes if the message is redelivered.
		 * @throws {Error} when message or executionId is missing
		 */
		execute(executeMessage: ElementBrokerMessage): true | void;
		/**
		 * Resume after recover. Reshakes elements when there are converging gateways or multiple
		 * start activities, then resumes any postponed children.
		 */
		resume(): void;
		/**
		 * Snapshot execution state including children, flows, message flows, and associations.
		 * */
		getState(): ProcessExecutionState;
		/**
		 * Restore execution state captured by getState.
		 * */
		recover(state?: ProcessExecutionState): this;
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
		get stopped(): boolean;
		get completed(): boolean;
		get status(): string;
		get postponedCount(): number;
		get isRunning(): boolean;
		get activityStatus(): string;
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

	export {};
}

declare module 'bpmn-elements/gateways' {
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableElement } from 'moddle-context-serializer';
	import type { Activity, ActivityError, ActivityExecution, ActivityExecutionState, ActivityRunStatus, ActivityState, Association, AssociationState, ContextInstance, ElementBase, ElementBroker, ElementBrokerMessage, ElementMessageContent, ElementParent, ElementState, Environment, EnvironmentOptions, EnvironmentSettings, EnvironmentState, EventDefinition, EventDefinitionReference, ExecutionScope, Extension, IActivityBehaviour, IApi, IExpressions, IExtension, IExtensions, IExtensionsMapper, IIOData, ILogger, IScripts, ISequenceFlowCondition, ITimers, Lane, LoggerFactory, MessageFlow, MessageFlowState, Process, ProcessExecutionState, ProcessState, RegisteredTimer, Script, SequenceFlow, SequenceFlowState, ShakeResult, ShakeSequenceItem, ShakenSequence, Timer, completedCounters, filterPostponed, signalMessage, startActivityFilterOptions, wrappedClearTimeout, wrappedSetTimeout } from 'bpmn-elements';

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
		broker: import("smqp").Broker;
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
		broker: import("smqp").Broker;
		
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
		broker: import("smqp").Broker;
		
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
		broker: import("smqp").Broker;
		inbound: Set<any>;
		isConverging: boolean;
		get executionId(): any;
		
		execute(executeMessage: ElementBrokerMessage): void;
		setup(executeMessage: any): number | undefined;
		peerMonitor: PeerMonitor | undefined;
	}
		class PeerMonitor {
		constructor(activity: any, peers: any, targets: any);
		activity: any;
		id: any;
		broker: any;
		running: Map<any, any>;
		index: number;
		discarded: number;
		watching: Map<any, any>;
		peers: any;
		targets: any;
		touched: Set<any>;
		inbound: any[];
		get isRunning(): boolean;
		execute(executeMessage: any): number;
		monitor(peerActivity: any): void;
		stop(): void;
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
		broker: import("smqp").Broker;
		environment: Environment;
		context: ContextInstance;
		executionId: string | undefined;
		/**
		 * Activate children and start the process execution. Resumes if the message is redelivered.
		 * @throws {Error} when message or executionId is missing
		 */
		execute(executeMessage: ElementBrokerMessage): true | void;
		/**
		 * Resume after recover. Reshakes elements when there are converging gateways or multiple
		 * start activities, then resumes any postponed children.
		 */
		resume(): void;
		/**
		 * Snapshot execution state including children, flows, message flows, and associations.
		 * */
		getState(): ProcessExecutionState;
		/**
		 * Restore execution state captured by getState.
		 * */
		recover(state?: ProcessExecutionState): this;
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
		get stopped(): boolean;
		get completed(): boolean;
		get status(): string;
		get postponedCount(): number;
		get isRunning(): boolean;
		get activityStatus(): string;
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

	export {};
}

declare module 'bpmn-elements/tasks' {
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableElement } from 'moddle-context-serializer';
	import type { Activity, ActivityError, ActivityExecution, ActivityExecutionState, ActivityRunStatus, ActivityState, Association, AssociationState, ContextInstance, ElementBase, ElementBroker, ElementBrokerMessage, ElementMessageContent, ElementParent, ElementState, Environment, EnvironmentOptions, EnvironmentSettings, EnvironmentState, EventDefinition, EventDefinitionReference, ExecutionScope, Extension, IActivityBehaviour, IApi, IExpressions, IExtension, IExtensions, IExtensionsMapper, IIOData, ILogger, IScripts, ISequenceFlowCondition, ITimers, Lane, LoggerFactory, MessageFlow, MessageFlowState, Process, ProcessExecutionState, ProcessState, RegisteredTimer, Script, SequenceFlow, SequenceFlowState, ShakeResult, ShakeSequenceItem, ShakenSequence, Timer, completedCounters, filterPostponed, signalMessage, startActivityFilterOptions, wrappedClearTimeout, wrappedSetTimeout } from 'bpmn-elements';

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
		
		loopCharacteristics: LoopCharacteristics;
		activity: Activity;
		broker: import("smqp").Broker;
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
		reference: any;
		loopCharacteristics: any;
		activity: Activity;
		broker: import("smqp").Broker;
		
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
		scriptFormat: any;
		loopCharacteristics: any;
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
		loopCharacteristics: any;
		activity: Activity;
		environment: Environment;
		broker: import("smqp").Broker;
		
		execute(executeMessage: ElementBrokerMessage): void;
		service: any;
		getService(message: any): any;
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
		loopCharacteristics: any;
		activity: Activity;
		broker: import("smqp").Broker;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Sub process
	 * */
	export function SubProcess(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
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
		loopCharacteristics: any;
		activity: Activity;
		context: ContextInstance;
		environment: Environment;
		broker: import("smqp").Broker;
		executionId: string | undefined;
		get execution(): any;
		get executions(): any[];
		
		execute(executeMessage: ElementBrokerMessage): void;
		getState(): any;
		recover(state: any): this | undefined;
		getPostponed(): any[];
		getApi(apiMessage: any): any;
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
		loopCharacteristics: any;
		broker: import("smqp").Broker;
		
		execute(executeMessage: ElementBrokerMessage): void;
	}
	/**
	 * Transaction
	 * */
	export function Transaction(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	/**
	 * Loop characteristics
	 * */
		class LoopCharacteristics {
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
		broker: import("smqp").Broker;
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
		broker: import("smqp").Broker;
		environment: Environment;
		context: ContextInstance;
		executionId: string | undefined;
		/**
		 * Activate children and start the process execution. Resumes if the message is redelivered.
		 * @throws {Error} when message or executionId is missing
		 */
		execute(executeMessage: ElementBrokerMessage): true | void;
		/**
		 * Resume after recover. Reshakes elements when there are converging gateways or multiple
		 * start activities, then resumes any postponed children.
		 */
		resume(): void;
		/**
		 * Snapshot execution state including children, flows, message flows, and associations.
		 * */
		getState(): ProcessExecutionState;
		/**
		 * Restore execution state captured by getState.
		 * */
		recover(state?: ProcessExecutionState): this;
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
		get stopped(): boolean;
		get completed(): boolean;
		get status(): string;
		get postponedCount(): number;
		get isRunning(): boolean;
		get activityStatus(): string;
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

	export {};
}
