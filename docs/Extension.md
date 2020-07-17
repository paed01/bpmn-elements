Extension
=========

The element behaviours in this project only support elements and attributed defined in the BPMN 2.0 scheme, but can be extended to understand other schemas.

## `extension(activity, context)`

All activities will call extension functions when instantiated.

Arguments:
- `activity`: instance of [activity](/docs/Activity.md)
- `context`: shared [context](/docs/Context.md)

Example:
```js
const definition = Definition(context, {
  extensions: {
    saveAllOutputToEnvironmentExtension
  }
});

function saveAllOutputToEnvironmentExtension(activity, {environment}) {
  activity.on('end', (api) => {
    environment.output[api.id] = api.content.output;
  });
}
```

## Extension with formatting

In some cases it may be required to add some extra data when an activity executes.

The basic flow is to publish a formatting message on the activity format queue.

```js
import {Definition} from 'bpmn-elements';

const definition = Definition(context, {
  variables: {
    remoteFormUrl: 'https://exmple.com'
  },
  extensions: {
    addFormExtension,
  }
});

definition.once('activity.start', (api) => {
  console.log(api.content.form);
});

definition.run();

function addFormExtension(activity) {
  const {formKey} = activity.behaviour;
  if (!formKey) return;

  const {broker} = activity;
  const form = formKey === 'whatsYourName' ? {givenName: {type: 'string'}} : {age: {type: 'int'}};

  broker.subscribeTmp('event', 'activity.enter', () => {
    broker.publish('format', 'run.input', { form });
  }, {noAck: true});
}
```

If an asynchronous operation is required pass an end routing key to formatting message. When the call is completed publish the end routing key.

Example:
```js
import bent from 'bent';
import {Definition} from 'bpmn-elements';
import {resolve} from 'url';

const getJSON = bent('json');

const definition = Definition(context, {
  variables: {
    remoteFormUrl: 'https://exmple.com'
  },
  extensions: {
    fetchAsyncFormExtension,
    saveAllOutputToEnvironmentExtension
  }
});

definition.once('activity.start', (api) => {
  console.log(api.content.form);
});

definition.run();

function fetchAsyncFormExtension(activity, {environment}) {
  if (!activity.behaviour.formKey) return;

  const {broker} = activity;

  broker.subscribeTmp('event', 'activity.enter', (_, message) => {
    const endRoutingKey = 'run.input.end';
    broker.publish('format', 'run.input.start', { endRoutingKey });

    getFormData(activity.behaviour.formKey, message.content.id).then((form) => {
      broker.publish('format', endRoutingKey, { form });
    });
  }, {noAck: true});

  function getFormData(formKey, id) {
    return getJSON(resolve(environment.variables.remoteFormUrl, `/api/${formKey}?id=${encodeURIComponent(id)}`));
  }
}

function saveAllOutputToEnvironmentExtension(activity, {environment}) {
  activity.on('end', (api) => {
    environment.output[api.id] = api.content.output;
  });
}
```

