Extensions
==========

# Extend by overriding behaviour

First of define your own type function. The requirements are that it should return an instance of `Activity` with a behaviour function.

The type function will receive the type data from the source context.
The behaviour function will receive the Activity instance and the workflow context when the activity executes.

To complete execution the broker must publish an `execute.completed` message, or an `execute.error` message if things went sideways.

```js
import {Activity} from 'bpmn-elements';

export default function MyOwnStartEvent(activityDefinition, context) {
  return Activity(MyStartEventBehaviour, activityDefinition, context);
}

export function MyStartEventBehaviour(activity, context) {
  const {id, type, broker} = activity;
  const {environment} = context;

  const event = {
    execute,
  };

  return event;

  function execute(executeMessage) {
    const content = executeMessage.content;

    environment.services.getSomeData({id, type}, (err, result) => {
      if (err) return broker.publish('execution', 'execute.error', {...content, error: err});

      return broker.publish('execution', 'execute.completed', {...content, result});
    });
  }
}
```

Second the behavior must be mapped to the workflow context and passed to the definition.

Example with bpmn-moddle:
```js
import * as elements from 'bpmn-elements';
import BpmnModdle from 'bpmn-moddle';
import MyStartEvent from './MyStartEvent';
import {default as serialize, TypeResolver} from 'moddle-context-serializer';

const myOwnElements = {
  ...elements,
  StartEvent: MyStartEvent,
};

const {Context, Definition} = elements;
const typeResolver = TypeResolver(myOwnElements);

const sourceDefinition = `
<?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <startEvent id="start" />
  </process>
</definitions>`;

run(sourceDefinition);

async function run(source) {
  const moddleContext = await getModdleContext(source);
  const options = {
    services: {
      myService(arg, next) {
        next();
      },
    },
  };
  const context = Context(serialize(moddleContext, typeResolver));

  const definition = Definition(context, options);
  definition.run();
}

function getModdleContext(sourceXml) {
  const bpmnModdle = new BpmnModdle();

  return new Promise((resolve, reject) => {
    bpmnModdle.fromXML(sourceXml.trim(), (err, definitions, moddleCtx) => {
      if (err) return reject(err);
      resolve(moddleCtx);
    });
  });
}
```
