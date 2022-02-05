ServiceTask
===========

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
    }
  }
})
```

The expressions will be resolved when the service task executes.

The service function is called with an [execution context](/docs/ExecutionScope.md) and a callback.
