# SequenceFlow

Sequence flow behaviour.

# Conditional flows

All outbound sequence flows can have conditions. Flows are evaluated in sequence. Default flow will be taken if no other flow was taken.

Example source:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <task id="task1" default="to-task2" />
    <sequenceFlow id="to-task2" sourceRef="task1" targetRef="task2" />
    <sequenceFlow id="to-task3" sourceRef="task1" targetRef="task3" />
    <sequenceFlow id="to-task4" sourceRef="task1" targetRef="task4">
      <conditionExpression xsi:type="tFormalExpression" language="javascript">next(null, this.environment.variables.take4);</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="to-task5" sourceRef="task1" targetRef="task5">
      <conditionExpression xsi:type="tFormalExpression">${environment.variables.take5}</conditionExpression>
    </sequenceFlow>
    <task id="task2" />
    <task id="task3" />
    <task id="task4" />
    <task id="task5" />
  </process>
</definitions>`;
```

Sequence flows:

- `to-task2`: default flow. If no other flow was taken then default flow is taken
- `to-task3`: unconditional. Flow is taken
- `to-task4`: script condition. Callback (next) is called with environment variable as result. If result is truthy the flow is taken, otherwise discarded
- `to-task5`: expression condition. Expression will be evaluated and passed as result. If result is truthy the flow is taken, otherwise discarded

## Service function conditions

An expression condition can resolve to a service function instead of a plain value. The function then produces the take/discard result, which makes per-flow state and asynchronous conditions possible. There are two forms, and they receive **different** arguments:

- `${environment.services.takeOnce}` (no call) — the expression resolves to the function itself and the sequence flow invokes it with the flow [execution scope](/docs/ExecutionScope.md) as the first argument (and as `this`). The scope exposes the flow `id`, the source activity `content`, and the `environment`. Return a value synchronously, or declare a second `callback` parameter to resolve asynchronously:

  ```js
  // synchronous — return the result
  function takeOnce(scope) {
    const taken = (scope.environment.variables.takenFlows ??= new Set());
    if (taken.has(scope.id)) return false; // scope.id is the sequence flow id
    taken.add(scope.id);
    return true;
  }

  // asynchronous — resolve through the callback
  function isAllowed(scope, callback) {
    checkRemotely(scope.content, (err, ok) => callback(err, ok));
  }
  ```

- `${environment.services.takeFlow(content.id)}` (called) — the expression calls the function and the flow uses the returned value. Arguments are resolved by the [expression handler](/docs/Expression.md); note that **empty** parentheses `takeFlow()` pass the resolution context `{ environment, ...message }` as the single argument (not zero arguments).

> The flow id is only reachable through the no-call form, via `scope.id`. The called form receives the **source activity** in `content` (`content.id` is the activity, not the flow).

## When no conditional flow is taken

If every conditional outbound flow evaluates to falsy, the behaviour depends on the element:

- a diverging **exclusive or inclusive gateway** takes its `default` flow when declared, otherwise it raises an `<id> no conditional flow taken` error — these gateways require exactly one (exclusive) or at least one (inclusive) outbound to be taken;
- any **other activity** (task, event, …) simply ends the branch, no error is raised.

> The runtime no longer publishes outbound flow discards, so outbound flow `discard` counters stay at `0`.
