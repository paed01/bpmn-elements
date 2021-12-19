Extending behaviour
===================

# Extend by overriding behaviour

First off define your own type function. The requirements are that it should return an instance of `Activity` with a behaviour function.

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
import MyStartEvent from './extend/MyStartEvent';
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
  const context = new Context(serialize(moddleContext, typeResolver));

  const definition = new Definition(context, options);
  definition.run();
}

function getModdleContext(sourceXml) {
  const bpmnModdle = new BpmnModdle();
  return bpmnModdle.fromXML(sourceXml.trim());
}
```

# Extend event definition

Define your own event definition type function.

The behaviour function will receive the Activity instance and the workflow context when the activity executes.

To complete execution the broker must publish an `execute.completed` or an `execute.error` message.

```js
export default function EscalateEventDefinition(activity, eventDefinition = {}) {
  const {id, broker, environment} = activity;
  const {type, behaviour} = eventDefinition;
  const {debug} = environment.Logger(type.toLowerCase());

  const source = {
    id,
    type,
    execute,
  };

  return source;

  function execute(executeMessage) {
    debug(`escalate to ${behaviour.escalation.code}`);
    broker.publish('event', 'activity.escalate', {...executeMessage.content, escalateTo: {...behaviour.escalateTo}}, {type: 'escalate'});
    broker.publish('execution', 'execute.completed', executeMessage.content);
  }
}
```

Then extend the serializer.

Example with bpmn-moddle:
```js
import EscalationEventDefinition from './extend/EscalationEventDefinition';

import Escalation from './extend/Escalation';
import IntermediateThrowEvent from './extend/IntermediateThrowEvent';

import * as elements from 'bpmn-elements';
import BpmnModdle from 'bpmn-moddle';

import {default as serialize, TypeResolver} from 'moddle-context-serializer';

const {Context, Definition} = elements;
const typeResolver = TypeResolver(elements, (activityTypes) => {
  activityTypes['bpmn:Escalation'] = Escalation;
  activityTypes['bpmn:IntermediateThrowEvent'] = IntermediateThrowEvent;
  activityTypes['bpmn:EscalationEventDefinition'] = EscalationEventDefinition;
});

const sourceDefinition = `
<?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <intermediateThrowEvent id="event_1">
      <escalationEventDefinition escalationRef="escalation_1" />
    </intermediateThrowEvent>
  </process>
  <escalation id="escalation_1" name="escalation #1" escalationCode="10" />
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
  const context = new Context(serialize(moddleContext, typeResolver));

  const definition = new Definition(context, options);
  definition.run();
}

function getModdleContext(sourceXml) {
  const bpmnModdle = new BpmnModdle();
  return bpmnModdle.fromXML(sourceXml.trim());
}
```
