Environment
===========

Shared environment.

## `Environment([options])`

Arguments:
- `options`: optional options
  - `variables`: optional variables object
  - `output`: optional output object
  - `services`: optional named services object, key is name of service and value must be a function
  - `settings`: optional settings
    - `step`: boolean, true makes activity runs to go forward in steps, defaults to false
    - `enableDummyService`: boolean, true returns dummy service function for service task
    - `strict`: boolean, [strict mode](#strict-mode) defaults to false
    - `batchSize`: optional positive integer to control parallel loop batch size, defaults to 50
  - `scripts`: [Scripts instance](/docs/Scripts.md)
  - `timers`: [Timers instance](/docs/Timers.md)
  - `expressions`: expressions handler, defaults to [Expressions instance](/docs/Expression.md)
  - `Logger`: optional [Logger](#logger) defaults to a dummy logger that does basically nothing but supply the required log functions
  - `extensions`: [extensions](/docs/Extension.md) object

Properties:
- `options`: initial options
- `extensions`: extensions
- `output`: output object
- `scripts`: [Scripts instance](/docs/Scripts.md)
- `expressions`: expressions handler
- `services`: services
- `settings`: settings object
- `variables`: getter for variables object
- `Logger`: passed logger initiator

### `addService(name, serviceFn)`
### `assignVariables(vars)`
### `clone([overrideOptions])`
### `getScript(scriptType, activity)`
### `getServiceByName(name)`

Get service by name

### `getState()`
### `registerScript(activity)`
### `resolveExpression(expression[, context = {}])`

Resolve expression.

Arguments:
- `expression`: expression string
- `context`: optional object from where to resolve expressions, the environment instance is added by default

### `recover(state)`

## Strict mode

If enabled Boundary event with error event definition only catches thrown Bpmn Errors.

## Logger

Logger factory.

### `Logger(scope)`

Create new logger for scope.

Must return the following logging functions:

- `debug`
- `error`
- `warn`

## Example implementation for nodejs

```js
import Debug from 'debug';

export function Logger(scope) {
  return {
    debug: Debug('bpmn-elements:' + scope),
    error: Debug('bpmn-elements:error:' + scope),
    warn: Debug('bpmn-elements:warn:' + scope),
  };
}
```
