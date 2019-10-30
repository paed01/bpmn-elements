Scripts
=======

Inline scripts handler interface.

- `Scripts`
  - `register(activity)`: register script
  - `getScript(scriptType, activity)`: get registered script
    - `execute(executionContext, callback)`

## `register(activity)`

Register script. Called from activity behaviour.

Arguments:
- `activity`: [activity](/docs/Activity.md) instance

## `getScript(scriptType, activity)`

Get registered script. Called from activity behaviour when executing.

Arguments:
- `scriptType`: script type from definition
- `activity`: [activity](/docs/Activity.md) with script

Must return interface with one required function that is named `execute`.

The execute function will receive an [execution context](/docs/ExecutionScope.md) and a callback that should be called when the execution is completed.

## Example implementation for nodejs

```js
import {Script} from 'vm';

export function Scripts() {
  const scripts = {};

  return {
    getScript,
    register,
  };

  function register({id, type, behaviour}) {
    let scriptBody, language;

    switch (type) {
      case 'bpmn:SequenceFlow': {
        if (!behaviour.conditionExpression) return;
        language = behaviour.conditionExpression.language;
        scriptBody = behaviour.conditionExpression.body;
        break;
      }
      default: {
        language = behaviour.scriptFormat;
        scriptBody = behaviour.script;
      }
    }

    if (!/^javascript$/i.test(language)) return;
    scripts[id] = new Script(scriptBody, {filename: `${type}/${id}`});
  }

  function getScript(scriptType, {id}) {
    if (!/^javascript$/i.test(scriptType)) return;
    const script = scripts[id];
    if (!script) return;

    return {
      execute,
    };

    function execute(executionContext, callback) {
      return script.runInNewContext({...executionContext, next: callback});
    }
  }
}
```
