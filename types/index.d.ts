declare module 'bpmn-elements' {
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableContext, SerializableElement } from 'moddle-context-serializer';
	/**
	 * Activity wraps any element (task, event, gateway) and orchestrates its lifecycle through the broker.
	 * @param Behaviour Element-specific behaviour constructor invoked per execution
	 * @param activityDef Parsed BPMN element definition
	 * @param context Per-execution registry and factory
	 */
	export function Activity(Behaviour: IActivityBehaviour, activityDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance): void;
	export class Activity {
		/**
		 * Activity wraps any element (task, event, gateway) and orchestrates its lifecycle through the broker.
		 * @param Behaviour Element-specific behaviour constructor invoked per execution
		 * @param activityDef Parsed BPMN element definition
		 * @param context Per-execution registry and factory
		 */
		constructor(Behaviour: IActivityBehaviour, activityDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance);
		id: string | undefined;
		type: string;
		name: any;
		behaviour: {
			eventDefinitions: any;
		};
		Behaviour: IActivityBehaviour;
		parent: any;
		logger: ILogger;
		environment: Environment_1;
		context: ContextInstance;
		broker: import("smqp").default | undefined;
		on: any;
		once: any;
		waitFor: any;
		emitFatal: any;
		/**
		 * Subscribe to inbound flows and start consuming the inbound queue.
		 */
		activate(): 0 | import("smqp").Consumer | undefined;
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
		 */
		getState(): any;
		/**
		 * Restore activity state captured by getState. Cannot be called while running.
		 * @returns this when state was applied
		 * @throws {Error} when activity is currently running
		 */
		recover(state?: ActivityState): this;
		stopped: boolean | undefined;
		status: any;
		/**
		 * Resume after recover. If no run has been started, falls back to activate.
		 * @throws {Error} when called on a running activity
		 */
		resume(): 0 | import("smqp").Consumer | undefined;
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
		stop(): any;
		/**
		 * Advance one run-step when the environment runs in step mode. No-op otherwise.
		 */
		next(): any;
		/**
		 * Walk outbound flows to discover the activity graph from this point.
		 */
		shake(): void;
		/**
		 * Evaluate outbound sequence flows for the given source message.
		 * @param fromMessage Source run message
		 * @param discardRestAtTake When true, take only the first matching flow and discard the rest
		 * */
		evaluateOutbound(fromMessage: ElementBrokerMessage, discardRestAtTake: boolean, callback: (err: Error, evaluationResult: any) => void): any;
		/**
		 * Resolve an Api wrapper for the activity, preferring the running execution if any.
		 * 
		 */
		getApi(message?: ElementBrokerMessage): any;
		/**
		 * Look up another activity in the same context.
		 * */
		getActivityById(elementId: string): any;
		
		_runDiscard(discardContent: any): void;
		
		_discardRun(): void;
		
		_onShakeMessage(sourceMessage: any): any;
		
		_shakeOutbound(sourceMessage: any): any;
		
		_consumeInbound(): import("smqp").Consumer | undefined;
		
		_onInbound(routingKey: any, message: any): void;
		
		_onInboundEvent(routingKey: any, message: any): any;
		
		_consumeRunQ(): void;
		
		_pauseRunQ(): void;
		
		_onRunMessage(routingKey: any, message: any, messageProperties: any): any;
		
		_continueRunMessage(routingKey: any, message: any): any;
		
		_onExecutionMessage(routingKey: any, message: any): any;
		
		_ackRunExecuteMessage(): void;
		
		_doRunLeave(message: any, isDiscarded: any, onOutbound: any): any;
		
		_doOutbound(fromMessage: any, isDiscarded: any, callback: any): any;
		
		_doRunOutbound(outboundList: any, content: any, discardSequence: any): any;
		
		_publishRunOutbound(outboundFlow: any, content: any, discardSequence: any): void;
		
		_onResumeMessage(message: any): any;
		
		_publishEvent(state: any, content: any, properties: any): void;
		
		_onStop(message: any): void;
		
		_consumeApi(): void;
		
		_onApiMessage(routingKey: any, message: any): any;
		
		_createMessage(override: any): any;
		
		_getOutboundSequenceFlowById(flowId: any): SequenceFlow_1 | undefined;
		
		_deactivateRunConsumers(): void;
		
		private [K_ACTIVITY_DEF];
		
		private [K_COUNTERS];
		
		private [K_FLOWS];
		
		private [K_FLAGS];
		
		private [K_EXEC];
		
		private [K_MESSAGE_HANDLERS];
		
		private [K_EVENT_DEFINITIONS];
		
		private [K_EXTENSIONS];
		
		private [K_CONSUMING];
		
		private [K_CONSUMING_RUN_Q];
		
		private [K_ACTIVATED];
		
		private [K_STATE_MESSAGE];
		
		private [K_EXECUTE_MESSAGE];
	}
	const K_ACTIVITY_DEF: unique symbol;
	const K_FLOWS: unique symbol;
	const K_FLAGS: unique symbol;
	const K_EXEC: unique symbol;
	const K_EVENT_DEFINITIONS: unique symbol;
	const K_CONSUMING_RUN_Q: unique symbol;
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
	export function Context(definitionContext: import("moddle-context-serializer").SerializableContext, environment?: Environment_1): ContextInstance_1;
	/**
	 * Per-execution registry that lazily upserts activities, flows, and processes from the parsed BPMN definition.
	 * @param owner Process or sub-process activity that owns this context
	 */
	function ContextInstance_1(definitionContext: import("moddle-context-serializer").SerializableContext, environment: Environment_1, owner?: Process_1 | Activity): void;
	class ContextInstance_1 {
		/**
		 * Per-execution registry that lazily upserts activities, flows, and processes from the parsed BPMN definition.
		 * @param owner Process or sub-process activity that owns this context
		 */
		constructor(definitionContext: import("moddle-context-serializer").SerializableContext, environment: Environment_1, owner?: Process_1 | Activity);
		id: string;
		name: string;
		type: string;
		sid: string;
		definitionContext: import("moddle-context-serializer").SerializableContext;
		environment: Environment_1;
		extensionsMapper: ExtensionsMapper;
		refs: Map<string, Map<any, any>>;
		get owner(): Activity | Process_1 | undefined;
		/**
		 * Get or create the activity instance for the given id.
		 * */
		getActivityById(activityId: string): any;
		/**
		 * Return the cached activity instance, instantiating it the first time it is referenced.
		 * */
		upsertActivity(activityDef: import("moddle-context-serializer").SerializableElement): any;
		/**
		 * Get or create the sequence flow instance for the given id.
		 * */
		getSequenceFlowById(sequenceFlowId: string): any;
		
		getInboundSequenceFlows(activityId: string): any[];
		
		getOutboundSequenceFlows(activityId: string): any[];
		
		getInboundAssociations(activityId: string): any[];
		
		getOutboundAssociations(activityId: string): any[];
		/**
		 * Get every activity in the definition, optionally narrowed to a parent scope.
		 * @param scopeId Process or sub-process id
		 */
		getActivities(scopeId?: string): any[];
		/**
		 * Get every sequence flow in the definition, optionally narrowed to a parent scope.
		 * @param scopeId Process or sub-process id
		 */
		getSequenceFlows(scopeId?: string): any[];
		/**
		 * Return the cached sequence flow, instantiating it the first time it is referenced.
		 * */
		upsertSequenceFlow(flowDefinition: import("moddle-context-serializer").SerializableElement): any;
		/**
		 * @param scopeId Process or sub-process id
		 */
		getAssociations(scopeId?: string): any[];
		
		upsertAssociation(associationDefinition: import("moddle-context-serializer").SerializableElement): any;
		/**
		 * Create a new context that shares the parsed definition but optionally swaps environment and owner.
		 * 
		 */
		clone(newEnvironment?: Environment_1, newOwner?: Process_1 | Activity): ContextInstance_1;
		/**
		 * Get or create the process instance for the given id. Each process gets its own cloned environment.
		 * */
		getProcessById(processId: string): any;
		/**
		 * Build a fresh, uncached process instance for the given id. Used by call activities.
		 * */
		getNewProcessById(processId: string): any;
		/**
		 * Get every process in the definition.
		 */
		getProcesses(): any[];
		/**
		 * Get processes flagged executable in the definition.
		 */
		getExecutableProcesses(): any[];
		/**
		 * Get message flows that originate from the given process id.
		 * @param sourceId Source process id
		 */
		getMessageFlows(sourceId: string): any[];
		/**
		 * Get or create a data object instance for the given reference id.
		 * */
		getDataObjectById(referenceId: string): any;
		/**
		 * Get or create a data store instance for the given reference id.
		 * */
		getDataStoreById(referenceId: string): any;
		/**
		 * Get start activities, optionally filtered by referenced event definition or restricted to a parent scope.
		 * @param scopeId Process or sub-process id
		 */
		getStartActivities(filterOptions?: startActivityFilterOptions, scopeId?: string): any[];
		/**
		 * Resolve user-registered extensions and the built-in BpmnIO extension for an activity.
		 * Returns undefined when the activity has no extensions to attach.
		 * */
		loadExtensions(activity: ElementBase): Extensions | undefined;
		/**
		 * Resolve the parent process or sub-process activity that owns the given activity.
		 * */
		getActivityParentById(activityId: string): any;
		
		private [K_OWNER];
	}
	function ExtensionsMapper(context: any): void;
	class ExtensionsMapper {
		constructor(context: any);
		context: any;
		get(activity: any): Extensions;
		
		_getExtensions(): any[];
	}
	function Extensions(activity: any, context: any, extensions: any): void;
	class Extensions {
		constructor(activity: any, context: any, extensions: any);
		extensions: any[];
		get count(): number;
		activate(message: any): void;
		deactivate(message: any): void;
		
		private [K_ACTIVATED];
	}
	const K_OWNER: unique symbol;
	export function DataObject(dataObjectDef: any, { environment }: {
		environment: any;
	}): void;
	export class DataObject {
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
		_createContent(value: any): {
			id: any;
			type: any;
			name: any;
			value: any;
		};
	}
	export function DataStore(dataStoreDef: any, { environment }: {
		environment: any;
	}): void;
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
		_createContent(value: any): {
			id: any;
			type: any;
			name: any;
			value: any;
		};
	}
	export function DataStoreReference(dataObjectDef: any, { environment }: {
		environment: any;
	}): void;
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
		_createContent(value: any): {
			id: any;
			type: any;
			name: any;
			value: any;
		};
	}
	/**
	 * Top-level wrapper for an executable BPMN definition. Owns its DefinitionExecution and
	 * mediates inter-process messaging.
	 * @param options When provided, environment is cloned and settings merged
	 */
	export function Definition(context: ContextInstance, options?: EnvironmentOptions): Definition;
	export class Definition {
		/**
		 * Top-level wrapper for an executable BPMN definition. Owns its DefinitionExecution and
		 * mediates inter-process messaging.
		 * @param options When provided, environment is cloned and settings merged
		 */
		constructor(context: ContextInstance, options?: EnvironmentOptions);
		id: string | undefined;
		type: string | undefined;
		name: string | undefined;
		environment: Environment_1 | undefined;
		context: ContextInstance | undefined;
		broker: import("smqp").default | undefined;
		on: any;
		once: any;
		waitFor: any;
		emit: any;
		emitFatal: any;
		logger: ILogger | undefined;
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
		 */
		getState(): any;
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
		
		_shakeProcess(shakeBp: any, startId: any): any;
		/**
		 * Get every process in the definition.
		 */
		getProcesses(): any;
		/**
		 * Get processes flagged executable in the definition.
		 */
		getExecutableProcesses(): any;
		/**
		 * Get processes that are currently running.
		 */
		getRunningProcesses(): any;
		
		getProcessById(processId: string): any;
		/**
		 * Find an activity by id across all processes in the definition.
		 * */
		getActivityById(childId: string): any;
		/**
		 * Lookup any element (activity, flow, etc.) in the parsed definition by id.
		 * */
		getElementById(elementId: string): any;
		/**
		 * List currently postponed activities as Api wrappers.
		 * 
		 */
		getPostponed(...args: any[]): any;
		/**
		 * Resolve a Definition Api wrapper, preferring the running execution if any.
		 * @throws {Error} when the definition is not running and no message is given
		 */
		getApi(message?: ElementBrokerMessage): any;
		/**
		 * Send a delegated signal to the running definition.
		 * 
		 */
		signal(message?: signalMessage): any;
		/**
		 * Cancel a running activity inside the definition by delegated api message.
		 * 
		 */
		cancelActivity(message?: signalMessage): any;
		/**
		 * Deliver a message to a referenced element. Resolves the message reference when the
		 * target element exposes a `resolve` method (e.g. message-, signal-, escalation events).
		 * */
		sendMessage(message: {
			id?: string;
			[x: string]: any;
		}): any;
		/**
		 * Stop the definition if running.
		 */
		stop(): void;
		
		_activateRunConsumers(): void;
		
		_deactivateRunConsumers(): void;
		
		_createMessage(override: any): any;
		
		_onRunMessage(routingKey: any, message: any): any;
		
		_onResumeMessage(message: any): any;
		
		_onExecutionMessage(routingKey: any, message: any): void;
		
		_onApiMessage(routingKey: any, message: any): void;
		
		_publishEvent(action: any, content: any, msgOpts: any): void;
		
		_onStop(): void;
		
		_onBrokerReturnFn(message: any): void;
		
		_reset(): void;
		
		_debug(msg: any): void;
		
		private [K_COUNTERS];
		
		private [K_STOPPED];
		
		private [K_EXECUTION];
		
		private [K_MESSAGE_HANDLERS];
		
		private [K_STATUS];
		
		private [K_CONSUMING];
		
		private [K_STATE_MESSAGE];
		
		private [K_EXECUTE_MESSAGE];
	}
	export function Category(activityDef: any): {
		id: any;
		type: any;
		name: any;
		behaviour: any;
		parent: any;
		placeholder: boolean;
	};
	/**
	 * Holds global execution config: variables, injected services, timers, scripts engine,
	 * expressions, Logger factory, and settings such as `batchSize`. Cloned and merged per Definition.
	 * 
	 */
	export function Environment(options?: EnvironmentOptions): void;
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
		scripts: IScripts | Scripts;
		timers: ITimers | Timers;
		settings: {
			enableDummyService?: boolean;
			step?: boolean;
			strict?: boolean;
			batchSize?: number;
			disableTrackState?: boolean;
			skipDiscard: boolean;
		};
		Logger: LoggerFactory | typeof DummyLogger;
		/**
		 * Snapshot environment state for recover.
		 */
		getState(): {
			settings: {
				enableDummyService?: boolean;
				step?: boolean;
				strict?: boolean;
				batchSize?: number;
				disableTrackState?: boolean;
				skipDiscard: boolean;
			};
			variables: {
				[x: string]: any;
			};
			output: any;
		};
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
		
		private [K_SERVICES];
		
		private [K_VARIABLES];
	}
	function DummyLogger(): {
		debug: () => void;
		error: () => void;
		warn: () => void;
	};
	const K_SERVICES: unique symbol;
	const K_VARIABLES: unique symbol;
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
	export function InputOutputSpecification(activity: any, ioSpecificationDef: any, context: any): void;
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
		_onActivityEvent(routingKey: any, message: any): any;
		_onFormatEnter(): any;
		_onFormatComplete(message: any): any;
		_getDataOutputs(dataOutputs: any): any;
		
		private [K_CONSUMING];
	}
	export function Message(messageDef: any, context: any): {
		id: any;
		type: any;
		name: any;
		parent: any;
		resolve: (executionMessage: any) => any;
	};
	/**
	 * Process lane. Wraps a `<bpmn:lane>` definition and points back to its owning process;
	 * activities reference their lane through `Activity.lane`.
	 * */
	export function Lane(process: Process_1, laneDefinition: import("moddle-context-serializer").SerializableElement): void;
	export class Lane {
		/**
		 * Process lane. Wraps a `<bpmn:lane>` definition and points back to its owning process;
		 * activities reference their lane through `Activity.lane`.
		 * */
		constructor(process: Process_1, laneDefinition: import("moddle-context-serializer").SerializableElement);
		id: string | undefined;
		type: string | undefined;
		name: any;
		parent: {
			id: string;
			type: string;
		};
		behaviour: {
			[x: string]: any;
		};
		environment: Environment_1;
		broker: ElementBroker<Process_1>;
		context: ContextInstance;
		logger: ILogger;
		get process(): Process_1;
		
		private [K_PROCESS];
	}
	const K_PROCESS: unique symbol;
	export function MultiInstanceLoopCharacteristics(activity: any, loopCharacteristics: any): void;
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
	/**
	 * Owns one `<bpmn:process>`. Wraps the structural definition and orchestrates flow traversal,
	 * joins, and parallel activation through ProcessExecution.
	 * */
	export function Process(processDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance): void;
	export class Process {
		/**
		 * Owns one `<bpmn:process>`. Wraps the structural definition and orchestrates flow traversal,
		 * joins, and parallel activation through ProcessExecution.
		 * */
		constructor(processDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance);
		id: string | undefined;
		type: string;
		name: any;
		parent: any;
		behaviour: Record<string, any>;
		isExecutable: any;
		environment: Environment_1;
		context: ContextInstance;
		broker: import("smqp").default | undefined;
		on: any;
		once: any;
		waitFor: any;
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
		 */
		getState(): {
			id: string | undefined;
			type: string;
			executionId: any;
			environment: EnvironmentState;
			status: any;
			stopped: any;
			counters: any;
			broker: {
				exchanges: {
					bindings?: {
						id: string;
						options: {
							priority: number;
						};
						queueName: string;
						pattern: string;
					}[] | undefined;
					deliveryQueue?: {
						name: string;
						options: import("smqp").QueueOptions;
						messages?: import("smqp").MessageEnvelope[];
					} | undefined;
					name: string;
					type: import("smqp").exchangeType;
					options: {
						[x: string]: any;
						durable?: boolean;
						autoDelete?: boolean;
					};
				}[] | undefined;
				queues: {
					name: string;
					options: import("smqp").QueueOptions;
					messages?: import("smqp").MessageEnvelope[];
				}[] | undefined;
			} | undefined;
			execution: any;
		};
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
		 * 
		 */
		getApi(message?: ElementBrokerMessage): any;
		/**
		 * Send a delegated signal to the running process.
		 * 
		 */
		signal(message?: signalMessage): any;
		/**
		 * Cancel a running activity inside the process by delegated api message.
		 * 
		 */
		cancelActivity(message?: signalMessage): any;
		
		_activateRunConsumers(): void;
		
		_deactivateRunConsumers(): void;
		
		_onRunMessage(routingKey: any, message: any): any;
		
		_onResumeMessage(message: any): any;
		
		_onExecutionMessage(routingKey: any, message: any): void;
		
		_publishEvent(state: any, content: any): void;
		/**
		 * Deliver a message to a target activity or start activity that references it.
		 * Starts the process if a target is found and the process is idle.
		 * */
		sendMessage(message: ElementBrokerMessage): void;
		
		getActivityById(childId: string): any;
		/**
		 * Get every activity in the process scope.
		 */
		getActivities(): any;
		/**
		 * Get start activities, optionally filtered by referenced event definition.
		 * 
		 */
		getStartActivities(filterOptions?: startActivityFilterOptions): Activity[];
		/**
		 * Get sequence flows in the process scope.
		 */
		getSequenceFlows(): any;
		
		getLaneById(laneId: string): any;
		/**
		 * List currently postponed activities as Api wrappers.
		 * 
		 */
		getPostponed(...args: any[]): any;
		
		_onApiMessage(routingKey: any, message: any): void;
		
		_onStop(): void;
		
		_createMessage(override: any): any;
		
		_debug(msg: any): void;
		
		private [K_COUNTERS];
		
		private [K_CONSUMING];
		
		private [K_EXECUTION];
		
		private [K_STATUS];
		
		private [K_STOPPED];
		
		private [K_MESSAGE_HANDLERS];
		
		private [K_LANES];
		
		private [K_EXTENSIONS];
		
		private [K_STATE_MESSAGE];
		
		private [K_EXECUTE_MESSAGE];
	}
	const K_LANES: unique symbol;
	export function Properties(activity: any, propertiesDef: any, context: any): void;
	export class Properties {
		constructor(activity: any, propertiesDef: any, context: any);
		activity: any;
		broker: any;
		activate(message: any): void;
		deactivate(): void;
		_onActivityEvent(routingKey: any, message: any): any;
		_formatOnEnter(message: any): any;
		_formatOnComplete(message: any): any;
		_getProperties(message: any, values: any): {};
		[K_PROPERTIES]: {
			properties: Set<any>;
			dataInputObjects: Set<any>;
			dataOutputObjects: Set<any>;
		};
		
		private [K_CONSUMING];
	}
	const K_PROPERTIES: unique symbol;
	export function ServiceImplementation(activity: any): void;
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
	export function Timers(options: any): void;
	export class Timers {
		constructor(options: any);
		count: number;
		options: any;
		setTimeout: any;
		clearTimeout: any;
		get executing(): any[];
		register(owner: any): RegisteredTimers;
		_setTimeout(owner: any, callback: any, delay: any, ...args: any[]): Timer_1;
		_getReference(owner: any, callback: any, delay: any, args: any): Timer_1;
		
		private [K_EXECUTING];
	}
	function RegisteredTimers(timersApi: any, owner: any): void;
	class RegisteredTimers {
		constructor(timersApi: any, owner: any);
		owner: any;
		setTimeout: any;
		clearTimeout: any;
		
		private [K_TIMER_API];
	}
	function Timer_1(owner: any, timerId: any, callback: any, delay: any, args: any): void;
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
	const K_EXECUTING: unique symbol;
	const K_TIMER_API: unique symbol;
	export class ActivityError extends Error {
		constructor(description: any, sourceMessage: any, inner: any);
		type: string;
		name: any;
		description: any;
		source: {
			fields: any;
			content: any;
			properties: any;
		} | undefined;
		inner: any;
		code: any;
	}
	export class RunError extends ActivityError {
		constructor(...args: any[]);
	}
	export function CallActivity(activityDef: any, context: any): Activity;
	export function ReceiveTask(activityDef: any, context: any): Activity;
	export function ScriptTask(activityDef: any, context: any): Activity;
	export function ServiceTask(activityDef: any, context: any): Activity;
	export function SignalTask(activityDef: any, context: any): Activity;
	export function SubProcess(activityDef: any, context: any): Activity;
	export function Task(activityDef: any, context: any): Activity;
	export function Transaction(activityDef: any, context: any): Activity;
	/**
	 * Association connecting a source and target activity. Used to drive compensation —
	 * activities marked `isForCompensation` subscribe to inbound association events.
	 * */
	export function Association(associationDef: import("moddle-context-serializer").SerializableElement, { environment }: ContextInstance): void;
	export class Association {
		/**
		 * Association connecting a source and target activity. Used to drive compensation —
		 * activities marked `isForCompensation` subscribe to inbound association events.
		 * */
		constructor(associationDef: import("moddle-context-serializer").SerializableElement, { environment }: ContextInstance);
		id: string | undefined;
		type: string;
		name: any;
		parent: any;
		behaviour: Record<string, any>;
		sourceId: any;
		targetId: any;
		isAssociation: boolean;
		environment: Environment_1;
		logger: ILogger;
		broker: import("smqp").default | undefined;
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
		 * 
		 */
		getApi(message?: ElementBrokerMessage): Api_1;
		/**
		 * Stop the association's broker.
		 */
		stop(): void;
		
		_publishEvent(action: any, content: any): void;
		
		_createMessageContent(override: any): any;
		
		private [K_COUNTERS];
	}
	/**
	 * Message flow connecting a source activity (or process) to a target. Subscribes to the
	 * source's `end` event and publishes `message.outbound` whenever the source completes,
	 * carrying any message payload through to the target.
	 * */
	export function MessageFlow(flowDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance): void;
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
		parent: any;
		source: any;
		target: any;
		behaviour: Record<string, any>;
		environment: Environment_1;
		context: ContextInstance;
		broker: import("smqp").default | undefined;
		on: any;
		once: any;
		emit: any;
		waitFor: any;
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
		 * 
		 */
		getApi(message?: ElementBrokerMessage): Api_1;
		/**
		 * Subscribe to the source element's message and end events to bridge the message across.
		 */
		activate(): void;
		/**
		 * Cancel the source element subscriptions added by activate.
		 */
		deactivate(): void;
		
		_onSourceEnd({ content }: {
			content: any;
		}): void;
		
		_createMessageContent(message: any): {
			id: string | undefined;
			type: string;
			name: any;
			source: any;
			target: any;
			parent: any;
			message: any;
		};
		
		private [K_COUNTERS];
		
		private [K_SOURCE_ELEMENT];
	}
	const K_SOURCE_ELEMENT: unique symbol;
	/**
	 * Sequence flow connecting two activities. Owns its broker and publishes take/discard/looped
	 * events; activities subscribe to drive their inbound queue.
	 * */
	export function SequenceFlow(flowDef: import("moddle-context-serializer").SerializableElement, { environment }: ContextInstance): void;
	export class SequenceFlow {
		/**
		 * Sequence flow connecting two activities. Owns its broker and publishes take/discard/looped
		 * events; activities subscribe to drive their inbound queue.
		 * */
		constructor(flowDef: import("moddle-context-serializer").SerializableElement, { environment }: ContextInstance);
		id: string | undefined;
		type: string;
		name: any;
		parent: any;
		behaviour: Record<string, any>;
		sourceId: any;
		targetId: any;
		isDefault: any;
		isSequenceFlow: boolean;
		environment: Environment_1;
		logger: ILogger;
		broker: import("smqp").default | undefined;
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
		 * 
		 */
		getApi(message?: ElementBrokerMessage): Api_1;
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
		 * 
		 */
		createMessage(override?: Record<string, any>): {
			id: string | undefined;
			type: string;
			name: any;
			sourceId: any;
			targetId: any;
			isSequenceFlow: boolean;
			isDefault: any;
			parent: any;
		};
		/**
		 * Evaluate the flow's condition for the source activity message. Default flows are always taken.
		 * @param fromMessage Source activity message
		 * @param callback Callback with truthy result if flow should be taken
		 */
		evaluate(fromMessage: ElementBrokerMessage, callback: (err: Error | null, result?: boolean | object) => void): void;
		
		_publishEvent(action: any, content: any): void;
		
		private [K_COUNTERS];
	}
  class ElementBase {
	get id(): string;
	get type(): string;
	get name(): string;
	get parent(): ElementParent;
	get behaviour(): SerializableElement;
	get broker(): Broker;
	get environment(): Environment_1;
	get context(): ContextInstance;
	get logger(): ILogger;
  }

  class Element<T> extends ElementBase {
	get broker(): ElementBroker<T>;
	stop(): void;
	resume(): void;
	getApi(message?: ElementBrokerMessage): Api<T>;
	on(eventName: string, callback: CallableFunction, options?: any): any;
	once(eventName: string, callback: CallableFunction, options?: any): any;
	waitFor(eventName: string, options?: any): Promise<Api<T>>;
  }

  interface Api<T> extends ElementBrokerMessage {
	get id(): string;
	get type(): string;
	get name(): string;
	get executionId(): string;
	get environment(): Environment_1;
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

  class Environment_1 {
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
	recover(state?: EnvironmentState): Environment_1;
	clone(overrideOptions?: EnvironmentOptions): Environment_1;
	assignVariables(newVars: Record<string, any>): void;
	assignSettings(newSettings: Record<string, any>): Environment_1;
	registerScript(activity: any): Script;
	getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
	getServiceByName(serviceName: string): CallableFunction;
	resolveExpression(expression: string, message?: ElementBrokerMessage, expressionFnContext?: any): any;
	addService(name: string, fn: CallableFunction): void;
  }
  class ContextInstance {
	constructor(definitionContext: SerializableContext, environment?: Environment_1);
	get id(): string;
	get name(): string;
	get type(): string;
	/** Unique context instance id */
	get sid(): string;
	get definitionContext(): SerializableContext;
	get environment(): Environment_1;
	/** Context owner, Process or SubProcess activity */
	get owner(): Process_1 | Activity | undefined;
	getActivityById<T>(activityId: string): T;
	getSequenceFlowById(sequenceFlowId: string): SequenceFlow_1;
	getInboundSequenceFlows(activityId: string): SequenceFlow_1[];
	getOutboundSequenceFlows(activityId: string): SequenceFlow_1[];
	getInboundAssociations(activityId: string): Association_1[];
	getOutboundAssociations(activityId: string): Association_1[];
	getActivities(scopeId?: string): ElementBase[];
	getSequenceFlows(scopeId?: string): SequenceFlow_1[];
	getAssociations(scopeId?: string): Association_1[];
	clone(newEnvironment?: Environment_1): ContextInstance;
	getProcessById(processId: string): Process_1;
	getNewProcessById(processId: string): Process_1;
	getProcesses(): Process_1[];
	getExecutableProcesses(): Process_1[];
	getMessageFlows(sourceId: string): MessageFlow_1[];
	getDataObjectById(referenceId: string): any;
	getDataStoreById(referenceId: string): any;
	getStartActivities(filterOptions?: startActivityFilterOptions, scopeId?: string): Activity[];
	loadExtensions(activity: ElementBase): IExtension;
  }

  class Process_1 extends Element<Process_1> {
	constructor(processDef: SerializableElement, context: ContextInstance);
	get isExecutable(): boolean;
	get counters(): completedCounters;
	get lanes(): Lane_1[] | undefined;
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
	recover(state?: ProcessState): Process_1;
	shake(startId?: string): void;
	signal(message: any): any;
	cancelActivity(message: any): any;
	sendMessage(message: any): void;
	getActivityById<T>(childId: string): T;
	getActivities(): Activity[];
	getStartActivities(filterOptions?: startActivityFilterOptions): Activity[];
	getSequenceFlows(): SequenceFlow_1[];
	getLaneById(laneId: string): Lane_1 | undefined;
	getPostponed(filterFn: filterPostponed): Api<ElementBase>[];
  }

  interface ProcessExecution {
	get isSubProcess(): boolean;
	get broker(): Broker;
	get environment(): Environment_1;
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
	getSequenceFlows(): SequenceFlow_1[];
	getApi(message?: ElementBrokerMessage): Api<ElementBase>;
  }

  class Lane_1 extends ElementBase {
	constructor(process: Process_1, laneDefinition: SerializableElement);
	/** Process broker */
	get broker(): Broker;
	get process(): Process_1;
  }

  class SequenceFlow_1 extends Element<SequenceFlow_1> {
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
	 * @param callback Callback with evaluation result, if truthy flow should be taken
	 */
	evaluate(fromMessage: ElementBrokerMessage, callback: (err: Error, result: any) => void): void;
	getState(): SequenceFlowState | undefined;
  }

  class MessageFlow_1 extends Element<MessageFlow_1> {
	constructor(flowDef: SerializableElement, context: ContextInstance);
	get source(): MessageFlowReference;
	get target(): MessageFlowReference;
	get counters(): { messages: number };
	activate(): void;
	deactivate(): void;
	getState(): MessageFlowState | undefined;
  }

  class Association_1 extends Element<Association_1> {
	constructor(associationDef: SerializableElement, context: ContextInstance);
	get sourceId(): string;
	get targetId(): string;
	get isAssociation(): boolean;
	get counters(): { take: number; discard: number };
	take(content?: any): boolean;
	discard(content?: any): boolean;
	getState(): AssociationState | undefined;
  }
  interface ElementBroker<T> extends Broker {
	get owner(): T;
  }

  type signalMessage = {
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

  interface ElementMessageContent {
	id?: string;
	type?: string;
	executionId?: string;
	parent?: ElementParent;
	[x: string]: any;
  }

  interface ElementBrokerMessage extends MessageEnvelope {
	content: ElementMessageContent;
  }

  interface ElementParent {
	get id(): string;
	get type(): string;
	get executionId(): string;
	get path(): ElementParent[];
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

  interface IActivityBehaviour {
	id: string;
	type: string;
	activity: any;
	environment: any;
	new (activity: any, context: any): IActivityBehaviour;
	execute(executeMessage: ElementBrokerMessage): void;
  }

  type Extension = (activity: any, context: any) => IExtension;
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
	referenceId?: string;
	/** Event definition type, i.e. message, signal, error, etc */
	referenceType?: string;
  };

  type filterPostponed = (elementApi: any) => boolean;

  enum ProcessRunStatus {
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
  enum ActivityStatus {
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

  interface ElementState {
	id: string;
	type: string;
	broker?: BrokerState;
	[x: string]: any;
  }

  interface EnvironmentState {
	settings: EnvironmentSettings;
	variables: Record<string, any>;
	output: Record<string, any>;
  }

  type completedCounters = { completed: number; discarded: number };

  interface ActivityExecutionState {
	completed: boolean;
	[x: string]: any;
  }

  interface ActivityState extends ElementState {
	status?: string;
	executionId: string;
	stopped: boolean;
	counters: { taken: number; discarded: number };
	execution?: ActivityExecutionState;
  }

  interface SequenceFlowState extends ElementState {
	counters: { take: number; discard: number; looped: number };
  }

  interface MessageFlowState extends ElementState {
	counters: { messages: number };
  }

  interface AssociationState extends ElementState {
	counters: { take: number; discard: number };
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
	stopped: boolean;
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
	stopped: boolean;
	executionId?: string;
	counters: completedCounters;
	environment: EnvironmentState;
	execution?: DefinitionExecutionState;
  }

  type runCallback = (err: Error, definitionApi: any) => void;

  interface MessageFlowReference {
	/** activity id */
	get id(): string;
	get processId(): string;
  }

  type LoggerFactory = (scope: string) => ILogger;

  interface ILogger {
	debug(...args: any[]): void;
	error(...args: any[]): void;
	warn(...args: any[]): void;
	[x: string]: any;
  }

  type wrappedSetTimeout = (handler: CallableFunction, delay: number, ...args: any[]) => Timer;
  type wrappedClearTimeout = (ref: any) => void;

  interface Timer {
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

  interface IScripts {
	register(activity: any): Script | undefined;
	getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
  }

  interface Script {
	execute(executionContext: any, callback: CallableFunction): void;
  }
	const K_ACTIVATED: unique symbol;
	const K_COMPLETED: unique symbol;
	const K_CONSUMING: unique symbol;
	const K_COUNTERS: unique symbol;
	const K_EXECUTE_MESSAGE: unique symbol;
	const K_EXECUTION: unique symbol;
	const K_EXTENSIONS: unique symbol;
	const K_MESSAGE_HANDLERS: unique symbol;
	const K_MESSAGE_Q: unique symbol;
	const K_REFERENCE_ELEMENT: unique symbol;
	const K_REFERENCE_INFO: unique symbol;
	const K_STATE_MESSAGE: unique symbol;
	const K_STATUS: unique symbol;
	const K_STOPPED: unique symbol;
	export function BoundaryEvent(activityDef: any, context: any): Activity;
	export function EndEvent(activityDef: any, context: any): Activity;
	export function IntermediateCatchEvent(activityDef: any, context: any): Activity;
	export function IntermediateThrowEvent(activityDef: any, context: any): Activity;
	export function StartEvent(activityDef: any, context: any): Activity;
	export function CancelEventDefinition(activity: any, eventDefinition: any): void;
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
		_onCatchMessage(_: any, message: any): any;
		_complete(output: any): any;
		_onApiMessage(routingKey: any, message: any): any;
		_stop(): void;
		_debug(msg: any): void;
		
		private [K_EXECUTE_MESSAGE];
		
		private [K_COMPLETED];
	}
	export function CompensateEventDefinition(activity: any, eventDefinition: any, context: any): void;
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
		_onCollect(routingKey: any, message: any): any;
		_onCompensateApiMessage(routingKey: any, message: any): any;
		_compensate(): any;
		_onCollected(routingKey: any, message: any): any;
		_onDiscardApiMessage(routingKey: any, message: any): any;
		_onApiMessage(routingKey: any, message: any): any;
		_stopCollect(): void;
		_stop(): void;
		_debug(msg: any): void;
		
		private [K_COMPLETED];
		
		private [K_ASSOCIATIONS];
		
		private [K_MESSAGE_Q];
		
		private [K_COMPENSATE_Q];
		
		private [K_EXECUTE_MESSAGE];
	}
	const K_ASSOCIATIONS: unique symbol;
	const K_COMPENSATE_Q: unique symbol;
	export function ConditionalEventDefinition(activity: any, eventDefinition: any, _context: any, index: any): void;
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
		_setup(executeMessage: any): void;
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
		_onDelegateApiMessage(routingKey: any, message: any): void;
		_onApiMessage(routingKey: any, message: any): any;
		_stop(): void;
		_debug(msg: any): void;
		
		private [K_EXECUTE_MESSAGE];
	}
	export function ErrorEventDefinition(activity: any, eventDefinition: any): void;
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
		_onErrorMessage(routingKey: any, message: any): any;
		_onThrowApiMessage(routingKey: any, message: any): any;
		_catchError(routingKey: any, message: any, error: any): any;
		_onApiMessage(routingKey: any, message: any): any;
		_stop(): void;
		_getReferenceInfo(message: any): {
			message: any;
		} | {
			message: any;
			description: string;
		};
		_debug(msg: any): void;
		[K_REFERENCE_ELEMENT]: any;
		
		private [K_COMPLETED];
		
		private [K_MESSAGE_Q];
		
		private [K_EXECUTE_MESSAGE];
		[K_REFERENCE_INFO]: {
			message: any;
		} | {
			message: any;
			description: string;
		} | undefined;
	}
	export function EscalationEventDefinition(activity: any, eventDefinition: any): void;
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
		_onCatchMessage(routingKey: any, message: any): any;
		_onApiMessage(routingKey: any, message: any): any;
		_stop(): void;
		_getReferenceInfo(message: any): {
			message: any;
		} | {
			message: any;
			description: string;
		};
		_debug(msg: any): void;
		[K_REFERENCE_ELEMENT]: any;
		
		private [K_COMPLETED];
		
		private [K_MESSAGE_Q];
		
		private [K_EXECUTE_MESSAGE];
		[K_REFERENCE]: {
			message: any;
		} | {
			message: any;
			description: string;
		} | undefined;
	}
	const K_REFERENCE: unique symbol;
	export function LinkEventDefinition(activity: any, eventDefinition: any): void;
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
		_onLinkApiMessage(_: any, message: any): void;
		_onShakeMessage(_: any, message: any): void;
		
		private [K_EXECUTE_MESSAGE];
	}
	export function MessageEventDefinition(activity: any, eventDefinition: any): void;
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
		_onCatchMessage(routingKey: any, message: any): void;
		_onApiMessage(routingKey: any, message: any): any;
		_complete(verb: any, output: any, options: any): any;
		_stop(): void;
		_getReferenceInfo(message: any): {
			message: any;
		} | {
			message: any;
			description: string;
		};
		_debug(msg: any): void;
		[K_REFERENCE_ELEMENT]: any;
		
		private [K_COMPLETED];
		
		private [K_MESSAGE_Q];
		
		private [K_EXECUTE_MESSAGE];
		[K_REFERENCE_INFO]: {
			message: any;
		} | {
			message: any;
			description: string;
		} | undefined;
	}
	export function SignalEventDefinition(activity: any, eventDefinition: any): void;
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
		_onCatchMessage(routingKey: any, message: any): any;
		_onApiMessage(routingKey: any, message: any): any;
		_complete(output: any, options: any): any;
		_stop(): void;
		_getReferenceInfo(message: any): {
			message: any;
		} | {
			message: any;
			description: string;
		};
		_debug(msg: any): void;
		[K_REFERENCE_ELEMENT]: any;
		
		private [K_COMPLETED];
		
		private [K_MESSAGE_Q];
		
		private [K_EXECUTE_MESSAGE];
		[K_REFERENCE_INFO]: {
			message: any;
		} | {
			message: any;
			description: string;
		} | undefined;
	}
	export function TerminateEventDefinition(activity: any, eventDefinition: any): void;
	export class TerminateEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		activity: any;
		broker: any;
		logger: any;
		execute(executeMessage: any): void;
	}
	export function TimerEventDefinition(activity: any, eventDefinition: any): void;
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
		execute(executeMessage: any): void;
		startedAt: Date | undefined;
		stop(): void;
		_completed(completeContent: any, options: any): void;
		_onDelegatedApiMessage(routingKey: any, message: any): any;
		_onApiMessage(routingKey: any, message: any): any;
		_stop(): void;
		parse(timerType: any, value: any): {
			expireAt: Date | undefined;
			repeat: number | undefined;
			delay: number | undefined;
		};
		_getTimers(executeMessage: any): {
			expireAt?: Date | undefined;
		};
		_debug(msg: any): void;
		
		private [K_STOPPED];
		
		private [K_TIMER];
		[K_TIMER_CONTENT]: any;
	}
	const K_TIMER: unique symbol;
	const K_TIMER_CONTENT: unique symbol;
	function Scripts(): void;
	class Scripts {
		getScript(): void;
		register(): void;
	}
	export function EventBasedGateway(activityDef: any, context: any): Activity;
	export function ExclusiveGateway(activityDef: any, context: any): Activity;
	export function InclusiveGateway(activityDef: any, context: any): Activity;
	export function ParallelGateway(activityDef: any, context: any): Activity;
	export class ParallelGateway {
		constructor(activityDef: any, context: any);
		id: string | undefined;
	}
	/**
	 * Lightweight wrapper over the broker that exposes signal/cancel/fail/stop and other api actions.
	 * @param pfx Message prefix, e.g. `activity`, `process`, `definition`, `flow`
	 * @param sourceMessage Cloned to back the api
	 * @param environment Defaults to `broker.owner.environment`
	 * @throws {Error} when sourceMessage is missing
	 */
	function Api_1(pfx: string, broker: any, sourceMessage: ElementBrokerMessage, environment?: Environment_1): void;
	class Api_1 {
		/**
		 * Lightweight wrapper over the broker that exposes signal/cancel/fail/stop and other api actions.
		 * @param pfx Message prefix, e.g. `activity`, `process`, `definition`, `flow`
		 * @param sourceMessage Cloned to back the api
		 * @param environment Defaults to `broker.owner.environment`
		 * @throws {Error} when sourceMessage is missing
		 */
		constructor(pfx: string, broker: any, sourceMessage: ElementBrokerMessage, environment?: Environment_1);
		id: any;
		type: any;
		name: any;
		executionId: any;
		environment: any;
		content: any;
		fields: any;
		messageProperties: any;
		broker: any;
		owner: any;
		messagePrefix: string;
		/**
		 * Send a cancel api message.
		 * 
		 */
		cancel(message?: signalMessage, options?: any): void;
		/**
		 * Send a discard api message.
		 */
		discard(): void;
		/**
		 * Send an error api message that fails the activity.
		 * */
		fail(error: Error): void;
		/**
		 * Send a signal api message.
		 * 
		 */
		signal(message?: signalMessage, options?: any): void;
		/**
		 * Send a stop api message.
		 */
		stop(): void;
		/**
		 * Resolve an expression with the api message as scope and the broker owner as context.
		 * */
		resolveExpression(expression: string): any;
		/**
		 * Publish a custom api message to the broker.
		 * @param action Routing key suffix, e.g. `signal`, `cancel`
		 * @param content Merged into the message content
		 * 
		 */
		sendApiMessage(action: string, content?: signalMessage, options?: any): void;
		/**
		 * List currently postponed activities, falling back to a sub-process execution when applicable.
		 * 
		 */
		getPostponed(...args: any[]): any;
		/**
		 * Build a message body by merging the given content onto the source content.
		 * 
		 */
		createMessage(content?: Record<string, any>): any;
	}
	/**
	 * Script condition
	 * */
	function ScriptCondition(owner: ElementBase, script: any, language: string): void;
	class ScriptCondition {
		/**
		 * Script condition
		 * */
		constructor(owner: ElementBase, script: any, language: string);
		type: string;
		language: string;
		_owner: ElementBase;
		_script: any;
		/**
		 * Execute
		 * */
		execute(message: any, callback: CallableFunction): any;
	}
	/**
	 * Expression condition
	 * */
	function ExpressionCondition(owner: ElementBase, expression: string): void;
	class ExpressionCondition {
		/**
		 * Expression condition
		 * */
		constructor(owner: ElementBase, expression: string);
		type: string;
		expression: string;
		_owner: ElementBase;
		/**
		 * Execute
		 * */
		execute(message: any, callback: CallableFunction): any;
	}

	export {};
}

declare module 'bpmn-elements/events' {
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableContext, SerializableElement } from 'moddle-context-serializer';
	export function BoundaryEvent(activityDef: any, context: any): Activity;
	export function BoundaryEventBehaviour(activity: any): void;
	export class BoundaryEventBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		attachedTo: any;
		activity: any;
		environment: any;
		broker: any;
		execute(executeMessage: any): any;
		_onExecutionMessage(routingKey: any, message: any): any;
		_onCompleted(_: any, { content }: {
			content: any;
		}): any;
		_onAttachedLeave(_: any, { content }: {
			content: any;
		}): any;
		_onExpectMessage(_: any, { content }: {
			content: any;
		}): void;
		_onDetachMessage(_: any, message: any): void;
		_onApiMessage(_: any, message: any): void;
		_onRepeatMessage(_: any, message: any): void;
		_stop(detach: any): void;
		
		private [K_EXECUTION];
		
		private [K_SHOVELS];
		
		private [K_ATTACHED_TAGS];
		
		private [K_EXECUTE_MESSAGE];
		
		private [K_COMPLETE_CONTENT];
	}
	const K_SHOVELS: unique symbol;
	const K_ATTACHED_TAGS: unique symbol;
	const K_COMPLETE_CONTENT: unique symbol;
	export function EndEvent(activityDef: any, context: any): Activity;
	export function EndEventBehaviour(activity: any): void;
	export class EndEventBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		broker: any;
		execute(executeMessage: any): any;
		
		private [K_EXECUTION];
	}
	export function IntermediateCatchEvent(activityDef: any, context: any): Activity;
	export function IntermediateCatchEventBehaviour(activity: any): void;
	export class IntermediateCatchEventBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		broker: any;
		execute(executeMessage: any): any;
		_onApiMessage(executeMessage: any, routingKey: any, message: any): any;
		
		private [K_EXECUTION];
	}
	export function IntermediateThrowEvent(activityDef: any, context: any): Activity;
	export function IntermediateThrowEventBehaviour(activity: any): void;
	export class IntermediateThrowEventBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		broker: any;
		execute(executeMessage: any): any;
		
		private [K_EXECUTION];
	}
	export function StartEvent(activityDef: any, context: any): Activity;
	export function StartEventBehaviour(activity: any): void;
	export class StartEventBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		activity: any;
		broker: any;
		get executionId(): any;
		execute(executeMessage: any): any;
		_onApiMessage(routingKey: any, message: any): any;
		_onDelegatedApiMessage(routingKey: any, message: any): any;
		_stop(): void;
		
		private [K_EXECUTION];
		
		private [K_EXECUTE_MESSAGE];
	}
	/**
	 * Activity wraps any element (task, event, gateway) and orchestrates its lifecycle through the broker.
	 * @param Behaviour Element-specific behaviour constructor invoked per execution
	 * @param activityDef Parsed BPMN element definition
	 * @param context Per-execution registry and factory
	 */
	function Activity(Behaviour: IActivityBehaviour, activityDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance): void;
	class Activity {
		/**
		 * Activity wraps any element (task, event, gateway) and orchestrates its lifecycle through the broker.
		 * @param Behaviour Element-specific behaviour constructor invoked per execution
		 * @param activityDef Parsed BPMN element definition
		 * @param context Per-execution registry and factory
		 */
		constructor(Behaviour: IActivityBehaviour, activityDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance);
		id: string | undefined;
		type: string;
		name: any;
		behaviour: {
			eventDefinitions: any;
		};
		Behaviour: IActivityBehaviour;
		parent: any;
		logger: ILogger;
		environment: Environment;
		context: ContextInstance;
		broker: import("smqp").default | undefined;
		on: any;
		once: any;
		waitFor: any;
		emitFatal: any;
		/**
		 * Subscribe to inbound flows and start consuming the inbound queue.
		 */
		activate(): 0 | import("smqp").Consumer | undefined;
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
		 */
		getState(): any;
		/**
		 * Restore activity state captured by getState. Cannot be called while running.
		 * @returns this when state was applied
		 * @throws {Error} when activity is currently running
		 */
		recover(state?: ActivityState): this;
		stopped: boolean | undefined;
		status: any;
		/**
		 * Resume after recover. If no run has been started, falls back to activate.
		 * @throws {Error} when called on a running activity
		 */
		resume(): 0 | import("smqp").Consumer | undefined;
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
		stop(): any;
		/**
		 * Advance one run-step when the environment runs in step mode. No-op otherwise.
		 */
		next(): any;
		/**
		 * Walk outbound flows to discover the activity graph from this point.
		 */
		shake(): void;
		/**
		 * Evaluate outbound sequence flows for the given source message.
		 * @param fromMessage Source run message
		 * @param discardRestAtTake When true, take only the first matching flow and discard the rest
		 * */
		evaluateOutbound(fromMessage: ElementBrokerMessage, discardRestAtTake: boolean, callback: (err: Error, evaluationResult: any) => void): any;
		/**
		 * Resolve an Api wrapper for the activity, preferring the running execution if any.
		 * 
		 */
		getApi(message?: ElementBrokerMessage): any;
		/**
		 * Look up another activity in the same context.
		 * */
		getActivityById(elementId: string): any;
		
		_runDiscard(discardContent: any): void;
		
		_discardRun(): void;
		
		_onShakeMessage(sourceMessage: any): any;
		
		_shakeOutbound(sourceMessage: any): any;
		
		_consumeInbound(): import("smqp").Consumer | undefined;
		
		_onInbound(routingKey: any, message: any): void;
		
		_onInboundEvent(routingKey: any, message: any): any;
		
		_consumeRunQ(): void;
		
		_pauseRunQ(): void;
		
		_onRunMessage(routingKey: any, message: any, messageProperties: any): any;
		
		_continueRunMessage(routingKey: any, message: any): any;
		
		_onExecutionMessage(routingKey: any, message: any): any;
		
		_ackRunExecuteMessage(): void;
		
		_doRunLeave(message: any, isDiscarded: any, onOutbound: any): any;
		
		_doOutbound(fromMessage: any, isDiscarded: any, callback: any): any;
		
		_doRunOutbound(outboundList: any, content: any, discardSequence: any): any;
		
		_publishRunOutbound(outboundFlow: any, content: any, discardSequence: any): void;
		
		_onResumeMessage(message: any): any;
		
		_publishEvent(state: any, content: any, properties: any): void;
		
		_onStop(message: any): void;
		
		_consumeApi(): void;
		
		_onApiMessage(routingKey: any, message: any): any;
		
		_createMessage(override: any): any;
		
		_getOutboundSequenceFlowById(flowId: any): SequenceFlow | undefined;
		
		_deactivateRunConsumers(): void;
		
		private [K_ACTIVITY_DEF];
		
		private [K_COUNTERS];
		
		private [K_FLOWS];
		
		private [K_FLAGS];
		
		private [K_EXEC];
		
		private [K_MESSAGE_HANDLERS];
		
		private [K_EVENT_DEFINITIONS];
		
		private [K_EXTENSIONS];
		
		private [K_CONSUMING];
		
		private [K_CONSUMING_RUN_Q];
		
		private [K_ACTIVATED];
		
		private [K_STATE_MESSAGE];
		
		private [K_EXECUTE_MESSAGE];
	}
	const K_ACTIVITY_DEF: unique symbol;
	const K_FLOWS: unique symbol;
	const K_FLAGS: unique symbol;
	const K_EXEC: unique symbol;
	const K_EVENT_DEFINITIONS: unique symbol;
	const K_CONSUMING_RUN_Q: unique symbol;
	const K_ACTIVATED: unique symbol;
	const K_CONSUMING: unique symbol;
	const K_COUNTERS: unique symbol;
	const K_EXECUTE_MESSAGE: unique symbol;
	const K_EXECUTION: unique symbol;
	const K_EXTENSIONS: unique symbol;
	const K_MESSAGE_HANDLERS: unique symbol;
	const K_STATE_MESSAGE: unique symbol;
  class ElementBase {
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

  class Element<T> extends ElementBase {
	get broker(): ElementBroker<T>;
	stop(): void;
	resume(): void;
	getApi(message?: ElementBrokerMessage): Api<T>;
	on(eventName: string, callback: CallableFunction, options?: any): any;
	once(eventName: string, callback: CallableFunction, options?: any): any;
	waitFor(eventName: string, options?: any): Promise<Api<T>>;
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
	getExecuting(): Api<T>[];
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
	assignSettings(newSettings: Record<string, any>): Environment;
	registerScript(activity: any): Script;
	getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
	getServiceByName(serviceName: string): CallableFunction;
	resolveExpression(expression: string, message?: ElementBrokerMessage, expressionFnContext?: any): any;
	addService(name: string, fn: CallableFunction): void;
  }
  class ContextInstance {
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

  class Process extends Element<Process> {
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

  interface ProcessExecution {
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

  class Lane extends ElementBase {
	constructor(process: Process, laneDefinition: SerializableElement);
	/** Process broker */
	get broker(): Broker;
	get process(): Process;
  }

  class SequenceFlow extends Element<SequenceFlow> {
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
	 * @param callback Callback with evaluation result, if truthy flow should be taken
	 */
	evaluate(fromMessage: ElementBrokerMessage, callback: (err: Error, result: any) => void): void;
	getState(): SequenceFlowState | undefined;
  }

  class MessageFlow extends Element<MessageFlow> {
	constructor(flowDef: SerializableElement, context: ContextInstance);
	get source(): MessageFlowReference;
	get target(): MessageFlowReference;
	get counters(): { messages: number };
	activate(): void;
	deactivate(): void;
	getState(): MessageFlowState | undefined;
  }

  class Association extends Element<Association> {
	constructor(associationDef: SerializableElement, context: ContextInstance);
	get sourceId(): string;
	get targetId(): string;
	get isAssociation(): boolean;
	get counters(): { take: number; discard: number };
	take(content?: any): boolean;
	discard(content?: any): boolean;
	getState(): AssociationState | undefined;
  }
  interface ElementBroker<T> extends Broker {
	get owner(): T;
  }

  type signalMessage = {
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

  interface ElementMessageContent {
	id?: string;
	type?: string;
	executionId?: string;
	parent?: ElementParent;
	[x: string]: any;
  }

  interface ElementBrokerMessage extends MessageEnvelope {
	content: ElementMessageContent;
  }

  interface ElementParent {
	get id(): string;
	get type(): string;
	get executionId(): string;
	get path(): ElementParent[];
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

  interface IActivityBehaviour {
	id: string;
	type: string;
	activity: any;
	environment: any;
	new (activity: any, context: any): IActivityBehaviour;
	execute(executeMessage: ElementBrokerMessage): void;
  }

  type Extension = (activity: any, context: any) => IExtension;
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
	referenceId?: string;
	/** Event definition type, i.e. message, signal, error, etc */
	referenceType?: string;
  };

  type filterPostponed = (elementApi: any) => boolean;

  enum ProcessRunStatus {
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
  enum ActivityStatus {
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

  interface ElementState {
	id: string;
	type: string;
	broker?: BrokerState;
	[x: string]: any;
  }

  interface EnvironmentState {
	settings: EnvironmentSettings;
	variables: Record<string, any>;
	output: Record<string, any>;
  }

  type completedCounters = { completed: number; discarded: number };

  interface ActivityExecutionState {
	completed: boolean;
	[x: string]: any;
  }

  interface ActivityState extends ElementState {
	status?: string;
	executionId: string;
	stopped: boolean;
	counters: { taken: number; discarded: number };
	execution?: ActivityExecutionState;
  }

  interface SequenceFlowState extends ElementState {
	counters: { take: number; discard: number; looped: number };
  }

  interface MessageFlowState extends ElementState {
	counters: { messages: number };
  }

  interface AssociationState extends ElementState {
	counters: { take: number; discard: number };
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
	stopped: boolean;
	executionId?: string;
	counters: completedCounters;
	environment: EnvironmentState;
	execution?: ProcessExecutionState;
  }

  interface MessageFlowReference {
	/** activity id */
	get id(): string;
	get processId(): string;
  }

  type LoggerFactory = (scope: string) => ILogger;

  interface ILogger {
	debug(...args: any[]): void;
	error(...args: any[]): void;
	warn(...args: any[]): void;
	[x: string]: any;
  }

  type wrappedSetTimeout = (handler: CallableFunction, delay: number, ...args: any[]) => Timer;
  type wrappedClearTimeout = (ref: any) => void;

  interface Timer {
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

  interface IScripts {
	register(activity: any): Script | undefined;
	getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
  }

  interface Script {
	execute(executionContext: any, callback: CallableFunction): void;
  }

	export {};
}

declare module 'bpmn-elements/eventDefinitions' {
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableContext, SerializableElement } from 'moddle-context-serializer';
	export function CancelEventDefinition(activity: any, eventDefinition: any): void;
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
		_onCatchMessage(_: any, message: any): any;
		_complete(output: any): any;
		_onApiMessage(routingKey: any, message: any): any;
		_stop(): void;
		_debug(msg: any): void;
		
		private [K_EXECUTE_MESSAGE];
		
		private [K_COMPLETED];
	}
	export function CompensateEventDefinition(activity: any, eventDefinition: any, context: any): void;
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
		_onCollect(routingKey: any, message: any): any;
		_onCompensateApiMessage(routingKey: any, message: any): any;
		_compensate(): any;
		_onCollected(routingKey: any, message: any): any;
		_onDiscardApiMessage(routingKey: any, message: any): any;
		_onApiMessage(routingKey: any, message: any): any;
		_stopCollect(): void;
		_stop(): void;
		_debug(msg: any): void;
		
		private [K_COMPLETED];
		
		private [K_ASSOCIATIONS];
		
		private [K_MESSAGE_Q];
		
		private [K_COMPENSATE_Q];
		
		private [K_EXECUTE_MESSAGE];
	}
	const K_ASSOCIATIONS: unique symbol;
	const K_COMPENSATE_Q: unique symbol;
	export function ConditionalEventDefinition(activity: any, eventDefinition: any, _context: any, index: any): void;
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
		_setup(executeMessage: any): void;
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
		_onDelegateApiMessage(routingKey: any, message: any): void;
		_onApiMessage(routingKey: any, message: any): any;
		_stop(): void;
		_debug(msg: any): void;
		
		private [K_EXECUTE_MESSAGE];
	}
	export function ErrorEventDefinition(activity: any, eventDefinition: any): void;
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
		_onErrorMessage(routingKey: any, message: any): any;
		_onThrowApiMessage(routingKey: any, message: any): any;
		_catchError(routingKey: any, message: any, error: any): any;
		_onApiMessage(routingKey: any, message: any): any;
		_stop(): void;
		_getReferenceInfo(message: any): {
			message: any;
		} | {
			message: any;
			description: string;
		};
		_debug(msg: any): void;
		[K_REFERENCE_ELEMENT]: any;
		
		private [K_COMPLETED];
		
		private [K_MESSAGE_Q];
		
		private [K_EXECUTE_MESSAGE];
		[K_REFERENCE_INFO]: {
			message: any;
		} | {
			message: any;
			description: string;
		} | undefined;
	}
	export function EscalationEventDefinition(activity: any, eventDefinition: any): void;
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
		_onCatchMessage(routingKey: any, message: any): any;
		_onApiMessage(routingKey: any, message: any): any;
		_stop(): void;
		_getReferenceInfo(message: any): {
			message: any;
		} | {
			message: any;
			description: string;
		};
		_debug(msg: any): void;
		[K_REFERENCE_ELEMENT]: any;
		
		private [K_COMPLETED];
		
		private [K_MESSAGE_Q];
		
		private [K_EXECUTE_MESSAGE];
		[K_REFERENCE]: {
			message: any;
		} | {
			message: any;
			description: string;
		} | undefined;
	}
	const K_REFERENCE: unique symbol;
	export function LinkEventDefinition(activity: any, eventDefinition: any): void;
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
		_onLinkApiMessage(_: any, message: any): void;
		_onShakeMessage(_: any, message: any): void;
		
		private [K_EXECUTE_MESSAGE];
	}
	export function MessageEventDefinition(activity: any, eventDefinition: any): void;
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
		_onCatchMessage(routingKey: any, message: any): void;
		_onApiMessage(routingKey: any, message: any): any;
		_complete(verb: any, output: any, options: any): any;
		_stop(): void;
		_getReferenceInfo(message: any): {
			message: any;
		} | {
			message: any;
			description: string;
		};
		_debug(msg: any): void;
		[K_REFERENCE_ELEMENT]: any;
		
		private [K_COMPLETED];
		
		private [K_MESSAGE_Q];
		
		private [K_EXECUTE_MESSAGE];
		[K_REFERENCE_INFO]: {
			message: any;
		} | {
			message: any;
			description: string;
		} | undefined;
	}
	export function SignalEventDefinition(activity: any, eventDefinition: any): void;
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
		_onCatchMessage(routingKey: any, message: any): any;
		_onApiMessage(routingKey: any, message: any): any;
		_complete(output: any, options: any): any;
		_stop(): void;
		_getReferenceInfo(message: any): {
			message: any;
		} | {
			message: any;
			description: string;
		};
		_debug(msg: any): void;
		[K_REFERENCE_ELEMENT]: any;
		
		private [K_COMPLETED];
		
		private [K_MESSAGE_Q];
		
		private [K_EXECUTE_MESSAGE];
		[K_REFERENCE_INFO]: {
			message: any;
		} | {
			message: any;
			description: string;
		} | undefined;
	}
	export function TerminateEventDefinition(activity: any, eventDefinition: any): void;
	export class TerminateEventDefinition {
		constructor(activity: any, eventDefinition: any);
		id: any;
		type: any;
		activity: any;
		broker: any;
		logger: any;
		execute(executeMessage: any): void;
	}
	export function TimerEventDefinition(activity: any, eventDefinition: any): void;
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
		execute(executeMessage: any): void;
		startedAt: Date | undefined;
		stop(): void;
		_completed(completeContent: any, options: any): void;
		_onDelegatedApiMessage(routingKey: any, message: any): any;
		_onApiMessage(routingKey: any, message: any): any;
		_stop(): void;
		parse(timerType: any, value: any): {
			expireAt: Date | undefined;
			repeat: number | undefined;
			delay: number | undefined;
		};
		_getTimers(executeMessage: any): {
			expireAt?: Date | undefined;
		};
		_debug(msg: any): void;
		
		private [K_STOPPED];
		
		private [K_TIMER];
		[K_TIMER_CONTENT]: any;
	}
	const K_TIMER: unique symbol;
	const K_TIMER_CONTENT: unique symbol;
	const K_ACTIVATED: unique symbol;
	const K_COMPLETED: unique symbol;
	const K_CONSUMING: unique symbol;
	const K_COUNTERS: unique symbol;
	const K_EXECUTE_MESSAGE: unique symbol;
	const K_EXTENSIONS: unique symbol;
	const K_MESSAGE_HANDLERS: unique symbol;
	const K_MESSAGE_Q: unique symbol;
	const K_REFERENCE_ELEMENT: unique symbol;
	const K_REFERENCE_INFO: unique symbol;
	const K_STATE_MESSAGE: unique symbol;
	const K_STOPPED: unique symbol;
  class ElementBase {
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

  class Element<T> extends ElementBase {
	get broker(): ElementBroker<T>;
	stop(): void;
	resume(): void;
	getApi(message?: ElementBrokerMessage): Api<T>;
	on(eventName: string, callback: CallableFunction, options?: any): any;
	once(eventName: string, callback: CallableFunction, options?: any): any;
	waitFor(eventName: string, options?: any): Promise<Api<T>>;
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
	getExecuting(): Api<T>[];
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
	assignSettings(newSettings: Record<string, any>): Environment;
	registerScript(activity: any): Script;
	getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
	getServiceByName(serviceName: string): CallableFunction;
	resolveExpression(expression: string, message?: ElementBrokerMessage, expressionFnContext?: any): any;
	addService(name: string, fn: CallableFunction): void;
  }
  class ContextInstance {
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

  class Process extends Element<Process> {
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

  interface ProcessExecution {
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

  class Lane extends ElementBase {
	constructor(process: Process, laneDefinition: SerializableElement);
	/** Process broker */
	get broker(): Broker;
	get process(): Process;
  }

  class SequenceFlow extends Element<SequenceFlow> {
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
	 * @param callback Callback with evaluation result, if truthy flow should be taken
	 */
	evaluate(fromMessage: ElementBrokerMessage, callback: (err: Error, result: any) => void): void;
	getState(): SequenceFlowState | undefined;
  }

  class MessageFlow extends Element<MessageFlow> {
	constructor(flowDef: SerializableElement, context: ContextInstance);
	get source(): MessageFlowReference;
	get target(): MessageFlowReference;
	get counters(): { messages: number };
	activate(): void;
	deactivate(): void;
	getState(): MessageFlowState | undefined;
  }

  class Association extends Element<Association> {
	constructor(associationDef: SerializableElement, context: ContextInstance);
	get sourceId(): string;
	get targetId(): string;
	get isAssociation(): boolean;
	get counters(): { take: number; discard: number };
	take(content?: any): boolean;
	discard(content?: any): boolean;
	getState(): AssociationState | undefined;
  }
	/**
	 * Script condition
	 * */
	function ScriptCondition(owner: ElementBase, script: any, language: string): void;
	class ScriptCondition {
		/**
		 * Script condition
		 * */
		constructor(owner: ElementBase, script: any, language: string);
		type: string;
		language: string;
		_owner: ElementBase;
		_script: any;
		/**
		 * Execute
		 * */
		execute(message: any, callback: CallableFunction): any;
	}
	/**
	 * Expression condition
	 * */
	function ExpressionCondition(owner: ElementBase, expression: string): void;
	class ExpressionCondition {
		/**
		 * Expression condition
		 * */
		constructor(owner: ElementBase, expression: string);
		type: string;
		expression: string;
		_owner: ElementBase;
		/**
		 * Execute
		 * */
		execute(message: any, callback: CallableFunction): any;
	}
	/**
	 * Activity wraps any element (task, event, gateway) and orchestrates its lifecycle through the broker.
	 * @param Behaviour Element-specific behaviour constructor invoked per execution
	 * @param activityDef Parsed BPMN element definition
	 * @param context Per-execution registry and factory
	 */
	function Activity(Behaviour: IActivityBehaviour, activityDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance): void;
	class Activity {
		/**
		 * Activity wraps any element (task, event, gateway) and orchestrates its lifecycle through the broker.
		 * @param Behaviour Element-specific behaviour constructor invoked per execution
		 * @param activityDef Parsed BPMN element definition
		 * @param context Per-execution registry and factory
		 */
		constructor(Behaviour: IActivityBehaviour, activityDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance);
		id: string | undefined;
		type: string;
		name: any;
		behaviour: {
			eventDefinitions: any;
		};
		Behaviour: IActivityBehaviour;
		parent: any;
		logger: ILogger;
		environment: Environment;
		context: ContextInstance;
		broker: import("smqp").default | undefined;
		on: any;
		once: any;
		waitFor: any;
		emitFatal: any;
		/**
		 * Subscribe to inbound flows and start consuming the inbound queue.
		 */
		activate(): 0 | import("smqp").Consumer | undefined;
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
		 */
		getState(): any;
		/**
		 * Restore activity state captured by getState. Cannot be called while running.
		 * @returns this when state was applied
		 * @throws {Error} when activity is currently running
		 */
		recover(state?: ActivityState): this;
		stopped: boolean | undefined;
		status: any;
		/**
		 * Resume after recover. If no run has been started, falls back to activate.
		 * @throws {Error} when called on a running activity
		 */
		resume(): 0 | import("smqp").Consumer | undefined;
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
		stop(): any;
		/**
		 * Advance one run-step when the environment runs in step mode. No-op otherwise.
		 */
		next(): any;
		/**
		 * Walk outbound flows to discover the activity graph from this point.
		 */
		shake(): void;
		/**
		 * Evaluate outbound sequence flows for the given source message.
		 * @param fromMessage Source run message
		 * @param discardRestAtTake When true, take only the first matching flow and discard the rest
		 * */
		evaluateOutbound(fromMessage: ElementBrokerMessage, discardRestAtTake: boolean, callback: (err: Error, evaluationResult: any) => void): any;
		/**
		 * Resolve an Api wrapper for the activity, preferring the running execution if any.
		 * 
		 */
		getApi(message?: ElementBrokerMessage): any;
		/**
		 * Look up another activity in the same context.
		 * */
		getActivityById(elementId: string): any;
		
		_runDiscard(discardContent: any): void;
		
		_discardRun(): void;
		
		_onShakeMessage(sourceMessage: any): any;
		
		_shakeOutbound(sourceMessage: any): any;
		
		_consumeInbound(): import("smqp").Consumer | undefined;
		
		_onInbound(routingKey: any, message: any): void;
		
		_onInboundEvent(routingKey: any, message: any): any;
		
		_consumeRunQ(): void;
		
		_pauseRunQ(): void;
		
		_onRunMessage(routingKey: any, message: any, messageProperties: any): any;
		
		_continueRunMessage(routingKey: any, message: any): any;
		
		_onExecutionMessage(routingKey: any, message: any): any;
		
		_ackRunExecuteMessage(): void;
		
		_doRunLeave(message: any, isDiscarded: any, onOutbound: any): any;
		
		_doOutbound(fromMessage: any, isDiscarded: any, callback: any): any;
		
		_doRunOutbound(outboundList: any, content: any, discardSequence: any): any;
		
		_publishRunOutbound(outboundFlow: any, content: any, discardSequence: any): void;
		
		_onResumeMessage(message: any): any;
		
		_publishEvent(state: any, content: any, properties: any): void;
		
		_onStop(message: any): void;
		
		_consumeApi(): void;
		
		_onApiMessage(routingKey: any, message: any): any;
		
		_createMessage(override: any): any;
		
		_getOutboundSequenceFlowById(flowId: any): SequenceFlow | undefined;
		
		_deactivateRunConsumers(): void;
		
		private [K_ACTIVITY_DEF];
		
		private [K_COUNTERS];
		
		private [K_FLOWS];
		
		private [K_FLAGS];
		
		private [K_EXEC];
		
		private [K_MESSAGE_HANDLERS];
		
		private [K_EVENT_DEFINITIONS];
		
		private [K_EXTENSIONS];
		
		private [K_CONSUMING];
		
		private [K_CONSUMING_RUN_Q];
		
		private [K_ACTIVATED];
		
		private [K_STATE_MESSAGE];
		
		private [K_EXECUTE_MESSAGE];
	}
	const K_ACTIVITY_DEF: unique symbol;
	const K_FLOWS: unique symbol;
	const K_FLAGS: unique symbol;
	const K_EXEC: unique symbol;
	const K_EVENT_DEFINITIONS: unique symbol;
	const K_CONSUMING_RUN_Q: unique symbol;
  interface ElementBroker<T> extends Broker {
	get owner(): T;
  }

  type signalMessage = {
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

  interface ElementMessageContent {
	id?: string;
	type?: string;
	executionId?: string;
	parent?: ElementParent;
	[x: string]: any;
  }

  interface ElementBrokerMessage extends MessageEnvelope {
	content: ElementMessageContent;
  }

  interface ElementParent {
	get id(): string;
	get type(): string;
	get executionId(): string;
	get path(): ElementParent[];
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

  interface IActivityBehaviour {
	id: string;
	type: string;
	activity: any;
	environment: any;
	new (activity: any, context: any): IActivityBehaviour;
	execute(executeMessage: ElementBrokerMessage): void;
  }

  type Extension = (activity: any, context: any) => IExtension;
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
	referenceId?: string;
	/** Event definition type, i.e. message, signal, error, etc */
	referenceType?: string;
  };

  type filterPostponed = (elementApi: any) => boolean;

  enum ProcessRunStatus {
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
  enum ActivityStatus {
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

  interface ElementState {
	id: string;
	type: string;
	broker?: BrokerState;
	[x: string]: any;
  }

  interface EnvironmentState {
	settings: EnvironmentSettings;
	variables: Record<string, any>;
	output: Record<string, any>;
  }

  type completedCounters = { completed: number; discarded: number };

  interface ActivityExecutionState {
	completed: boolean;
	[x: string]: any;
  }

  interface ActivityState extends ElementState {
	status?: string;
	executionId: string;
	stopped: boolean;
	counters: { taken: number; discarded: number };
	execution?: ActivityExecutionState;
  }

  interface SequenceFlowState extends ElementState {
	counters: { take: number; discard: number; looped: number };
  }

  interface MessageFlowState extends ElementState {
	counters: { messages: number };
  }

  interface AssociationState extends ElementState {
	counters: { take: number; discard: number };
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
	stopped: boolean;
	executionId?: string;
	counters: completedCounters;
	environment: EnvironmentState;
	execution?: ProcessExecutionState;
  }

  interface MessageFlowReference {
	/** activity id */
	get id(): string;
	get processId(): string;
  }

  type LoggerFactory = (scope: string) => ILogger;

  interface ILogger {
	debug(...args: any[]): void;
	error(...args: any[]): void;
	warn(...args: any[]): void;
	[x: string]: any;
  }

  type wrappedSetTimeout = (handler: CallableFunction, delay: number, ...args: any[]) => Timer;
  type wrappedClearTimeout = (ref: any) => void;

  interface Timer {
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

  interface IScripts {
	register(activity: any): Script | undefined;
	getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
  }

  interface Script {
	execute(executionContext: any, callback: CallableFunction): void;
  }

	export {};
}

declare module 'bpmn-elements/flows' {
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableContext, SerializableElement } from 'moddle-context-serializer';
	/**
	 * Association connecting a source and target activity. Used to drive compensation —
	 * activities marked `isForCompensation` subscribe to inbound association events.
	 * */
	export function Association(associationDef: import("moddle-context-serializer").SerializableElement, { environment }: ContextInstance): void;
	export class Association {
		/**
		 * Association connecting a source and target activity. Used to drive compensation —
		 * activities marked `isForCompensation` subscribe to inbound association events.
		 * */
		constructor(associationDef: import("moddle-context-serializer").SerializableElement, { environment }: ContextInstance);
		id: string | undefined;
		type: string;
		name: any;
		parent: any;
		behaviour: Record<string, any>;
		sourceId: any;
		targetId: any;
		isAssociation: boolean;
		environment: Environment;
		logger: ILogger;
		broker: import("smqp").default | undefined;
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
		 * 
		 */
		getApi(message?: ElementBrokerMessage): Api_1;
		/**
		 * Stop the association's broker.
		 */
		stop(): void;
		
		_publishEvent(action: any, content: any): void;
		
		_createMessageContent(override: any): any;
		
		private [K_COUNTERS];
	}
	/**
	 * Message flow connecting a source activity (or process) to a target. Subscribes to the
	 * source's `end` event and publishes `message.outbound` whenever the source completes,
	 * carrying any message payload through to the target.
	 * */
	export function MessageFlow(flowDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance): void;
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
		parent: any;
		source: any;
		target: any;
		behaviour: Record<string, any>;
		environment: Environment;
		context: ContextInstance;
		broker: import("smqp").default | undefined;
		on: any;
		once: any;
		emit: any;
		waitFor: any;
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
		 * 
		 */
		getApi(message?: ElementBrokerMessage): Api_1;
		/**
		 * Subscribe to the source element's message and end events to bridge the message across.
		 */
		activate(): void;
		/**
		 * Cancel the source element subscriptions added by activate.
		 */
		deactivate(): void;
		
		_onSourceEnd({ content }: {
			content: any;
		}): void;
		
		_createMessageContent(message: any): {
			id: string | undefined;
			type: string;
			name: any;
			source: any;
			target: any;
			parent: any;
			message: any;
		};
		
		private [K_COUNTERS];
		
		private [K_SOURCE_ELEMENT];
	}
	const K_SOURCE_ELEMENT: unique symbol;
	/**
	 * Sequence flow connecting two activities. Owns its broker and publishes take/discard/looped
	 * events; activities subscribe to drive their inbound queue.
	 * */
	export function SequenceFlow(flowDef: import("moddle-context-serializer").SerializableElement, { environment }: ContextInstance): void;
	export class SequenceFlow {
		/**
		 * Sequence flow connecting two activities. Owns its broker and publishes take/discard/looped
		 * events; activities subscribe to drive their inbound queue.
		 * */
		constructor(flowDef: import("moddle-context-serializer").SerializableElement, { environment }: ContextInstance);
		id: string | undefined;
		type: string;
		name: any;
		parent: any;
		behaviour: Record<string, any>;
		sourceId: any;
		targetId: any;
		isDefault: any;
		isSequenceFlow: boolean;
		environment: Environment;
		logger: ILogger;
		broker: import("smqp").default | undefined;
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
		 * 
		 */
		getApi(message?: ElementBrokerMessage): Api_1;
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
		 * 
		 */
		createMessage(override?: Record<string, any>): {
			id: string | undefined;
			type: string;
			name: any;
			sourceId: any;
			targetId: any;
			isSequenceFlow: boolean;
			isDefault: any;
			parent: any;
		};
		/**
		 * Evaluate the flow's condition for the source activity message. Default flows are always taken.
		 * @param fromMessage Source activity message
		 * @param callback Callback with truthy result if flow should be taken
		 */
		evaluate(fromMessage: ElementBrokerMessage, callback: (err: Error | null, result?: boolean | object) => void): void;
		
		_publishEvent(action: any, content: any): void;
		
		private [K_COUNTERS];
	}
  class ElementBase {
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

  class Element<T> extends ElementBase {
	get broker(): ElementBroker<T>;
	stop(): void;
	resume(): void;
	getApi(message?: ElementBrokerMessage): Api<T>;
	on(eventName: string, callback: CallableFunction, options?: any): any;
	once(eventName: string, callback: CallableFunction, options?: any): any;
	waitFor(eventName: string, options?: any): Promise<Api<T>>;
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
	getExecuting(): Api<T>[];
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
	assignSettings(newSettings: Record<string, any>): Environment;
	registerScript(activity: any): Script;
	getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
	getServiceByName(serviceName: string): CallableFunction;
	resolveExpression(expression: string, message?: ElementBrokerMessage, expressionFnContext?: any): any;
	addService(name: string, fn: CallableFunction): void;
  }
  class ContextInstance {
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
	getSequenceFlowById(sequenceFlowId: string): SequenceFlow_1;
	getInboundSequenceFlows(activityId: string): SequenceFlow_1[];
	getOutboundSequenceFlows(activityId: string): SequenceFlow_1[];
	getInboundAssociations(activityId: string): Association_1[];
	getOutboundAssociations(activityId: string): Association_1[];
	getActivities(scopeId?: string): ElementBase[];
	getSequenceFlows(scopeId?: string): SequenceFlow_1[];
	getAssociations(scopeId?: string): Association_1[];
	clone(newEnvironment?: Environment): ContextInstance;
	getProcessById(processId: string): Process;
	getNewProcessById(processId: string): Process;
	getProcesses(): Process[];
	getExecutableProcesses(): Process[];
	getMessageFlows(sourceId: string): MessageFlow_1[];
	getDataObjectById(referenceId: string): any;
	getDataStoreById(referenceId: string): any;
	getStartActivities(filterOptions?: startActivityFilterOptions, scopeId?: string): Activity[];
	loadExtensions(activity: ElementBase): IExtension;
  }

  class Process extends Element<Process> {
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
	getSequenceFlows(): SequenceFlow_1[];
	getLaneById(laneId: string): Lane | undefined;
	getPostponed(filterFn: filterPostponed): Api<ElementBase>[];
  }

  interface ProcessExecution {
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
	getSequenceFlows(): SequenceFlow_1[];
	getApi(message?: ElementBrokerMessage): Api<ElementBase>;
  }

  class Lane extends ElementBase {
	constructor(process: Process, laneDefinition: SerializableElement);
	/** Process broker */
	get broker(): Broker;
	get process(): Process;
  }

  class SequenceFlow_1 extends Element<SequenceFlow_1> {
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
	 * @param callback Callback with evaluation result, if truthy flow should be taken
	 */
	evaluate(fromMessage: ElementBrokerMessage, callback: (err: Error, result: any) => void): void;
	getState(): SequenceFlowState | undefined;
  }

  class MessageFlow_1 extends Element<MessageFlow_1> {
	constructor(flowDef: SerializableElement, context: ContextInstance);
	get source(): MessageFlowReference;
	get target(): MessageFlowReference;
	get counters(): { messages: number };
	activate(): void;
	deactivate(): void;
	getState(): MessageFlowState | undefined;
  }

  class Association_1 extends Element<Association_1> {
	constructor(associationDef: SerializableElement, context: ContextInstance);
	get sourceId(): string;
	get targetId(): string;
	get isAssociation(): boolean;
	get counters(): { take: number; discard: number };
	take(content?: any): boolean;
	discard(content?: any): boolean;
	getState(): AssociationState | undefined;
  }
  interface ElementBroker<T> extends Broker {
	get owner(): T;
  }

  type signalMessage = {
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

  interface ElementMessageContent {
	id?: string;
	type?: string;
	executionId?: string;
	parent?: ElementParent;
	[x: string]: any;
  }

  interface ElementBrokerMessage extends MessageEnvelope {
	content: ElementMessageContent;
  }

  interface ElementParent {
	get id(): string;
	get type(): string;
	get executionId(): string;
	get path(): ElementParent[];
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

  interface IActivityBehaviour {
	id: string;
	type: string;
	activity: any;
	environment: any;
	new (activity: any, context: any): IActivityBehaviour;
	execute(executeMessage: ElementBrokerMessage): void;
  }

  type Extension = (activity: any, context: any) => IExtension;
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
	referenceId?: string;
	/** Event definition type, i.e. message, signal, error, etc */
	referenceType?: string;
  };

  type filterPostponed = (elementApi: any) => boolean;

  enum ProcessRunStatus {
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
  enum ActivityStatus {
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

  interface ElementState {
	id: string;
	type: string;
	broker?: BrokerState;
	[x: string]: any;
  }

  interface EnvironmentState {
	settings: EnvironmentSettings;
	variables: Record<string, any>;
	output: Record<string, any>;
  }

  type completedCounters = { completed: number; discarded: number };

  interface ActivityExecutionState {
	completed: boolean;
	[x: string]: any;
  }

  interface ActivityState extends ElementState {
	status?: string;
	executionId: string;
	stopped: boolean;
	counters: { taken: number; discarded: number };
	execution?: ActivityExecutionState;
  }

  interface SequenceFlowState extends ElementState {
	counters: { take: number; discard: number; looped: number };
  }

  interface MessageFlowState extends ElementState {
	counters: { messages: number };
  }

  interface AssociationState extends ElementState {
	counters: { take: number; discard: number };
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
	stopped: boolean;
	executionId?: string;
	counters: completedCounters;
	environment: EnvironmentState;
	execution?: ProcessExecutionState;
  }

  interface MessageFlowReference {
	/** activity id */
	get id(): string;
	get processId(): string;
  }

  type LoggerFactory = (scope: string) => ILogger;

  interface ILogger {
	debug(...args: any[]): void;
	error(...args: any[]): void;
	warn(...args: any[]): void;
	[x: string]: any;
  }

  type wrappedSetTimeout = (handler: CallableFunction, delay: number, ...args: any[]) => Timer;
  type wrappedClearTimeout = (ref: any) => void;

  interface Timer {
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

  interface IScripts {
	register(activity: any): Script | undefined;
	getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
  }

  interface Script {
	execute(executionContext: any, callback: CallableFunction): void;
  }
	/**
	 * Lightweight wrapper over the broker that exposes signal/cancel/fail/stop and other api actions.
	 * @param pfx Message prefix, e.g. `activity`, `process`, `definition`, `flow`
	 * @param sourceMessage Cloned to back the api
	 * @param environment Defaults to `broker.owner.environment`
	 * @throws {Error} when sourceMessage is missing
	 */
	function Api_1(pfx: string, broker: any, sourceMessage: ElementBrokerMessage, environment?: Environment): void;
	class Api_1 {
		/**
		 * Lightweight wrapper over the broker that exposes signal/cancel/fail/stop and other api actions.
		 * @param pfx Message prefix, e.g. `activity`, `process`, `definition`, `flow`
		 * @param sourceMessage Cloned to back the api
		 * @param environment Defaults to `broker.owner.environment`
		 * @throws {Error} when sourceMessage is missing
		 */
		constructor(pfx: string, broker: any, sourceMessage: ElementBrokerMessage, environment?: Environment);
		id: any;
		type: any;
		name: any;
		executionId: any;
		environment: any;
		content: any;
		fields: any;
		messageProperties: any;
		broker: any;
		owner: any;
		messagePrefix: string;
		/**
		 * Send a cancel api message.
		 * 
		 */
		cancel(message?: signalMessage, options?: any): void;
		/**
		 * Send a discard api message.
		 */
		discard(): void;
		/**
		 * Send an error api message that fails the activity.
		 * */
		fail(error: Error): void;
		/**
		 * Send a signal api message.
		 * 
		 */
		signal(message?: signalMessage, options?: any): void;
		/**
		 * Send a stop api message.
		 */
		stop(): void;
		/**
		 * Resolve an expression with the api message as scope and the broker owner as context.
		 * */
		resolveExpression(expression: string): any;
		/**
		 * Publish a custom api message to the broker.
		 * @param action Routing key suffix, e.g. `signal`, `cancel`
		 * @param content Merged into the message content
		 * 
		 */
		sendApiMessage(action: string, content?: signalMessage, options?: any): void;
		/**
		 * List currently postponed activities, falling back to a sub-process execution when applicable.
		 * 
		 */
		getPostponed(...args: any[]): any;
		/**
		 * Build a message body by merging the given content onto the source content.
		 * 
		 */
		createMessage(content?: Record<string, any>): any;
	}
	const K_ACTIVATED: unique symbol;
	const K_CONSUMING: unique symbol;
	const K_COUNTERS: unique symbol;
	const K_EXECUTE_MESSAGE: unique symbol;
	const K_EXTENSIONS: unique symbol;
	const K_MESSAGE_HANDLERS: unique symbol;
	const K_STATE_MESSAGE: unique symbol;
	/**
	 * Activity wraps any element (task, event, gateway) and orchestrates its lifecycle through the broker.
	 * @param Behaviour Element-specific behaviour constructor invoked per execution
	 * @param activityDef Parsed BPMN element definition
	 * @param context Per-execution registry and factory
	 */
	function Activity(Behaviour: IActivityBehaviour, activityDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance): void;
	class Activity {
		/**
		 * Activity wraps any element (task, event, gateway) and orchestrates its lifecycle through the broker.
		 * @param Behaviour Element-specific behaviour constructor invoked per execution
		 * @param activityDef Parsed BPMN element definition
		 * @param context Per-execution registry and factory
		 */
		constructor(Behaviour: IActivityBehaviour, activityDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance);
		id: string | undefined;
		type: string;
		name: any;
		behaviour: {
			eventDefinitions: any;
		};
		Behaviour: IActivityBehaviour;
		parent: any;
		logger: ILogger;
		environment: Environment;
		context: ContextInstance;
		broker: import("smqp").default | undefined;
		on: any;
		once: any;
		waitFor: any;
		emitFatal: any;
		/**
		 * Subscribe to inbound flows and start consuming the inbound queue.
		 */
		activate(): 0 | import("smqp").Consumer | undefined;
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
		 */
		getState(): any;
		/**
		 * Restore activity state captured by getState. Cannot be called while running.
		 * @returns this when state was applied
		 * @throws {Error} when activity is currently running
		 */
		recover(state?: ActivityState): this;
		stopped: boolean | undefined;
		status: any;
		/**
		 * Resume after recover. If no run has been started, falls back to activate.
		 * @throws {Error} when called on a running activity
		 */
		resume(): 0 | import("smqp").Consumer | undefined;
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
		stop(): any;
		/**
		 * Advance one run-step when the environment runs in step mode. No-op otherwise.
		 */
		next(): any;
		/**
		 * Walk outbound flows to discover the activity graph from this point.
		 */
		shake(): void;
		/**
		 * Evaluate outbound sequence flows for the given source message.
		 * @param fromMessage Source run message
		 * @param discardRestAtTake When true, take only the first matching flow and discard the rest
		 * */
		evaluateOutbound(fromMessage: ElementBrokerMessage, discardRestAtTake: boolean, callback: (err: Error, evaluationResult: any) => void): any;
		/**
		 * Resolve an Api wrapper for the activity, preferring the running execution if any.
		 * 
		 */
		getApi(message?: ElementBrokerMessage): any;
		/**
		 * Look up another activity in the same context.
		 * */
		getActivityById(elementId: string): any;
		
		_runDiscard(discardContent: any): void;
		
		_discardRun(): void;
		
		_onShakeMessage(sourceMessage: any): any;
		
		_shakeOutbound(sourceMessage: any): any;
		
		_consumeInbound(): import("smqp").Consumer | undefined;
		
		_onInbound(routingKey: any, message: any): void;
		
		_onInboundEvent(routingKey: any, message: any): any;
		
		_consumeRunQ(): void;
		
		_pauseRunQ(): void;
		
		_onRunMessage(routingKey: any, message: any, messageProperties: any): any;
		
		_continueRunMessage(routingKey: any, message: any): any;
		
		_onExecutionMessage(routingKey: any, message: any): any;
		
		_ackRunExecuteMessage(): void;
		
		_doRunLeave(message: any, isDiscarded: any, onOutbound: any): any;
		
		_doOutbound(fromMessage: any, isDiscarded: any, callback: any): any;
		
		_doRunOutbound(outboundList: any, content: any, discardSequence: any): any;
		
		_publishRunOutbound(outboundFlow: any, content: any, discardSequence: any): void;
		
		_onResumeMessage(message: any): any;
		
		_publishEvent(state: any, content: any, properties: any): void;
		
		_onStop(message: any): void;
		
		_consumeApi(): void;
		
		_onApiMessage(routingKey: any, message: any): any;
		
		_createMessage(override: any): any;
		
		_getOutboundSequenceFlowById(flowId: any): SequenceFlow_1 | undefined;
		
		_deactivateRunConsumers(): void;
		
		private [K_ACTIVITY_DEF];
		
		private [K_COUNTERS];
		
		private [K_FLOWS];
		
		private [K_FLAGS];
		
		private [K_EXEC];
		
		private [K_MESSAGE_HANDLERS];
		
		private [K_EVENT_DEFINITIONS];
		
		private [K_EXTENSIONS];
		
		private [K_CONSUMING];
		
		private [K_CONSUMING_RUN_Q];
		
		private [K_ACTIVATED];
		
		private [K_STATE_MESSAGE];
		
		private [K_EXECUTE_MESSAGE];
	}
	const K_ACTIVITY_DEF: unique symbol;
	const K_FLOWS: unique symbol;
	const K_FLAGS: unique symbol;
	const K_EXEC: unique symbol;
	const K_EVENT_DEFINITIONS: unique symbol;
	const K_CONSUMING_RUN_Q: unique symbol;

	export {};
}

declare module 'bpmn-elements/gateways' {
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableContext, SerializableElement } from 'moddle-context-serializer';
	export function EventBasedGateway(activityDef: any, context: any): Activity;
	export function EventBasedGatewayBehaviour(activity: any, context: any): void;
	export class EventBasedGatewayBehaviour {
		constructor(activity: any, context: any);
		id: any;
		type: any;
		activity: any;
		broker: any;
		context: any;
		execute(executeMessage: any): any;
		_onTargetCompleted(executeMessage: any, _: any, message: any, owner: any): void;
		_complete(completedContent: any): void;
		_stop(): void;
		
		private [K_TARGETS];
		
		private [K_COMPLETED];
	}
	export function ExclusiveGateway(activityDef: any, context: any): Activity;
	export function ExclusiveGatewayBehaviour(activity: any): void;
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
	export function InclusiveGatewayBehaviour(activity: any): void;
	export class InclusiveGatewayBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		broker: any;
		execute({ content }: {
			content: any;
		}): void;
	}
	export function ParallelGateway(activityDef: any, context: any): Activity;
	export class ParallelGateway {
		constructor(activityDef: any, context: any);
		id: string | undefined;
	}
	export function ParallelGatewayBehaviour(activity: any): void;
	export class ParallelGatewayBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		activity: any;
		broker: any;
		inbound: Set<any>;
		isConverging: boolean;
		execute(executeMessage: any): any;
		setup(executeMessage: any): any;
		peerMonitor: PeerMonitor | undefined;
		_onExecuteMessage(routingKey: any, message: any): any;
		_onPeerEnterMessage(_: any, message: any): void;
		_complete(): any;
		_stop(): void;
		
		private [K_EXECUTE_MESSAGE];
		
		private [K_TARGETS];
	}
	function PeerMonitor(activity: any, peers: any, targets: any): void;
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
		_onCompleteMessage(_routingKey: any, message: any): boolean;
		stop(): void;
	}
	/**
	 * Activity wraps any element (task, event, gateway) and orchestrates its lifecycle through the broker.
	 * @param Behaviour Element-specific behaviour constructor invoked per execution
	 * @param activityDef Parsed BPMN element definition
	 * @param context Per-execution registry and factory
	 */
	function Activity(Behaviour: IActivityBehaviour, activityDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance): void;
	class Activity {
		/**
		 * Activity wraps any element (task, event, gateway) and orchestrates its lifecycle through the broker.
		 * @param Behaviour Element-specific behaviour constructor invoked per execution
		 * @param activityDef Parsed BPMN element definition
		 * @param context Per-execution registry and factory
		 */
		constructor(Behaviour: IActivityBehaviour, activityDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance);
		id: string | undefined;
		type: string;
		name: any;
		behaviour: {
			eventDefinitions: any;
		};
		Behaviour: IActivityBehaviour;
		parent: any;
		logger: ILogger;
		environment: Environment;
		context: ContextInstance;
		broker: import("smqp").default | undefined;
		on: any;
		once: any;
		waitFor: any;
		emitFatal: any;
		/**
		 * Subscribe to inbound flows and start consuming the inbound queue.
		 */
		activate(): 0 | import("smqp").Consumer | undefined;
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
		 */
		getState(): any;
		/**
		 * Restore activity state captured by getState. Cannot be called while running.
		 * @returns this when state was applied
		 * @throws {Error} when activity is currently running
		 */
		recover(state?: ActivityState): this;
		stopped: boolean | undefined;
		status: any;
		/**
		 * Resume after recover. If no run has been started, falls back to activate.
		 * @throws {Error} when called on a running activity
		 */
		resume(): 0 | import("smqp").Consumer | undefined;
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
		stop(): any;
		/**
		 * Advance one run-step when the environment runs in step mode. No-op otherwise.
		 */
		next(): any;
		/**
		 * Walk outbound flows to discover the activity graph from this point.
		 */
		shake(): void;
		/**
		 * Evaluate outbound sequence flows for the given source message.
		 * @param fromMessage Source run message
		 * @param discardRestAtTake When true, take only the first matching flow and discard the rest
		 * */
		evaluateOutbound(fromMessage: ElementBrokerMessage, discardRestAtTake: boolean, callback: (err: Error, evaluationResult: any) => void): any;
		/**
		 * Resolve an Api wrapper for the activity, preferring the running execution if any.
		 * 
		 */
		getApi(message?: ElementBrokerMessage): any;
		/**
		 * Look up another activity in the same context.
		 * */
		getActivityById(elementId: string): any;
		
		_runDiscard(discardContent: any): void;
		
		_discardRun(): void;
		
		_onShakeMessage(sourceMessage: any): any;
		
		_shakeOutbound(sourceMessage: any): any;
		
		_consumeInbound(): import("smqp").Consumer | undefined;
		
		_onInbound(routingKey: any, message: any): void;
		
		_onInboundEvent(routingKey: any, message: any): any;
		
		_consumeRunQ(): void;
		
		_pauseRunQ(): void;
		
		_onRunMessage(routingKey: any, message: any, messageProperties: any): any;
		
		_continueRunMessage(routingKey: any, message: any): any;
		
		_onExecutionMessage(routingKey: any, message: any): any;
		
		_ackRunExecuteMessage(): void;
		
		_doRunLeave(message: any, isDiscarded: any, onOutbound: any): any;
		
		_doOutbound(fromMessage: any, isDiscarded: any, callback: any): any;
		
		_doRunOutbound(outboundList: any, content: any, discardSequence: any): any;
		
		_publishRunOutbound(outboundFlow: any, content: any, discardSequence: any): void;
		
		_onResumeMessage(message: any): any;
		
		_publishEvent(state: any, content: any, properties: any): void;
		
		_onStop(message: any): void;
		
		_consumeApi(): void;
		
		_onApiMessage(routingKey: any, message: any): any;
		
		_createMessage(override: any): any;
		
		_getOutboundSequenceFlowById(flowId: any): SequenceFlow | undefined;
		
		_deactivateRunConsumers(): void;
		
		private [K_ACTIVITY_DEF];
		
		private [K_COUNTERS];
		
		private [K_FLOWS];
		
		private [K_FLAGS];
		
		private [K_EXEC];
		
		private [K_MESSAGE_HANDLERS];
		
		private [K_EVENT_DEFINITIONS];
		
		private [K_EXTENSIONS];
		
		private [K_CONSUMING];
		
		private [K_CONSUMING_RUN_Q];
		
		private [K_ACTIVATED];
		
		private [K_STATE_MESSAGE];
		
		private [K_EXECUTE_MESSAGE];
	}
	const K_ACTIVITY_DEF: unique symbol;
	const K_FLOWS: unique symbol;
	const K_FLAGS: unique symbol;
	const K_EXEC: unique symbol;
	const K_EVENT_DEFINITIONS: unique symbol;
	const K_CONSUMING_RUN_Q: unique symbol;
	const K_ACTIVATED: unique symbol;
	const K_COMPLETED: unique symbol;
	const K_CONSUMING: unique symbol;
	const K_COUNTERS: unique symbol;
	const K_EXECUTE_MESSAGE: unique symbol;
	const K_EXTENSIONS: unique symbol;
	const K_MESSAGE_HANDLERS: unique symbol;
	const K_STATE_MESSAGE: unique symbol;
	const K_TARGETS: unique symbol;
  class ElementBase {
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

  class Element<T> extends ElementBase {
	get broker(): ElementBroker<T>;
	stop(): void;
	resume(): void;
	getApi(message?: ElementBrokerMessage): Api<T>;
	on(eventName: string, callback: CallableFunction, options?: any): any;
	once(eventName: string, callback: CallableFunction, options?: any): any;
	waitFor(eventName: string, options?: any): Promise<Api<T>>;
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
	getExecuting(): Api<T>[];
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
	assignSettings(newSettings: Record<string, any>): Environment;
	registerScript(activity: any): Script;
	getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
	getServiceByName(serviceName: string): CallableFunction;
	resolveExpression(expression: string, message?: ElementBrokerMessage, expressionFnContext?: any): any;
	addService(name: string, fn: CallableFunction): void;
  }
  class ContextInstance {
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

  class Process extends Element<Process> {
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

  interface ProcessExecution {
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

  class Lane extends ElementBase {
	constructor(process: Process, laneDefinition: SerializableElement);
	/** Process broker */
	get broker(): Broker;
	get process(): Process;
  }

  class SequenceFlow extends Element<SequenceFlow> {
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
	 * @param callback Callback with evaluation result, if truthy flow should be taken
	 */
	evaluate(fromMessage: ElementBrokerMessage, callback: (err: Error, result: any) => void): void;
	getState(): SequenceFlowState | undefined;
  }

  class MessageFlow extends Element<MessageFlow> {
	constructor(flowDef: SerializableElement, context: ContextInstance);
	get source(): MessageFlowReference;
	get target(): MessageFlowReference;
	get counters(): { messages: number };
	activate(): void;
	deactivate(): void;
	getState(): MessageFlowState | undefined;
  }

  class Association extends Element<Association> {
	constructor(associationDef: SerializableElement, context: ContextInstance);
	get sourceId(): string;
	get targetId(): string;
	get isAssociation(): boolean;
	get counters(): { take: number; discard: number };
	take(content?: any): boolean;
	discard(content?: any): boolean;
	getState(): AssociationState | undefined;
  }
  interface ElementBroker<T> extends Broker {
	get owner(): T;
  }

  type signalMessage = {
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

  interface ElementMessageContent {
	id?: string;
	type?: string;
	executionId?: string;
	parent?: ElementParent;
	[x: string]: any;
  }

  interface ElementBrokerMessage extends MessageEnvelope {
	content: ElementMessageContent;
  }

  interface ElementParent {
	get id(): string;
	get type(): string;
	get executionId(): string;
	get path(): ElementParent[];
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

  interface IActivityBehaviour {
	id: string;
	type: string;
	activity: any;
	environment: any;
	new (activity: any, context: any): IActivityBehaviour;
	execute(executeMessage: ElementBrokerMessage): void;
  }

  type Extension = (activity: any, context: any) => IExtension;
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
	referenceId?: string;
	/** Event definition type, i.e. message, signal, error, etc */
	referenceType?: string;
  };

  type filterPostponed = (elementApi: any) => boolean;

  enum ProcessRunStatus {
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
  enum ActivityStatus {
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

  interface ElementState {
	id: string;
	type: string;
	broker?: BrokerState;
	[x: string]: any;
  }

  interface EnvironmentState {
	settings: EnvironmentSettings;
	variables: Record<string, any>;
	output: Record<string, any>;
  }

  type completedCounters = { completed: number; discarded: number };

  interface ActivityExecutionState {
	completed: boolean;
	[x: string]: any;
  }

  interface ActivityState extends ElementState {
	status?: string;
	executionId: string;
	stopped: boolean;
	counters: { taken: number; discarded: number };
	execution?: ActivityExecutionState;
  }

  interface SequenceFlowState extends ElementState {
	counters: { take: number; discard: number; looped: number };
  }

  interface MessageFlowState extends ElementState {
	counters: { messages: number };
  }

  interface AssociationState extends ElementState {
	counters: { take: number; discard: number };
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
	stopped: boolean;
	executionId?: string;
	counters: completedCounters;
	environment: EnvironmentState;
	execution?: ProcessExecutionState;
  }

  interface MessageFlowReference {
	/** activity id */
	get id(): string;
	get processId(): string;
  }

  type LoggerFactory = (scope: string) => ILogger;

  interface ILogger {
	debug(...args: any[]): void;
	error(...args: any[]): void;
	warn(...args: any[]): void;
	[x: string]: any;
  }

  type wrappedSetTimeout = (handler: CallableFunction, delay: number, ...args: any[]) => Timer;
  type wrappedClearTimeout = (ref: any) => void;

  interface Timer {
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

  interface IScripts {
	register(activity: any): Script | undefined;
	getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
  }

  interface Script {
	execute(executionContext: any, callback: CallableFunction): void;
  }

	export {};
}

declare module 'bpmn-elements/tasks' {
	import type { Broker, BrokerState, MessageEnvelope } from 'smqp';
	import type { SerializableContext, SerializableElement } from 'moddle-context-serializer';
	export function CallActivity(activityDef: any, context: any): Activity;
	export function CallActivityBehaviour(activity: any): void;
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
		_onDelegatedApiMessage(calledElement: any, executeMessage: any, routingKey: any, message: any): any;
		_onApiMessage(calledElement: any, executeMessage: any, routingKey: any, message: any): any;
		_stop(executionId: any): void;
	}
	export function ReceiveTask(activityDef: any, context: any): Activity;
	export function ReceiveTaskBehaviour(activity: any): void;
	export class ReceiveTaskBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		reference: any;
		loopCharacteristics: any;
		activity: any;
		broker: any;
		execute(executeMessage: any): any;
		
		private [K_REFERENCE_ELEMENT];
	}
	export function ScriptTask(activityDef: any, context: any): Activity;
	export function ScriptTaskBehaviour(activity: any): void;
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
	export function ServiceTaskBehaviour(activity: any): void;
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
		_onApiMessage(executeMessage: any, _: any, message: any): any;
	}
	export function SignalTask(activityDef: any, context: any): Activity;
	export function SignalTaskBehaviour(activity: any): void;
	export class SignalTaskBehaviour {
		constructor(activity: any);
		id: any;
		type: any;
		loopCharacteristics: any;
		activity: any;
		broker: any;
		execute(executeMessage: any): any;
		_onDelegatedApiMessage(executeMessage: any, routingKey: any, message: any): any;
		_onApiMessage(executeMessage: any, routingKey: any, message: any): any;
		_stop(executionId: any): void;
	}
	export function SubProcess(activityDef: any, context: any): Activity;
	export function SubProcessBehaviour(activity: any, context: any): void;
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
		execute(executeMessage: any): any;
		getState(): any;
		recover(state: any): ProcessExecution_1 | undefined;
		getPostponed(): any[];
		_upsertExecution(executeMessage: any): any;
		_addListeners(executionId: any): void;
		_onExecutionCompleted(_: any, message: any): any;
		_completeExecution(completeRoutingKey: any, content: any): void;
		getApi(apiMessage: any): any;
		_getExecutionById(executionId: any): any;
		
		private [K_EXECUTIONS];
		
		private [K_ON_EXECUTION_COMPLETED];
	}
	const K_EXECUTIONS: unique symbol;
	const K_ON_EXECUTION_COMPLETED: unique symbol;
	export function Task(activityDef: any, context: any): Activity;
	export function TaskBehaviour(activity: any): void;
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
	 * Activity wraps any element (task, event, gateway) and orchestrates its lifecycle through the broker.
	 * @param Behaviour Element-specific behaviour constructor invoked per execution
	 * @param activityDef Parsed BPMN element definition
	 * @param context Per-execution registry and factory
	 */
	function Activity(Behaviour: IActivityBehaviour, activityDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance): void;
	class Activity {
		/**
		 * Activity wraps any element (task, event, gateway) and orchestrates its lifecycle through the broker.
		 * @param Behaviour Element-specific behaviour constructor invoked per execution
		 * @param activityDef Parsed BPMN element definition
		 * @param context Per-execution registry and factory
		 */
		constructor(Behaviour: IActivityBehaviour, activityDef: import("moddle-context-serializer").SerializableElement, context: ContextInstance);
		id: string | undefined;
		type: string;
		name: any;
		behaviour: {
			eventDefinitions: any;
		};
		Behaviour: IActivityBehaviour;
		parent: any;
		logger: ILogger;
		environment: Environment;
		context: ContextInstance;
		broker: import("smqp").default | undefined;
		on: any;
		once: any;
		waitFor: any;
		emitFatal: any;
		/**
		 * Subscribe to inbound flows and start consuming the inbound queue.
		 */
		activate(): 0 | import("smqp").Consumer | undefined;
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
		 */
		getState(): any;
		/**
		 * Restore activity state captured by getState. Cannot be called while running.
		 * @returns this when state was applied
		 * @throws {Error} when activity is currently running
		 */
		recover(state?: ActivityState): this;
		stopped: boolean | undefined;
		status: any;
		/**
		 * Resume after recover. If no run has been started, falls back to activate.
		 * @throws {Error} when called on a running activity
		 */
		resume(): 0 | import("smqp").Consumer | undefined;
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
		stop(): any;
		/**
		 * Advance one run-step when the environment runs in step mode. No-op otherwise.
		 */
		next(): any;
		/**
		 * Walk outbound flows to discover the activity graph from this point.
		 */
		shake(): void;
		/**
		 * Evaluate outbound sequence flows for the given source message.
		 * @param fromMessage Source run message
		 * @param discardRestAtTake When true, take only the first matching flow and discard the rest
		 * */
		evaluateOutbound(fromMessage: ElementBrokerMessage, discardRestAtTake: boolean, callback: (err: Error, evaluationResult: any) => void): any;
		/**
		 * Resolve an Api wrapper for the activity, preferring the running execution if any.
		 * 
		 */
		getApi(message?: ElementBrokerMessage): any;
		/**
		 * Look up another activity in the same context.
		 * */
		getActivityById(elementId: string): any;
		
		_runDiscard(discardContent: any): void;
		
		_discardRun(): void;
		
		_onShakeMessage(sourceMessage: any): any;
		
		_shakeOutbound(sourceMessage: any): any;
		
		_consumeInbound(): import("smqp").Consumer | undefined;
		
		_onInbound(routingKey: any, message: any): void;
		
		_onInboundEvent(routingKey: any, message: any): any;
		
		_consumeRunQ(): void;
		
		_pauseRunQ(): void;
		
		_onRunMessage(routingKey: any, message: any, messageProperties: any): any;
		
		_continueRunMessage(routingKey: any, message: any): any;
		
		_onExecutionMessage(routingKey: any, message: any): any;
		
		_ackRunExecuteMessage(): void;
		
		_doRunLeave(message: any, isDiscarded: any, onOutbound: any): any;
		
		_doOutbound(fromMessage: any, isDiscarded: any, callback: any): any;
		
		_doRunOutbound(outboundList: any, content: any, discardSequence: any): any;
		
		_publishRunOutbound(outboundFlow: any, content: any, discardSequence: any): void;
		
		_onResumeMessage(message: any): any;
		
		_publishEvent(state: any, content: any, properties: any): void;
		
		_onStop(message: any): void;
		
		_consumeApi(): void;
		
		_onApiMessage(routingKey: any, message: any): any;
		
		_createMessage(override: any): any;
		
		_getOutboundSequenceFlowById(flowId: any): SequenceFlow | undefined;
		
		_deactivateRunConsumers(): void;
		
		private [K_ACTIVITY_DEF];
		
		private [K_COUNTERS];
		
		private [K_FLOWS];
		
		private [K_FLAGS];
		
		private [K_EXEC];
		
		private [K_MESSAGE_HANDLERS];
		
		private [K_EVENT_DEFINITIONS];
		
		private [K_EXTENSIONS];
		
		private [K_CONSUMING];
		
		private [K_CONSUMING_RUN_Q];
		
		private [K_ACTIVATED];
		
		private [K_STATE_MESSAGE];
		
		private [K_EXECUTE_MESSAGE];
	}
	const K_ACTIVITY_DEF: unique symbol;
	const K_FLOWS: unique symbol;
	const K_FLAGS: unique symbol;
	const K_EXEC: unique symbol;
	const K_EVENT_DEFINITIONS: unique symbol;
	const K_CONSUMING_RUN_Q: unique symbol;
	const K_ACTIVATED: unique symbol;
	const K_COMPLETED: unique symbol;
	const K_CONSUMING: unique symbol;
	const K_COUNTERS: unique symbol;
	const K_EXECUTE_MESSAGE: unique symbol;
	const K_EXTENSIONS: unique symbol;
	const K_MESSAGE_HANDLERS: unique symbol;
	const K_REFERENCE_ELEMENT: unique symbol;
	const K_STATE_MESSAGE: unique symbol;
	const K_STATUS: unique symbol;
	const K_STOPPED: unique symbol;
	/**
	 * Drives the execution of a single process or sub-process: activates children, routes activity
	 * events, and rolls completion up to the owning Process or sub-process Activity.
	 * */
	function ProcessExecution_1(parentActivity: Process | Activity, context: ContextInstance): void;
	class ProcessExecution_1 {
		/**
		 * Drives the execution of a single process or sub-process: activates children, routes activity
		 * events, and rolls completion up to the owning Process or sub-process Activity.
		 * */
		constructor(parentActivity: Process | Activity, context: ContextInstance);
		id: string | undefined;
		type: string;
		isSubProcess: any;
		isTransaction: any;
		broker: import("smqp").default | ElementBroker<Process> | undefined;
		environment: Environment;
		context: ContextInstance;
		_exchangeName: string;
		executionId: string | undefined;
		/**
		 * Activate children and start the process execution. Resumes if the message is redelivered.
		 * @throws {Error} when message or executionId is missing
		 */
		execute(executeMessage: ElementBrokerMessage): any;
		/**
		 * Resume after recover. Reshakes elements when there are converging gateways or multiple
		 * start activities, then resumes any postponed children.
		 */
		resume(): any;
		/**
		 * Snapshot execution state including children, flows, message flows, and associations.
		 */
		getState(): {
			associations?: (AssociationState | undefined)[] | undefined;
			messageFlows?: (MessageFlowState | undefined)[] | undefined;
			flows?: any[] | undefined;
			executionId: string | undefined;
			stopped: boolean;
			completed: boolean;
			status: any;
			children: never[];
		};
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
		getPostponed(filterFn?: filterPostponed): any[];
		/**
		 * Queue a discard message that propagates to all running children.
		 */
		discard(): number | undefined;
		/**
		 * Queue a cancel message that propagates to all running children.
		 */
		cancel(): number | undefined;
		/**
		 * Get child activities in the process scope.
		 */
		getActivities(): ElementBase[];
		
		getActivityById(activityId: string): ElementBase | undefined;
		/**
		 * Get sequence flows in the process scope.
		 */
		getSequenceFlows(): SequenceFlow[];
		/**
		 * Get associations in the process scope.
		 */
		getAssociations(): Association[];
		/**
		 * Resolve a process or child Api for the given message.
		 * 
		 */
		getApi(message?: ElementBrokerMessage): any;
		
		_start(): any;
		
		_activate(): void;
		
		_deactivate(): void;
		
		_shakeElements(fromId: any): {
			settings: {
				skipDiscard: boolean | undefined;
			};
			sequences: Map<any, any>;
		};
		
		_onDelegateEvent(message: any): boolean;
		
		_onMessageFlowEvent(routingKey: any, message: any): void;
		
		_onActivityEvent(routingKey: any, message: any): number | void;
		
		_onChildMessage(routingKey: any, message: any): any;
		
		_stateChangeMessage(message: any, postponeMessage: any): void;
		
		_popPostponed(byContent: any): any;
		
		_onChildCompleted(message: any): any;
		
		_stopExecution(message: any): any;
		
		_onDiscard(): any;
		
		_onCancel(): void;
		
		_onApiMessage(routingKey: any, message: any): any;
		
		_delegateApiMessage(routingKey: any, message: any, continueOnConsumed: any): boolean;
		
		_complete(completionType: any, content: any): any;
		
		_terminate(message: any): void;
		
		_getFlowById(flowId: any): SequenceFlow | undefined;
		
		_getAssociationById(associationId: any): Association | undefined;
		
		_getMessageFlowById(flowId: any): MessageFlow | undefined;
		
		_getChildById(childId: any): ElementBase | SequenceFlow | undefined;
		
		_getChildApi(message: any): any;
		
		_onShakeMessage(message: any): void;
		
		_debug(logMessage: any): void;
		
		private [K_PARENT];
		
		private [K_ELEMENTS];
		
		private [K_COMPLETED];
		
		private [K_STOPPED];
		
		private [K_ACTIVATED];
		
		private [K_STATUS];
		
		private [K_TRACKER];
		
		private [K_MESSAGE_HANDLERS];
		
		private [K_EXECUTE_MESSAGE];
		
		private [K_ACTIVITY_Q];
	}
	const K_PARENT: unique symbol;
	const K_ELEMENTS: unique symbol;
	const K_TRACKER: unique symbol;
	const K_ACTIVITY_Q: unique symbol;
  class ElementBase {
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

  class Element<T> extends ElementBase {
	get broker(): ElementBroker<T>;
	stop(): void;
	resume(): void;
	getApi(message?: ElementBrokerMessage): Api<T>;
	on(eventName: string, callback: CallableFunction, options?: any): any;
	once(eventName: string, callback: CallableFunction, options?: any): any;
	waitFor(eventName: string, options?: any): Promise<Api<T>>;
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
	getExecuting(): Api<T>[];
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
	assignSettings(newSettings: Record<string, any>): Environment;
	registerScript(activity: any): Script;
	getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
	getServiceByName(serviceName: string): CallableFunction;
	resolveExpression(expression: string, message?: ElementBrokerMessage, expressionFnContext?: any): any;
	addService(name: string, fn: CallableFunction): void;
  }
  class ContextInstance {
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

  class Process extends Element<Process> {
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

  interface ProcessExecution {
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

  class Lane extends ElementBase {
	constructor(process: Process, laneDefinition: SerializableElement);
	/** Process broker */
	get broker(): Broker;
	get process(): Process;
  }

  class SequenceFlow extends Element<SequenceFlow> {
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
	 * @param callback Callback with evaluation result, if truthy flow should be taken
	 */
	evaluate(fromMessage: ElementBrokerMessage, callback: (err: Error, result: any) => void): void;
	getState(): SequenceFlowState | undefined;
  }

  class MessageFlow extends Element<MessageFlow> {
	constructor(flowDef: SerializableElement, context: ContextInstance);
	get source(): MessageFlowReference;
	get target(): MessageFlowReference;
	get counters(): { messages: number };
	activate(): void;
	deactivate(): void;
	getState(): MessageFlowState | undefined;
  }

  class Association extends Element<Association> {
	constructor(associationDef: SerializableElement, context: ContextInstance);
	get sourceId(): string;
	get targetId(): string;
	get isAssociation(): boolean;
	get counters(): { take: number; discard: number };
	take(content?: any): boolean;
	discard(content?: any): boolean;
	getState(): AssociationState | undefined;
  }
  interface ElementBroker<T> extends Broker {
	get owner(): T;
  }

  type signalMessage = {
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

  interface ElementMessageContent {
	id?: string;
	type?: string;
	executionId?: string;
	parent?: ElementParent;
	[x: string]: any;
  }

  interface ElementBrokerMessage extends MessageEnvelope {
	content: ElementMessageContent;
  }

  interface ElementParent {
	get id(): string;
	get type(): string;
	get executionId(): string;
	get path(): ElementParent[];
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

  interface IActivityBehaviour {
	id: string;
	type: string;
	activity: any;
	environment: any;
	new (activity: any, context: any): IActivityBehaviour;
	execute(executeMessage: ElementBrokerMessage): void;
  }

  type Extension = (activity: any, context: any) => IExtension;
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
	referenceId?: string;
	/** Event definition type, i.e. message, signal, error, etc */
	referenceType?: string;
  };

  type filterPostponed = (elementApi: any) => boolean;

  enum ProcessRunStatus {
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
  enum ActivityStatus {
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

  interface ElementState {
	id: string;
	type: string;
	broker?: BrokerState;
	[x: string]: any;
  }

  interface EnvironmentState {
	settings: EnvironmentSettings;
	variables: Record<string, any>;
	output: Record<string, any>;
  }

  type completedCounters = { completed: number; discarded: number };

  interface ActivityExecutionState {
	completed: boolean;
	[x: string]: any;
  }

  interface ActivityState extends ElementState {
	status?: string;
	executionId: string;
	stopped: boolean;
	counters: { taken: number; discarded: number };
	execution?: ActivityExecutionState;
  }

  interface SequenceFlowState extends ElementState {
	counters: { take: number; discard: number; looped: number };
  }

  interface MessageFlowState extends ElementState {
	counters: { messages: number };
  }

  interface AssociationState extends ElementState {
	counters: { take: number; discard: number };
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
	stopped: boolean;
	executionId?: string;
	counters: completedCounters;
	environment: EnvironmentState;
	execution?: ProcessExecutionState;
  }

  interface MessageFlowReference {
	/** activity id */
	get id(): string;
	get processId(): string;
  }

  type LoggerFactory = (scope: string) => ILogger;

  interface ILogger {
	debug(...args: any[]): void;
	error(...args: any[]): void;
	warn(...args: any[]): void;
	[x: string]: any;
  }

  type wrappedSetTimeout = (handler: CallableFunction, delay: number, ...args: any[]) => Timer;
  type wrappedClearTimeout = (ref: any) => void;

  interface Timer {
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

  interface IScripts {
	register(activity: any): Script | undefined;
	getScript(language: string, identifier: { id: string; [x: string]: any }): Script;
  }

  interface Script {
	execute(executionContext: any, callback: CallableFunction): void;
  }

	export {};
}

//# sourceMappingURL=index.d.ts.map
// Augmentations for the dts-buddy-generated bundle in types/index.d.ts.
// These interfaces add the prototype getters defined via Object.defineProperties
// in src/, which TypeScript cannot pick up from constructor functions.
// The build script (scripts/build-types.js) appends this file to types/index.d.ts.

declare module 'bpmn-elements' {
  interface Activity {
    get counters(): { taken: number; discarded: number };
    get execution(): import('types').ActivityExecution | undefined;
    get executionId(): string | undefined;
    get extensions(): import('types').IExtension;
    get bpmnIo(): import('types').IExtension | undefined;
    get formatter(): any;
    get isRunning(): boolean;
    get outbound(): import('types').SequenceFlow[];
    get inbound(): import('types').SequenceFlow[];
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
    get attachedTo(): import('types').Activity | null;
    get lane(): import('types').Lane | undefined;
    get eventDefinitions(): any[];
    /** Parent element process or sub process reference */
    get parentElement(): import('types').Process | import('types').Activity;
    get initialized(): boolean;
  }

  interface Process {
    get counters(): { completed: number; discarded: number };
    get lanes(): import('types').Lane[] | undefined;
    get extensions(): import('types').IExtension | undefined;
    get stopped(): boolean;
    get isRunning(): boolean;
    get executionId(): string | undefined;
    get execution(): import('types').ProcessExecution | undefined;
    get status(): string | undefined;
    get activityStatus(): string;
  }

  interface Definition {
    get counters(): { completed: number; discarded: number };
    get execution(): import('types').DefinitionExecution | undefined;
    get executionId(): string | undefined;
    get isRunning(): boolean;
    get status(): string | undefined;
    get stopped(): boolean;
    get activityStatus(): string;
  }

  interface Environment {
    get variables(): Record<string, any>;
    get services(): Record<string, CallableFunction>;
    set services(value: Record<string, CallableFunction>);
  }

  interface ContextInstance {
    /** Process or sub-process activity that owns this context */
    get owner(): import('types').Process | import('types').Activity | undefined;
  }

  interface ProcessExecution {
    get stopped(): boolean;
    get completed(): boolean;
    get status(): string;
    get postponedCount(): number;
    get isRunning(): boolean;
    get activityStatus(): string;
  }

  interface DefinitionExecution {
    get stopped(): boolean;
    get completed(): boolean;
    get status(): string;
    get processes(): import('types').Process[];
    get postponedCount(): number;
    get isRunning(): boolean;
    get activityStatus(): string;
  }

  interface ActivityExecution {
    get completed(): boolean;
  }
}
