# Extension

The element behaviours in this project only support elements and attributed defined in the BPMN 2.0 scheme, but can be extended to understand other schemas.

## `extension(activity, context)`

Activities and processes call extension functions when instantiated.

Arguments:

- `activity`: instance of [activity](/docs/Activity.md) — or the owning process
- `context`: shared [context](/docs/Context.md)

An extension may return an object with optional `activate(message)` and `deactivate(message)` lifecycle hooks. They run when the owner enters/resumes its run (`activate`) and when it leaves or is stopped (`deactivate`), letting an extension set up and tear down per-run state. Return nothing to only subscribe to events, as below.

Example:

```js
const definition = new Definition(context, {
  extensions: {
    saveAllOutputToEnvironmentExtension,
  },
});

function saveAllOutputToEnvironmentExtension(activity, { environment }) {
  activity.on('end', (api) => {
    environment.output[api.id] = api.content.output;
  });
}
```

## Extension with formatting

In some cases it may be required to add some extra data when an activity executes.

The basic flow is to publish a formatting message on the activity format queue.

The same mechanism works on the **process**: publish a `format` message (optionally with an `endRoutingKey`) in response to a `process.*` event, and the process run pauses at the next transition until the matching end key is published — see the asynchronous example below, which applies equally to process events.

```javascript
import * as elements from 'bpmn-elements';
import { BpmnModdle } from 'bpmn-moddle';

import { Serializer, TypeResolver } from 'moddle-context-serializer';

const { Context, Definition } = elements;
const typeResolver = TypeResolver(elements);

const source = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:js="http://paed01.github.io/bpmn-engine/schema/2020/08/bpmn">
  <process id="theProcess" isExecutable="true">
    <startEvent id="start" js:formKey="whatsYourName" />
  </process>
</definitions>`;

const moddleOptions = {
  js: {
    name: 'Node bpmn-engine',
    uri: 'http://paed01.github.io/bpmn-engine/schema/2020/08/bpmn',
    prefix: 'js',
    xml: {
      tagAlias: 'lowerCase',
    },
    types: [
      {
        name: 'FormSupported',
        isAbstract: true,
        extends: ['bpmn:StartEvent', 'bpmn:UserTask'],
        properties: [
          {
            name: 'formKey',
            type: 'String',
            isAttr: true,
          },
        ],
      },
    ],
  },
};

async function run() {
  const moddleContext = await getModdleContext(source);

  const context = new Context(Serializer(moddleContext, typeResolver));
  const definition = new Definition(context, {
    Logger,
    variables: {
      remoteFormUrl: 'https://exmple.com',
    },
    extensions: {
      addFormExtension,
    },
  });

  definition.once('activity.wait', (api) => {
    api.owner.logger.debug(api.id, 'waiting for form', api.content.form);
  });

  definition.run();

  function addFormExtension(activity) {
    const { formKey } = activity.behaviour;
    if (!formKey) return;

    const { broker } = activity;
    const form = formKey === 'whatsYourName' ? { givenName: { type: 'string' } } : { age: { type: 'int' } };

    broker.subscribeTmp(
      'event',
      'activity.enter',
      () => {
        broker.publish('format', 'run.input', { form });
      },
      { noAck: true }
    );
  }
}

function getModdleContext(sourceXml) {
  const bpmnModdle = new BpmnModdle(moddleOptions);
  return bpmnModdle.fromXML(sourceXml.trim());
}

function Logger(scope) {
  return {
    debug: console.debug.bind(console, 'bpmn-elements:' + scope),
    error: console.error.bind(console, 'bpmn-elements:' + scope),
    warn: console.warn.bind(console, 'bpmn-elements:' + scope),
  };
}

run();
```

If an asynchronous operation is required pass an end routing key to formatting message. When the call is completed publish the end routing key.

Example:

```js
import bent from 'bent';
import { Definition } from 'bpmn-elements';
import { resolve } from 'url';

const getJSON = bent('json');

const definition = new Definition(context, {
  variables: {
    remoteFormUrl: 'https://exmple.com',
  },
  extensions: {
    fetchAsyncFormExtension,
    saveAllOutputToEnvironmentExtension,
  },
});

definition.once('activity.start', (api) => {
  console.log(api.content.form);
});

definition.run();

function fetchAsyncFormExtension(activity, { environment }) {
  if (!activity.behaviour.formKey) return;

  const { broker } = activity;

  broker.subscribeTmp(
    'event',
    'activity.enter',
    (_, message) => {
      const endRoutingKey = 'run.input.end';
      const errorRoutingKey = 'run.input.error';
      broker.publish('format', 'run.input.start', { endRoutingKey, errorRoutingKey });

      getFormData(activity.behaviour.formKey, message.content.id)
        .then((form) => {
          broker.publish('format', endRoutingKey, { form });
        })
        .catch((error) => {
          broker.publish('format', errorRoutingKey, { error });
        });
    },
    { noAck: true }
  );

  function getFormData(formKey, id) {
    return getJSON(resolve(environment.variables.remoteFormUrl, `/api/${formKey}?id=${encodeURIComponent(id)}`));
  }
}

function saveAllOutputToEnvironmentExtension(activity, { environment }) {
  activity.on('end', (api) => {
    environment.output[api.id] = api.content.output;
  });
}
```
