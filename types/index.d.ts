declare module 'bpmn-elements' {
  import { Broker } from 'smqp';
  import { Consumer } from 'smqp/types/Queue';
  import { MessageMessage } from 'smqp/types/Message';
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

  type elementContent = {
    id?: string,
    type?: string,
    executionId?: string,
    parent?: ElementParent,
    [x: string]: any,
  }

  interface ElementBrokerMessage extends MessageMessage {
    content: elementContent,
  }

  interface EventDefinition {
    get id(): string;
    get type(): string;
    get executionId(): string;
    get isThrowing(): boolean;
    get activity(): Activity;
    get broker(): Broker;
    get logger(): Logger;
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
    get logger(): Logger;
  }

  abstract class Element<T> extends ElementBase {
    get broker(): ElementBroker<T>;
    getState(): any;
    stop(): void;
    recover(state?: any): T;
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
    logger?: Logger;
    timers?: ITimers;
    scripts?: IScripts;
    extensions?: Record<string, Extension>;
    expressions?: IExpressions;
  }

  type startActivityFilterOptions = {
    /** Event definition id, i.e. Message, Signal, Error, etc */
    referenceId?: string,
    /** Event definition type, i.e. message, signal, error, etc */
    referenceType?: string
  };

  type filterPostponed = (elementApi: Api<ElementBase>) => boolean;

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

  interface Script {
    execute(executionContext: any, callback: CallableFunction): void;
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
    Logger: Logger;
    get settings(): EnvironmentSettings;
    get variables(): Record<string, any>;
    get output(): Record<string, any>;
    set services(arg: any);
    get services(): any;
    getState(): any;
    recover(state?: any): Environment;
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

  type runCallback = (err: Error, definitionApi: Api<Definition>) => void;
  class Definition extends Element<Definition> {
    constructor(context: Context, options?: EnvironmentOptions);
    get counters(): { completed: number, discarded: number };
    get execution(): DefinitionExecution;
    get executionId(): string;
    get isRunning(): boolean;
    get status(): string;
    get stopped(): boolean;
    run(): Definition;
    run(runContent: Record<string, any>): Definition;
    run(runContent: Record<string, any>, callback: runCallback): Definition;
    run(callback: runCallback): Definition;
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
    get counters(): { completed: number, discarded: number };
    get extensions(): IExtension;
    get stopped(): boolean;
    get isRunning(): boolean;
    get executionId(): string;
    get execution(): ProcessExecution;
    get status(): string;
    init(useAsExecutionId?: string): void;
    run(runContent?: Record<string, any>): void;
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
    execute(executeMessage: ElementBrokerMessage): void;
    getPostponed(filterFn: filterPostponed): Api<ElementBase>[];
    getActivities(): Activity[];
    getActivityById<T>(activityId: string): T;
    getSequenceFlows(): SequenceFlow[];
    getApi(message?: ElementBrokerMessage): Api<ElementBase>;
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
    getCondition(): any;
    createMessage(override?: any): object;
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

  interface Logger {
    debug(...args: any[]): void;
    error(...args: any[]): void;
    warn(...args: any[]): void;
    [x: string]: any,
  }

  type wrappedSetTimeout = (handler: CallableFunction, timeout: number, ...args: unknown[]) => any;
  type wrappedClearTimeout = (id?: any) => void;

  interface ITimers {
    get executing(): any[];
    get setTimeout(): wrappedSetTimeout;
    get clearTimeout(): wrappedClearTimeout;
    register(owner?: any): { setTimeout: wrappedSetTimeout, clearTimeout: wrappedClearTimeout };
    [x: string]: any,
  }

  interface IScripts {
    register(activity: any): Script;
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
  var TimerEventDefinition: EventDefinition;

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

  interface ActivityError extends Error {
    type: string;
    description: string;
    /** Activity that threw error */
    source?: ElementBrokerMessage;
    /** Original error */
    inner?: Error;
  }
}