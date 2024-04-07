# LoopCharacteristics

Task loops can made based on conditions, cardinality, and/or a collection.

## `bpmn:multiInstanceLoopCharacteristics`

Multi instance loop.

### Sequential

Sequential loops is the default, or `isSequential="true"` as the scheme states.

### Parallel

Parallel loops, or `isSequential="false"` as the scheme states, requires either collection or cardinality.

## `bpmn:standardLoopCharacteristics`

Behaves as a sequential multi instance loop.

Cardinality is defined as an XML-attribute: `loopMaximum="4"`. An expression can be used as well.

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

Loop all items in a list. The `collection` and `elementVariable` attributes are schema extensions. They are picked up and resolved when executing the task.

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
