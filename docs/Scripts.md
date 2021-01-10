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

  function register({id, type, behaviour, environment}) {
    let scriptBody, language;

    switch (type) {
      case 'bpmn:SequenceFlow': {
        if (!behaviour.conditionExpression) return;
        language = behaviour.conditionExpression.language;
        if (!language) return;
        scriptBody = behaviour.conditionExpression.body;
        break;
      }
      default: {
        language = behaviour.scriptFormat;
        scriptBody = behaviour.script;
      }
    }

    if (!/^javascript$/i.test(language)) return;

    const script = javaScript(language, `${type}/${id}`, scriptBody, environment);
    scripts[id] = script;

    return script;
  }

  function getScript(language, {id}) {
    return scripts[id];
  }

  function javaScript(language, filename, scriptBody, environment) {
    const script = new Script(scriptBody, {filename});
    return {
      script,
      language,
      execute(executionContext, callback) {
        const timers = environment.timers.register(executionContext);
        return script.runInNewContext({...executionContext, ...timers, next: callback});
      }
    };
  }
}
```
