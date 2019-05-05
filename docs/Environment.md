Environment
===========

Shared environment.

## `Environment([options])`

Arguments:
- `options`: optional options
  - `variables`: optional variables object
  - `output`: = optional output object
  - `services`: optional named services object, key is name of service and value must be a function
  - `settings`: optional settings
    - `step`: boolean, true makes activity runs to go forward in steps, defaults to false
  - `scripts`: [Scripts instance](/docs/Scripts.md)
  - `Logger`: optional [Logger](#logger) defaults to a dummy logger that does basically nothing but supply the required log functions
  - `extensions`: extensions

Properties:
- `options`: initial options
- `extensions`: extensions
- `output`: output object
- `scripts`: [Scripts instance](/docs/Scripts.md)
- `services`: services
- `settings`: settings object
- `variables`: variables object
- `Logger`: passed logger initiator

### `addService(name, serviceFn)`
### `assignVariables(vars)`
### `clone([overrideOptions])`
### `getScript(scriptType, activity)`
### `getServiceByName(name)`
### `getState()`
### `registerScript(activity)`
### `resolveExpression(expression[, message = {}, expressionFnContext])`
### `recover(state)`

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
