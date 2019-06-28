import BpmnModdle from 'bpmn-moddle';
import fs from 'fs';
import path from 'path';

const eventActivities = [
  'bpmn:IntermediateCatchEvent',
  'bpmn:StartEvent',
  'bpmn:EndEvent'
];

const gateways = [
  'bpmn:ExclusiveGateway',
  'bpmn:InclusiveGateway'
];

const activities = [
  'bpmn:Task',
  'bpmn:ScriptTask',
  'bpmn:ServiceTask',
  'bpmn:UserTask',
  'bpmn:SubProcess',
  'bpmn:ParallelGateway'
];

const moddle = new BpmnModdle();

export default {
  activities,
  gateways,
  eventActivities,
  valid,
  invalid,
  userTask,
  multipleInbound,
  resource,
  create,
};

const invalidProcess = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess2" isExecutable="true">
    <startEvent id="theStart" />
    <exclusiveGateway id="decision" default="flow2" />
    <endEvent id="end1" />
    <endEvent id="end2" />
    <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
    <sequenceFlow id="flow2" sourceRef="decision" targetRef="end2">
      <conditionExpression xsi:type="tFormalExpression" language="JavaScript">true</conditionExpression>
    </sequenceFlow>
  </process>
</definitions>`;

function valid(definitionId = 'Def_1') {
  if (!definitionId) definitionId = 'valid';
  return `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions id="${definitionId}" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="theProcess1" isExecutable="true">
      <startEvent id="theStart" />
      <exclusiveGateway id="decision" default="flow2" />
      <endEvent id="end1" />
      <endEvent id="end2" />
      <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
      <sequenceFlow id="flow2" sourceRef="decision" targetRef="end1" />
      <sequenceFlow id="flow3" sourceRef="decision" targetRef="end2">
        <conditionExpression xsi:type="tFormalExpression" language="JavaScript">true</conditionExpression>
      </sequenceFlow>
    </process>
  </definitions>`;
}

function invalid() {
  return invalidProcess;
}

function userTask(userTaskId = 'userTask', definitionId = 'Def_1') {
  return `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions id="${definitionId}" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="theProcess" isExecutable="true">
      <dataObjectReference id="globalInputRef" dataObjectRef="input" />
      <dataObjectReference id="inputFromUserRef" dataObjectRef="inputFromUser" />
      <dataObject id="input" />
      <dataObject id="inputFromUser" />
      <startEvent id="theStart" />
      <userTask id="${userTaskId}">
        <ioSpecification id="inputSpec">
          <dataInput id="input_1" name="Surname" />
          <inputSet id="inputSet_1">
            <dataInputRefs>input_1</dataInputRefs>
          </inputSet>
          <dataOutput id="userInput" name="input" />
        </ioSpecification>
        <dataInputAssociation id="associatedInput" sourceRef="globalInputRef" targetRef="input_1" />
        <dataOutputAssociation id="associatedOutput" sourceRef="userInput" targetRef="inputFromUserRef" />
      </userTask>
      <endEvent id="theEnd" />
      <sequenceFlow id="flow1" sourceRef="theStart" targetRef="${userTaskId}" />
      <sequenceFlow id="flow2" sourceRef="${userTaskId}" targetRef="theEnd" />
    </process>
  </definitions>`;
}

function multipleInbound() {
  return `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="theProcess" isExecutable="true">
      <startEvent id="start" />
      <userTask id="userTask" />
      <task id="task" />
      <endEvent id="end" />
      <sequenceFlow id="flow1" sourceRef="start" targetRef="userTask" />
      <sequenceFlow id="flow2" sourceRef="userTask" targetRef="task" />
      <sequenceFlow id="flow3" sourceRef="userTask" targetRef="task" />
      <sequenceFlow id="flow4" sourceRef="userTask" targetRef="task" />
      <sequenceFlow id="endFlow" sourceRef="task" targetRef="end" />
    </process>
  </definitions>`;
}

function resource(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'resources', name));
}

async function create(activityType) {
  const source = `
  <?xml version="1.0" encoding="UTF-8"?>
  <bpmn2:definitions id="task-definitions" xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
  </bpmn2:definitions>'`;

  const {definitions} = await fromXML(source);

  const flowElements = [
    moddle.create('bpmn:StartEvent', {id: 'start'}),
    moddle.create(activityType, { id: 'activity' }),
    moddle.create('bpmn:EndEvent', {id: 'end1'})
  ];

  const [start, activity, end] = flowElements;

  const flows = [
    moddle.create('bpmn:SequenceFlow', {id: 'flow1', sourceRef: start, targetRef: activity}),
    moddle.create('bpmn:SequenceFlow', {id: 'flow2', sourceRef: activity, targetRef: end})
  ];
  const [, flow2, flow3] = flows;

  if (gateways.includes(activityType)) {
    activity.set('default', flow2);
    const conditionExpression = moddle.create('bpmn:FormalExpression', {
      body: '${variables.take}',
    });
    flow3.set('conditionExpression', conditionExpression);
  }

  const bpmnProcess = moddle.create('bpmn:Process', {
    id: 'Process_1',
    isExecutable: true,
    flowElements: flowElements.concat(flows),
  });

  definitions.get('rootElements').push(bpmnProcess);

  return toXml(definitions);
}


function fromXML(source) {
  return new Promise((resolve, reject) => {
    moddle.fromXML(source, (err, definitions, moddleContext) => {
      if (err) return reject(err);
      return resolve({
        definitions,
        moddleContext,
      });
    });
  });
}

function toXml(definitions) {
  return new Promise((resolve, reject) => {
    moddle.toXML(definitions, (err, source) => {
      if (err) return reject(err);
      return resolve(source);
    });
  });
}
