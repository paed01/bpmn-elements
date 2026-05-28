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
		id: any;
		type: any;
		name: any;
		behaviour: any;
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
		id: any;
		broker: import("smqp").Broker;
		get completed(): boolean;
		/**
		 * Begin executing the activity behaviour. Resumes if the message is redelivered.
		 * @throws {Error} when message or executionId is missing
		 */
		execute(executeMessage: ElementBrokerMessage): any;
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
	export function BpmnError(errorDef: any, context: any): {
		id: any;
		type: any;
		name: any;
		errorCode: any;
		resolve: (executionMessage: any, error: any) => {
			id: any;
			type: any;
			messageType: string;
			name: any;
			code: any;
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
		 * 
		 */
		shake(startId?: string): {} | undefined;
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
		getPostponed(...args: any[]): any[];
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
		execute(executeMessage: ElementBrokerMessage): any;
		/**
		 * Resume after recover by reactivating running processes.
		 */
		resume(): any;
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
		 * 
		 */
		getPostponed(...args: any[]): any[];
		get stopped(): boolean;
		get completed(): boolean;
		get status(): string;
		get processes(): Process[];
		get postponedCount(): number;
		get isRunning(): boolean;
		get activityStatus(): string;
	}
	export function Category(activityDef: any): {
		id: any;
		type: any;
		name: any;
		behaviour: any;
		parent: ElementParent;
		placeholder: boolean;
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
		options: {};
		expressions: IExpressions;
		extensions: Record<string, Extension> | undefined;
		output: any;
		scripts: Scripts | IScripts;
		timers: Timers | ITimers;
		settings: {
			enableDummyService?: boolean;
			step?: boolean;
			strict?: boolean;
			batchSize?: number;
			disableTrackState?: boolean;
			skipDiscard: boolean;
		};
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
		 * 
		 */
		clone(overrideOptions?: EnvironmentOptions): any;
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
		getScript(...args: any[]): void | Script;
		/**
		 * Register a script for an activity, delegating to the configured scripts engine.
		 * */
		registerScript(...args: any[]): void | Script;
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
		 * */
		addService(name: string, fn: CallableFunction): void;
	}
	/**
	 * Builtin data object
	 * @param >} dataObjectDef
	 * */
		export class DataObject {
		/**
		 * Builtin data object
		 * @param >} dataObjectDef
		 * */
		constructor(dataObjectDef: any, { environment }: ContextInstance);
		id: any;
		type: any;
		name: any;
		behaviour: any;
		parent: any;
		environment: Environment;
		read(broker: any, exchange: any, routingKeyPrefix: any, messageProperties: any): any;
		write(broker: any, exchange: any, routingKeyPrefix: any, value: any, messageProperties: any): any;
	}
		export class DataStore {
		constructor(dataStoreDef: any, { environment }: {
			environment: any;
		});
		id: any;
		type: any;
		name: any;
		behaviour: any;
		parent: any;
		environment: any;
		read(broker: any, exchange: any, routingKeyPrefix: any, messageProperties: any): any;
		write(broker: any, exchange: any, routingKeyPrefix: any, value: any, messageProperties: any): any;
	}
		export class DataStoreReference {
		constructor(dataObjectDef: any, { environment }: {
			environment: any;
		});
		id: any;
		type: any;
		name: any;
		behaviour: any;
		parent: any;
		environment: any;
		read(broker: any, exchange: any, routingKeyPrefix: any, messageProperties: any): any;
		write(broker: any, exchange: any, routingKeyPrefix: any, value: any, messageProperties: any): any;
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
		export class InputOutputSpecification {
		constructor(activity: any, ioSpecificationDef: any, context: any);
		id: any;
		type: any;
		behaviour: any;
		activity: any;
		broker: any;
		context: any;
		activate(message: any): void;
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
		name: any;
		parent: {
			id: any;
			type: any;
		};
		behaviour: {
			[x: string]: any;
		};
		environment: Environment;
		broker: import("smqp").Broker;
		context: ContextInstance;
		logger: ILogger;
		get process(): Process;
	}
		export class MultiInstanceLoopCharacteristics {
		constructor(activity: any, loopCharacteristics: any);
		activity: any;
		loopCharacteristics: any;
		type: any;
		isSequential: any;
		collection: any;
		loopCardinality: any;
		loopType: string | undefined;
		elementVariable: any;
		characteristics: any;
		execution: any;
		execute(executeMessage: any): any;
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
		id: any;
		type: any;
		name: any;
		
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
		 * 
		 */
		shake(startId?: string): any;
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
		
		getLaneById(laneId: string): any;
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
		export class Properties {
		constructor(activity: any, propertiesDef: any, context: any);
		activity: any;
		broker: any;
		activate(message: any): void;
		deactivate(): void;
	}
		export class ServiceImplementation {
		constructor(activity: any);
		type: string;
		implementation: any;
		activity: any;
		execute(executionMessage: any, callback: any): any;
	}
	export function Signal(signalDef: any, context: any): {
		id: any;
		type: any;
		name: any;
		parent: any;
		resolve: (executionMessage: any) => any;
	};
	export function StandardLoopCharacteristics(activity: any, loopCharacteristics: any): MultiInstanceLoopCharacteristics;
		export class Timers {
		constructor(options: any);
		count: number;
		options: any;
		setTimeout: any;
		clearTimeout: any;
		get executing(): any[];
		register(owner: any): RegisteredTimers;
	}
		class RegisteredTimers {
		constructor(timersApi: any, owner: any);
		owner: any;
		setTimeout: any;
		clearTimeout: any;
	}
		class Timer_1 {
		constructor(owner: any, timerId: any, callback: any, delay: any, args: any);
		callback: any;
		delay: any;
		args: any;
		owner: any;
		timerId: any;
		expireAt: Date;
		timerRef: any;
	}
	export class ActivityError extends Error {
		constructor(description: any, sourceMessage: any, inner: any);
		type: string;
		name: any;
		description: any;
		source: any;
		inner: any;
		code: any;
	}
	export class RunError extends ActivityError {
		constructor(...args: any[]);
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
		id: any;
		type: any;
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
		 * 
		 */
		shake(fromId?: string): any;
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
		discard(): any;
		/**
		 * Queue a cancel message that propagates to all running children.
		 */
		cancel(): any;
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
		id: any;
		type: any;
		name: any;
		parent: ElementParent;
		behaviour: any;
		sourceId: any;
		targetId: any;
		isDefault: any;
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
		shake(message: ElementBrokerMessage): any;
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
		constructor(associationDef: import("moddle-context-serializer").SerializableElement, { environment }: ContextInstance);
		id: string | undefined;
		type: string;
		name: any;
		parent: ElementParent;
		behaviour: Record<string, any>;
		sourceId: any;
		targetId: any;
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
		constructor(flowDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance);
		id: string | undefined;
		type: string;
		name: any;
		parent: ElementParent;
		source: any;
		target: any;
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
		class Scripts {
		getScript(): void;
		register(): void;
	}
	export function BoundaryEvent(activityDef: any, context: any): Activity;
	export function EndEvent(activityDef: any, context: any): Activity;
	export function IntermediateCatchEvent(activityDef: any, context: any): Activity;
	export function IntermediateThrowEvent(activityDef: any, context: any): Activity;
	export function StartEvent(activityDef: any, context: any): Activity;
	export function EventBasedGateway(activityDef: any, context: any): Activity;
	export function ExclusiveGateway(activityDef: any, context: any): Activity;
	export function InclusiveGateway(activityDef: any, context: any): Activity;
		export class ParallelGateway {
		constructor(activityDef: any, context: any);
		id: any;
	}
	/**
	 * Create call activity
	 * @returns Call activity
	 */
	export function CallActivity(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
	export function ReceiveTask(activityDef: any, context: any): Activity;
	export function ScriptTask(activityDef: any, context: any): Activity;
	export function SendTask(activityDef: any, context: any): Activity;
	export function UserTask(activityDef: any, context: any): Activity;
	export function AdHocSubProcess(activityDef: any, context: any): Activity;
	export function Task(activityDef: any, context: any): Activity;
	export function Transaction(activityDef: any, context: any): Activity;
		export class CancelEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		reference: {
			referenceType: string;
		};
		isThrowing: any;
		activity: any;
		environment: any;
		broker: any;
		logger: any;
		get executionId(): any;
		execute(executeMessage: any): any;
		executeCatch(executeMessage: any): void;
		executeThrow(executeMessage: any): any;
	}
		export class CompensateEventDefinition {
		constructor(activity: any, eventDefinition: any, context: any);
		id: any;
		type: any;
		reference: {
			referenceType: string;
		};
		isThrowing: any;
		activity: any;
		broker: any;
		logger: any;
		get executionId(): any;
		execute(executeMessage: any): any;
		executeCatch(executeMessage: any): any;
		executeThrow(executeMessage: any): any;
	}
		export class ConditionalEventDefinition {
		constructor(activity: any, eventDefinition: any, _context: any, index: any);
		id: any;
		type: any;
		behaviour: any;
		activity: any;
		environment: any;
		broker: any;
		logger: any;
		condition: ScriptCondition | ExpressionCondition | null;
		get executionId(): any;
		execute(executeMessage: any): void;
		/**
		 * Evaluate condition
		 * */
		evaluate(message: ElementBrokerMessage, callback: CallableFunction): any;
		/**
		 * Handle evaluate result or error
		 * @param err Condition evaluation error
		 * @param result Result from evaluated condition, completes execution if truthy
		 */
		evaluateCallback(err: Error | null, result: any): any;
		/**
		 * Get condition
		 * @param index Eventdefinition sequence number, used to name registered script
		 * */
		getCondition(index: number): ExpressionCondition | ScriptCondition | null;
	}
		export class ErrorEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		reference: any;
		isThrowing: any;
		activity: any;
		environment: any;
		broker: any;
		logger: any;
		get executionId(): any;
		execute(executeMessage: any): any;
		executeCatch(executeMessage: any): void;
		executeThrow(executeMessage: any): any;
	}
		export class EscalationEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		reference: any;
		isThrowing: any;
		activity: any;
		broker: any;
		logger: any;
		get executionId(): any;
		execute(executeMessage: any): any;
		executeCatch(executeMessage: any): void;
		executeThrow(executeMessage: any): any;
	}
		export class LinkEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		reference: {
			id: any;
			linkName: any;
			referenceType: string;
		};
		isThrowing: any;
		activity: any;
		broker: any;
		logger: any;
		get executionId(): any;
		execute(executeMessage: any): any;
		executeCatch(executeMessage: any): any;
		executeThrow(executeMessage: any): any;
	}
		export class MessageEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		reference: any;
		isThrowing: any;
		activity: any;
		broker: any;
		logger: any;
		get executionId(): any;
		execute(executeMessage: any): any;
		executeCatch(executeMessage: any): void;
		executeThrow(executeMessage: any): any;
	}
		export class SignalEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		reference: any;
		isThrowing: any;
		activity: any;
		broker: any;
		logger: any;
		get executionId(): any;
		execute(executeMessage: any): any;
		executeCatch(executeMessage: any): void;
		executeThrow(executeMessage: any): any;
	}
		export class TerminateEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		activity: any;
		broker: any;
		logger: any;
		execute(executeMessage: any): void;
	}
		export class TimerEventDefinition {
		constructor(activity: any, eventDefinition: any);
		type: any;
		activity: any;
		environment: any;
		eventDefinition: any;
		timeDuration: any;
		timeCycle: any;
		timeDate: any;
		broker: any;
		logger: any;
		get executionId(): string | undefined;
		get stopped(): boolean;
		get timer(): any;
		execute(executeMessage: any): void;
		startedAt: Date | undefined;
		stop(): void;
		parse(timerType: any, value: any): {
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
	export function makeErrorFromMessage(errorMessage: any): any;
	export class ActivityError extends Error {
		constructor(description: any, sourceMessage: any, inner: any);
		type: string;
		name: any;
		description: any;
		source: any;
		inner: any;
		code: any;
	}
	export class RunError extends ActivityError {
		constructor(...args: any[]);
	}
	export class BpmnError extends Error {
		constructor(description: any, behaviour: any, sourceMessage: any, inner: any);
		type: string;
		name: any;
		description: any;
		code: any;
		id: any;
		source: any;
		inner: any;
	}

	export {};
}

declare module 'bpmn-elements/events' {
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableElement } from 'moddle-context-serializer';
	import type { Activity, ActivityError, ActivityExecution, ActivityExecutionState, ActivityRunStatus, ActivityState, Association, AssociationState, ContextInstance, ElementBase, ElementBroker, ElementBrokerMessage, ElementMessageContent, ElementParent, ElementState, Environment, EnvironmentOptions, EnvironmentSettings, EnvironmentState, EventDefinition, ExecutionScope, Extension, IActivityBehaviour, IApi, IExpressions, IExtension, IExtensions, IExtensionsMapper, IIOData, ILogger, IScripts, ISequenceFlowCondition, ITimers, Lane, LoggerFactory, MessageFlow, MessageFlowState, Process, ProcessExecutionState, ProcessState, RegisteredTimer, Script, SequenceFlow, SequenceFlowState, Timer, Timers, completedCounters, filterPostponed, signalMessage, startActivityFilterOptions, wrappedClearTimeout, wrappedSetTimeout } from 'bpmn-elements';

	export function BoundaryEvent(activityDef: any, context: any): Activity;
		export class BoundaryEventBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		attachedTo: any;
		activity: any;
		environment: any;
		broker: any;
		get executionId(): any;
		get cancelActivity(): any;
		execute(executeMessage: any): any;
	}
	export function EndEvent(activityDef: any, context: any): Activity;
		export class EndEventBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		broker: any;
		execute(executeMessage: any): any;
	}
	export function IntermediateCatchEvent(activityDef: any, context: any): Activity;
		export class IntermediateCatchEventBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		broker: any;
		execute(executeMessage: any): any;
	}
	export function IntermediateThrowEvent(activityDef: any, context: any): Activity;
		export class IntermediateThrowEventBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		broker: any;
		execute(executeMessage: any): any;
	}
	export function StartEvent(activityDef: any, context: any): Activity;
		export class StartEventBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		activity: any;
		broker: any;
		get executionId(): any;
		execute(executeMessage: any): any;
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
	 * Drives the execution of a single process or sub-process: activates children, routes activity
	 * events, and rolls completion up to the owning Process or sub-process Activity.
	 * */
		class ProcessExecution {
		/**
		 * Drives the execution of a single process or sub-process: activates children, routes activity
		 * events, and rolls completion up to the owning Process or sub-process Activity.
		 * */
		constructor(parentActivity: Process | Activity, context: ContextInstance);
		id: any;
		type: any;
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
		 * 
		 */
		shake(fromId?: string): any;
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
		discard(): any;
		/**
		 * Queue a cancel message that propagates to all running children.
		 */
		cancel(): any;
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
		class Scripts {
		getScript(): void;
		register(): void;
	}
		class RegisteredTimers {
		constructor(timersApi: any, owner: any);
		owner: any;
		setTimeout: any;
		clearTimeout: any;
	}
		class Timer_1 {
		constructor(owner: any, timerId: any, callback: any, delay: any, args: any);
		callback: any;
		delay: any;
		args: any;
		owner: any;
		timerId: any;
		expireAt: Date;
		timerRef: any;
	}

	export {};
}

declare module 'bpmn-elements/eventDefinitions' {
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableElement } from 'moddle-context-serializer';
	import type { Activity, ActivityError, ActivityExecution, ActivityExecutionState, ActivityRunStatus, ActivityState, Association, AssociationState, ContextInstance, ElementBase, ElementBroker, ElementBrokerMessage, ElementMessageContent, ElementParent, ElementState, Environment, EnvironmentOptions, EnvironmentSettings, EnvironmentState, EventDefinition, ExecutionScope, Extension, IActivityBehaviour, IApi, IExpressions, IExtension, IExtensions, IExtensionsMapper, IIOData, ILogger, IScripts, ISequenceFlowCondition, ITimers, Lane, LoggerFactory, MessageFlow, MessageFlowState, Process, ProcessExecutionState, ProcessState, RegisteredTimer, Script, SequenceFlow, SequenceFlowState, Timer, Timers, completedCounters, filterPostponed, signalMessage, startActivityFilterOptions, wrappedClearTimeout, wrappedSetTimeout } from 'bpmn-elements';

		export class CancelEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		reference: {
			referenceType: string;
		};
		isThrowing: any;
		activity: any;
		environment: any;
		broker: any;
		logger: any;
		get executionId(): any;
		execute(executeMessage: any): any;
		executeCatch(executeMessage: any): void;
		executeThrow(executeMessage: any): any;
	}
		export class CompensateEventDefinition {
		constructor(activity: any, eventDefinition: any, context: any);
		id: any;
		type: any;
		reference: {
			referenceType: string;
		};
		isThrowing: any;
		activity: any;
		broker: any;
		logger: any;
		get executionId(): any;
		execute(executeMessage: any): any;
		executeCatch(executeMessage: any): any;
		executeThrow(executeMessage: any): any;
	}
		export class ConditionalEventDefinition {
		constructor(activity: any, eventDefinition: any, _context: any, index: any);
		id: any;
		type: any;
		behaviour: any;
		activity: any;
		environment: any;
		broker: any;
		logger: any;
		condition: ScriptCondition | ExpressionCondition | null;
		get executionId(): any;
		execute(executeMessage: any): void;
		/**
		 * Evaluate condition
		 * */
		evaluate(message: ElementBrokerMessage, callback: CallableFunction): any;
		/**
		 * Handle evaluate result or error
		 * @param err Condition evaluation error
		 * @param result Result from evaluated condition, completes execution if truthy
		 */
		evaluateCallback(err: Error | null, result: any): any;
		/**
		 * Get condition
		 * @param index Eventdefinition sequence number, used to name registered script
		 * */
		getCondition(index: number): ExpressionCondition | ScriptCondition | null;
	}
		export class ErrorEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		reference: any;
		isThrowing: any;
		activity: any;
		environment: any;
		broker: any;
		logger: any;
		get executionId(): any;
		execute(executeMessage: any): any;
		executeCatch(executeMessage: any): void;
		executeThrow(executeMessage: any): any;
	}
		export class EscalationEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		reference: any;
		isThrowing: any;
		activity: any;
		broker: any;
		logger: any;
		get executionId(): any;
		execute(executeMessage: any): any;
		executeCatch(executeMessage: any): void;
		executeThrow(executeMessage: any): any;
	}
		export class LinkEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		reference: {
			id: any;
			linkName: any;
			referenceType: string;
		};
		isThrowing: any;
		activity: any;
		broker: any;
		logger: any;
		get executionId(): any;
		execute(executeMessage: any): any;
		executeCatch(executeMessage: any): any;
		executeThrow(executeMessage: any): any;
	}
		export class MessageEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		reference: any;
		isThrowing: any;
		activity: any;
		broker: any;
		logger: any;
		get executionId(): any;
		execute(executeMessage: any): any;
		executeCatch(executeMessage: any): void;
		executeThrow(executeMessage: any): any;
	}
		export class SignalEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		reference: any;
		isThrowing: any;
		activity: any;
		broker: any;
		logger: any;
		get executionId(): any;
		execute(executeMessage: any): any;
		executeCatch(executeMessage: any): void;
		executeThrow(executeMessage: any): any;
	}
		export class TerminateEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		activity: any;
		broker: any;
		logger: any;
		execute(executeMessage: any): void;
	}
		export class TimerEventDefinition {
		constructor(activity: any, eventDefinition: any);
		type: any;
		activity: any;
		environment: any;
		eventDefinition: any;
		timeDuration: any;
		timeCycle: any;
		timeDate: any;
		broker: any;
		logger: any;
		get executionId(): string | undefined;
		get stopped(): boolean;
		get timer(): any;
		execute(executeMessage: any): void;
		startedAt: Date | undefined;
		stop(): void;
		parse(timerType: any, value: any): {
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
		id: any;
		type: any;
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
		 * 
		 */
		shake(fromId?: string): any;
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
		discard(): any;
		/**
		 * Queue a cancel message that propagates to all running children.
		 */
		cancel(): any;
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
		class Scripts {
		getScript(): void;
		register(): void;
	}
		class RegisteredTimers {
		constructor(timersApi: any, owner: any);
		owner: any;
		setTimeout: any;
		clearTimeout: any;
	}
		class Timer_1 {
		constructor(owner: any, timerId: any, callback: any, delay: any, args: any);
		callback: any;
		delay: any;
		args: any;
		owner: any;
		timerId: any;
		expireAt: Date;
		timerRef: any;
	}

	export {};
}

declare module 'bpmn-elements/flows' {
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableElement } from 'moddle-context-serializer';
	import type { Activity, ActivityError, ActivityExecution, ActivityExecutionState, ActivityRunStatus, ActivityState, AssociationState, ContextInstance, ElementBase, ElementBroker, ElementBrokerMessage, ElementMessageContent, ElementParent, ElementState, Environment, EnvironmentOptions, EnvironmentSettings, EnvironmentState, EventDefinition, ExecutionScope, Extension, IActivityBehaviour, IApi, IExpressions, IExtension, IExtensions, IExtensionsMapper, IIOData, ILogger, IScripts, ISequenceFlowCondition, ITimers, Lane, LoggerFactory, MessageFlowState, Process, ProcessExecutionState, ProcessState, RegisteredTimer, Script, SequenceFlowState, Timer, Timers, completedCounters, filterPostponed, signalMessage, startActivityFilterOptions, wrappedClearTimeout, wrappedSetTimeout } from 'bpmn-elements';

	/**
	 * Association connecting a source and target activity. Used to drive compensation —
	 * activities marked `isForCompensation` subscribe to inbound association events.
	 * */
		export class Association {
		/**
		 * Association connecting a source and target activity. Used to drive compensation —
		 * activities marked `isForCompensation` subscribe to inbound association events.
		 * */
		constructor(associationDef: import("moddle-context-serializer").SerializableElement, { environment }: ContextInstance);
		id: string | undefined;
		type: string;
		name: any;
		parent: ElementParent;
		behaviour: Record<string, any>;
		sourceId: any;
		targetId: any;
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
		constructor(flowDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance);
		id: string | undefined;
		type: string;
		name: any;
		parent: ElementParent;
		source: any;
		target: any;
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
		id: any;
		type: any;
		name: any;
		parent: ElementParent;
		behaviour: any;
		sourceId: any;
		targetId: any;
		isDefault: any;
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
		shake(message: ElementBrokerMessage): any;
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
		id: any;
		type: any;
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
		 * 
		 */
		shake(fromId?: string): any;
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
		discard(): any;
		/**
		 * Queue a cancel message that propagates to all running children.
		 */
		cancel(): any;
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
		class Scripts {
		getScript(): void;
		register(): void;
	}
		class RegisteredTimers {
		constructor(timersApi: any, owner: any);
		owner: any;
		setTimeout: any;
		clearTimeout: any;
	}
		class Timer_1 {
		constructor(owner: any, timerId: any, callback: any, delay: any, args: any);
		callback: any;
		delay: any;
		args: any;
		owner: any;
		timerId: any;
		expireAt: Date;
		timerRef: any;
	}

	export {};
}

declare module 'bpmn-elements/gateways' {
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableElement } from 'moddle-context-serializer';
	import type { Activity, ActivityError, ActivityExecution, ActivityExecutionState, ActivityRunStatus, ActivityState, Association, AssociationState, ContextInstance, ElementBase, ElementBroker, ElementBrokerMessage, ElementMessageContent, ElementParent, ElementState, Environment, EnvironmentOptions, EnvironmentSettings, EnvironmentState, EventDefinition, ExecutionScope, Extension, IActivityBehaviour, IApi, IExpressions, IExtension, IExtensions, IExtensionsMapper, IIOData, ILogger, IScripts, ISequenceFlowCondition, ITimers, Lane, LoggerFactory, MessageFlow, MessageFlowState, Process, ProcessExecutionState, ProcessState, RegisteredTimer, Script, SequenceFlow, SequenceFlowState, Timer, Timers, completedCounters, filterPostponed, signalMessage, startActivityFilterOptions, wrappedClearTimeout, wrappedSetTimeout } from 'bpmn-elements';

	export function EventBasedGateway(activityDef: any, context: any): Activity;
		export class EventBasedGatewayBehaviour {
		constructor(activity: any, context: any);
		id: any;
		type: any;
		activity: any;
		broker: any;
		context: any;
		execute(executeMessage: any): any;
	}
	export function ExclusiveGateway(activityDef: any, context: any): Activity;
		export class ExclusiveGatewayBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		broker: any;
		execute({ content }: {
			content: any;
		}): void;
	}
	export function InclusiveGateway(activityDef: any, context: any): Activity;
		export class InclusiveGatewayBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		broker: any;
		execute({ content }: {
			content: any;
		}): void;
	}
		export class ParallelGateway {
		constructor(activityDef: any, context: any);
		id: any;
	}
		export class ParallelGatewayBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		activity: any;
		broker: any;
		inbound: Set<any>;
		isConverging: boolean;
		get executionId(): any;
		execute(executeMessage: any): any;
		setup(executeMessage: any): any;
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
	 * Drives the execution of a single process or sub-process: activates children, routes activity
	 * events, and rolls completion up to the owning Process or sub-process Activity.
	 * */
		class ProcessExecution {
		/**
		 * Drives the execution of a single process or sub-process: activates children, routes activity
		 * events, and rolls completion up to the owning Process or sub-process Activity.
		 * */
		constructor(parentActivity: Process | Activity, context: ContextInstance);
		id: any;
		type: any;
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
		 * 
		 */
		shake(fromId?: string): any;
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
		discard(): any;
		/**
		 * Queue a cancel message that propagates to all running children.
		 */
		cancel(): any;
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
		class Scripts {
		getScript(): void;
		register(): void;
	}
		class RegisteredTimers {
		constructor(timersApi: any, owner: any);
		owner: any;
		setTimeout: any;
		clearTimeout: any;
	}
		class Timer_1 {
		constructor(owner: any, timerId: any, callback: any, delay: any, args: any);
		callback: any;
		delay: any;
		args: any;
		owner: any;
		timerId: any;
		expireAt: Date;
		timerRef: any;
	}

	export {};
}

declare module 'bpmn-elements/tasks' {
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableElement } from 'moddle-context-serializer';
	import type { Activity, ActivityError, ActivityExecution, ActivityExecutionState, ActivityRunStatus, ActivityState, Association, AssociationState, ContextInstance, ElementBase, ElementBroker, ElementBrokerMessage, ElementMessageContent, ElementParent, ElementState, Environment, EnvironmentOptions, EnvironmentSettings, EnvironmentState, EventDefinition, ExecutionScope, Extension, IActivityBehaviour, IApi, IExpressions, IExtension, IExtensions, IExtensionsMapper, IIOData, ILogger, IScripts, ISequenceFlowCondition, ITimers, Lane, LoggerFactory, MessageFlow, MessageFlowState, Process, ProcessExecutionState, ProcessState, RegisteredTimer, Script, SequenceFlow, SequenceFlowState, Timer, Timers, completedCounters, filterPostponed, signalMessage, startActivityFilterOptions, wrappedClearTimeout, wrappedSetTimeout } from 'bpmn-elements';

	/**
	 * Create call activity
	 * @returns Call activity
	 */
	export function CallActivity(activityDef: import("moddle-context-serializer").Activity, context: ContextInstance): Activity;
		export class CallActivityBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		calledElement: any;
		loopCharacteristics: any;
		activity: any;
		broker: any;
		environment: any;
		execute(executeMessage: any): any;
	}
	export function ReceiveTask(activityDef: any, context: any): Activity;
		export class ReceiveTaskBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		reference: any;
		loopCharacteristics: any;
		activity: any;
		broker: any;
		execute(executeMessage: any): any;
	}
	export function ScriptTask(activityDef: any, context: any): Activity;
		export class ScriptTaskBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		scriptFormat: any;
		loopCharacteristics: any;
		activity: any;
		environment: any;
		execute(executeMessage: any): any;
	}
	export function ServiceTask(activityDef: any, context: any): Activity;
		export class ServiceTaskBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		loopCharacteristics: any;
		activity: any;
		environment: any;
		broker: any;
		execute(executeMessage: any): any;
		service: any;
		getService(message: any): any;
	}
	export function SignalTask(activityDef: any, context: any): Activity;
		export class SignalTaskBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		loopCharacteristics: any;
		activity: any;
		broker: any;
		execute(executeMessage: any): any;
	}
	export function SubProcess(activityDef: any, context: any): Activity;
		export class SubProcessBehaviour {
		constructor(activity: any, context: any);
		id: any;
		type: any;
		loopCharacteristics: any;
		activity: any;
		context: any;
		environment: any;
		broker: any;
		executionId: any;
		get execution(): any;
		get executions(): any[];
		execute(executeMessage: any): any;
		getState(): any;
		recover(state: any): this | undefined;
		getPostponed(): any[];
		getApi(apiMessage: any): any;
	}
	export function Task(activityDef: any, context: any): Activity;
		export class TaskBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		loopCharacteristics: any;
		broker: any;
		execute(executeMessage: any): any;
	}
	export function Transaction(activityDef: any, context: any): Activity;
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
		class RegisteredTimers {
		constructor(timersApi: any, owner: any);
		owner: any;
		setTimeout: any;
		clearTimeout: any;
	}
		class Timer_1 {
		constructor(owner: any, timerId: any, callback: any, delay: any, args: any);
		callback: any;
		delay: any;
		args: any;
		owner: any;
		timerId: any;
		expireAt: Date;
		timerRef: any;
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
		id: any;
		type: any;
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
		 * 
		 */
		shake(fromId?: string): any;
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
		discard(): any;
		/**
		 * Queue a cancel message that propagates to all running children.
		 */
		cancel(): any;
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
		class Scripts {
		getScript(): void;
		register(): void;
	}

	export {};
}
