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
