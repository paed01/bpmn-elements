Extension
=========

Extend activity behaviour.

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

## Formatting

In some cases it may be required to fetch some extra data when an activity executes.

The basic flow is the publish a formatting message on the activity format queue. If an asynchronous operation is required pass an end routing key to formatting message. When the call is completed publish the end routing key.

Example:
```js
import bent from 'bent';
import {resolve} from 'url';

const {Definition} = elements;

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

