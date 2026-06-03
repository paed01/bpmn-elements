# Extending behaviour

# Extend by overriding behaviour

First off define your own type function. The type function will receive the activity definition and the current context and is required to return an instance of `Activity` with behaviour functionality, i.e. an api with an execute function.

The behaviour function or class will receive the Activity instance and the context when the activity executes.

To complete execution the broker must publish an `execute.completed` message, or an `execute.error` message if things went sideways.

```js
import { Activity } from 'bpmn-elements';

export default function MyOwnStartEvent(activityDefinition, context) {
  return new Activity(MyStartEventBehaviour, activityDefinition, context);
}

export function MyStartEventBehaviour(activity, context) {
  this.activity = activity;
  this.context = context;
}

MyStartEventBehaviour.prototype.execute = function execute(executeMessage) {
  const content = executeMessage.content;
  const { id, type, broker } = this.activity;
  const { environment } = this.context;

  environment.services.getSomeData({ id, type }, (err, result) => {
    if (err) return broker.publish('execution', 'execute.error', { ...content, error: err });
    return broker.publish('execution', 'execute.completed', { ...content, result });
  });
};
```

Second the behavior must be mapped to the workflow context and passed to the definition.

Example with bpmn-moddle:

```js
import * as elements from 'bpmn-elements';
import { BpmnModdle } from 'bpmn-moddle';
import MyStartEvent from './extend/MyStartEvent';
import { Serializer, TypeResolver } from 'moddle-context-serializer';

const myOwnElements = {
  ...elements,
  StartEvent: MyStartEvent,
};

const { Context, Definition } = elements;
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
  const context = new Context(Serializer(moddleContext, typeResolver));

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

Note: `Escalation` and `EscalationEventDefinition` ship with `bpmn-elements` and do not need to be supplied. The example below is illustrative — replace with the event definition type you actually need to support.

```js
export default function EscalateEventDefinition(activity, eventDefinition = {}) {
  const { id, broker, environment } = activity;
  const { type, behaviour } = eventDefinition;
  const { debug } = environment.Logger(type.toLowerCase());

  const source = {
    id,
    type,
    execute,
  };

  return source;

  function execute(executeMessage) {
    debug(`escalate to ${behaviour.escalation.code}`);
    broker.publish(
      'event',
      'activity.escalate',
      { ...executeMessage.content, escalateTo: { ...behaviour.escalateTo } },
      { type: 'escalate' }
    );
    broker.publish('execution', 'execute.completed', executeMessage.content);
  }
}
```

Then extend the serializer.

Example with bpmn-moddle:

```js
import EscalationEventDefinition from './extend/EscalationEventDefinition.js';

import Escalation from './extend/Escalation.js';
import IntermediateThrowEvent from './extend/IntermediateThrowEvent';

import * as elements from 'bpmn-elements';
import { BpmnModdle } from 'bpmn-moddle';

import { Serializer, TypeResolver } from 'moddle-context-serializer';

const { Context, Definition } = elements;
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
  const context = new Context(Serializer(moddleContext, typeResolver));

  const definition = new Definition(context, options);
  definition.run();
}

function getModdleContext(sourceXml) {
  const bpmnModdle = new BpmnModdle();
  return bpmnModdle.fromXML(sourceXml.trim());
}
```

# Replacing `LinkEventDefinition`

Link catches are wired to their matching throws at activity construction. The wiring reads each activity's `behaviour.eventDefinitions` through `context.getLinkEventDefinitionInfo(activityDef)`, which discovers the resolved link Behaviour and its link names. If you ship your own `LinkEventDefinition`, the wiring keeps working as long as the contract below holds:

- The moddle entity's `type` must end with `LinkEventDefinition` (e.g. `bpmn:LinkEventDefinition`, `myns:LinkEventDefinition`). This is the only string-based check — once the first matching definition is found, all subsequent matches compare against the resolved `Behaviour` reference, so any rename is honoured.
- Expose the link name on `behaviour.name` (the moddle default).
- The Behaviour signature is `(activity, eventDefinition, context, index)`.
- When throwing (`activity.isThrowing`), publish `activity.link` on the activity's `event` exchange with `content.message.linkName` set. The catch's construction-time inbound trigger listens for this and queues an `activity.relink` to drive the catch's run cycle.
- Publish `execute.completed` on the `execution` exchange so the throwing activity terminates.
- When catching, publish `activity.catch` on the `event` exchange and complete with `execute.completed`. `Activity` drives the rest of the lifecycle.

Shake propagation (`activity.shake.link` / `activity.shake.linked`) is emitted by `Activity` from the `linkNames` exposed by `getLinkEventDefinitionInfo` — your event definition does not need to subscribe to or republish shake events.
