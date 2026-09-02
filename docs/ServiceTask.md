# ServiceTask

Service task behaviour.

To define service task service function you can use an expression in the implementation attribute. The value of the implementation attribute will be picked up by the service task and resolved as an [expression](/docs/Expression.md).

Example source:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <serviceTask id="serviceTask1" name="Get" implementation="\${environment.services.get}" />
    <serviceTask id="serviceTask2" name="Get with var" implementation="\${environment.services.getService(content)}" />
    <sequenceFlow id="flow1" sourceRef="serviceTask1" targetRef="serviceTask2" />
  </process>
</definitions>`;
```

Define your [environment](/docs/Environment.md) with the service functions.

```js
new Environment({
  services: {
    get(executionContext, callback) {
      callback();
    },
    getService(messageContent) {
      return function myService(executionContext, callback) {
        callback();
      };
    },
  },
});
```

The expressions will be resolved when the service task executes.

The service function is called with an [execution context](/docs/ExecutionScope.md) and a callback.

## The service instance

When the task executes it resolves a **service instance** via `getService(executeMessage)`. The resolved instance is what actually runs the work, and it always matches the `IService` interface:

```ts
interface IService {
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
}
```

`getService` returns `IService | undefined`:

1. If the element behaviour defines a `Service` constructor (`IServiceConstructor` — `new (activity, message)`), it is instantiated with the activity and a clone of the execute message.
2. Otherwise, when `environment.settings.enableDummyService` is set, a `DummyService` that completes immediately is used.
3. Otherwise `undefined` is returned and the task emits a fatal `<id> service not defined` error.

The built-in `ServiceImplementation` (backing the `implementation` expression above) and the `DummyService` both satisfy `IService`.

### Custom service behaviour

Assign a `Service` constructor to the element behaviour to take full control of execution. It receives the activity and the execute message, and its `execute` completes the run through the callback:

```js
function MyService(activity, executeMessage) {
  this.type = 'my-service';
  this.activity = activity;
  this.executeMessage = executeMessage;
}

MyService.prototype.execute = function execute(executeMessage, callback) {
  // ...do work...
  callback(null, { done: true }); // becomes the activity output
};

// Optional cancellation hooks
MyService.prototype.discard = function discard(apiMessage) {};
MyService.prototype.stop = function stop(apiMessage) {};
```

If the running activity is discarded, `discard(apiMessage)` is called (falling back to `stop` when `discard` is absent); on stop, `stop(apiMessage)` is called if present.
