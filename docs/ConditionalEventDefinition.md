# ConditionalEventDefinition

ConditionalEventDefinition behaviour.

- Checks condition when event is first executed
- Expects to be signalled to check condition again

```javascript
import { Definition } from 'bpmn-elements';

import testHelpers from '../test/helpers/testHelpers.js';
import factory from '../test/helpers/factory.js';

const boundEventSource = factory.resource('conditional-bound-js-event.bpmn');

const context = await testHelpers.context(boundEventSource);
const definition = new Definition(context);

const waiting = definition.waitFor('wait', (_routingKey, api) => {
  return !!api.content.condition;
});

const condition1 = definition.waitFor('activity.condition');

definition.run();

console.log('condition type', (await waiting).content.condition);
console.log('first condition result', (await condition1).content.conditionResult);

const condition2 = definition.waitFor('activity.condition');
const completed = definition.waitFor('leave');

definition.signal({ id: 'cond' });

console.log('signal condition result', (await condition2).content.conditionResult);

await completed;
```

## ConditionalEventDefinition events

### `activity.wait`

Fired when condition is waiting for signal.

### `activity.condition`

Fired when condition is checked.
