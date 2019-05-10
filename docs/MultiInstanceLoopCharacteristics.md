MultiInstanceLoopCharacteristics
================================

Task loops can made based conditions, cardinality, or a collection.

## Cardinality loop

Loop a fixed number of times or until number of iterations match cardinality. The cardinality body an integer or an [expression](/docs/Expression.md).

```xml
<bpmn:loopCardinality xsi:type="bpmn:tFormalExpression">${environment.variables.maxCardinality}</bpmn:loopCardinality>
```

or as activity behaviour
```json
{
  "id": "task1",
  "type": "bpmn:UserTask",
  "behaviour": {
    "loopCharacteristics": {
      "loopCardinality": "${environment.variables.maxCardinality}"
    }
  }
}
```

## Conditional loop

Loop until condition is met. The condition body can be a script or an [expression](/docs/Expression.md).

```xml
<bpmn:completionCondition xsi:type="tFormalExpression">${environment.services.condition(content.index)}</bpmn:completionCondition>
```

or as activity behaviour
```json
{
  "id": "task1",
  "type": "bpmn:UserTask",
  "behaviour": {
    "loopCharacteristics": {
      "completionCondition": "${environment.services.condition(content.index)}"
    }
  }
}
```

## Collection loop

Loop all items in a list. The `collection` and `elementVariable` attributes are picked up when executing the task.

```xml
<bpmn:multiInstanceLoopCharacteristics isSequential="true" js:collection="${environment.variables.list}" js:elementVariable="listItem" />
```

or as activity behaviour
```json
{
  "id": "task1",
  "type": "bpmn:UserTask",
  "behaviour": {
    "loopCharacteristics": {
      "collection": "${environment.variables.list}",
      "elementVariable": "listItem"
    }
  }
}
```
