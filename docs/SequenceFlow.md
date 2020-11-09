SequenceFlow
============

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
