Examples
========

# ServiceTask example

```javascript
import * as elements from 'bpmn-elements';

import BpmnModdle from 'bpmn-moddle';

import {default as serialize, TypeResolver} from 'moddle-context-serializer';

const {Context, Definition} = elements;
const typeResolver = TypeResolver(elements);

const source = `
<?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <serviceTask id="task" implementation="\${environment.services.myService}" />
  </process>
</definitions>`;

run();

async function run() {
  const moddleContext = await getModdleContext(source);
  const options = {
    Logger,
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

function Logger(scope) {
  return {
    debug: console.debug.bind(console, 'bpmn-elements:' + scope),
    error: console.error.bind(console, 'bpmn-elements:' + scope),
    warn: console.warn.bind(console, 'bpmn-elements:' + scope),
  };
}
```
