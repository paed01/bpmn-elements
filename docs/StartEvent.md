StartEvent
==========

Start event behaviour.

# Form

If a form property is available when start event is executed, the event will wait until signaled. But! event definitions have precedence.

```js
import * as elements from 'bpmn-elements';
import BpmnModdle from 'bpmn-moddle';

import {default as serialize, TypeResolver} from 'moddle-context-serializer';

const {Context, Definition} = elements;
const typeResolver = TypeResolver(elements);

const source = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:js="http://paed01.github.io/bpmn-engine/schema/2020/08/bpmn">
  <process id="theProcess" isExecutable="true">
    <startEvent id="start" js:formKey="my-form" />
  </process>
</definitions>`;

const moddleOptions = {
  "js": {
    "name": "Node bpmn-engine",
    "uri": "http://paed01.github.io/bpmn-engine/schema/2020/08/bpmn",
    "prefix": "js",
    "xml": {
      "tagAlias": "lowerCase"
    },
    "types": [{
      "name": "FormSupported",
      "isAbstract": true,
      "extends": [
        "bpmn:StartEvent",
        "bpmn:UserTask"
      ],
      "properties": [{
        "name": "formKey",
        "type": "String",
        "isAttr": true
      }]
    }]
  }
};

async function run() {
  const moddleContext = await getModdleContext(source);

  const context = Context(serialize(moddleContext, typeResolver));
  const definition = Definition(context, {
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
    const {formKey} = activity.behaviour;
    if (!formKey) return;

    const {broker} = activity;
    const form = formKey === 'whatsYourName' ? {givenName: {type: 'string'}} : {age: {type: 'int'}};

    broker.subscribeTmp('event', 'activity.enter', () => {
      broker.publish('format', 'run.input', { form });
    }, {noAck: true});
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
