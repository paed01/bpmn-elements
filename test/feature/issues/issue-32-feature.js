import {Definition} from '../../../index.js';
import testHelpers from '../../helpers/testHelpers.js';

const source1 = `
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_05spjsy"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="collaboration">
    <bpmn:participant id="participant-1" name="one" processRef="process-1" />
    <bpmn:participant id="participant-2" name="two" processRef="process-2" />
    <bpmn:messageFlow id="message1-flow" sourceRef="send-message-1" targetRef="start-event-2" />
    <bpmn:messageFlow id="message2-flow" sourceRef="end-event-2" targetRef="wait-for-message2" />
  </bpmn:collaboration>
  <bpmn:process id="process-2" name="receiver" isExecutable="true">
    <bpmn:startEvent id="start-event-2">
      <bpmn:outgoing>flow2-1</bpmn:outgoing>
      <bpmn:messageEventDefinition id="message1def-2" messageRef="message1-id" />
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow2-1" sourceRef="start-event-2" targetRef="end-event-2" />
    <bpmn:endEvent id="end-event-2">
      <bpmn:incoming>flow2-1</bpmn:incoming>
      <bpmn:messageEventDefinition id="message2def-2" messageRef="message2-id" />
    </bpmn:endEvent>
  </bpmn:process>
  <bpmn:process id="process-1" name="sender" isExecutable="true">
    <bpmn:startEvent id="start-event-1">
      <bpmn:outgoing>flow1-1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:intermediateThrowEvent id="send-message-1">
      <bpmn:incoming>flow1-1</bpmn:incoming>
      <bpmn:outgoing>flow1-2</bpmn:outgoing>
      <bpmn:messageEventDefinition id="message1def-1" messageRef="message1-id">
      </bpmn:messageEventDefinition>
    </bpmn:intermediateThrowEvent>
    <bpmn:intermediateCatchEvent id="wait-for-message2">
      <bpmn:incoming>flow1-2</bpmn:incoming>
      <bpmn:outgoing>flow1-3</bpmn:outgoing>
      <bpmn:messageEventDefinition id="message2def-1" messageRef="message2-id" />
    </bpmn:intermediateCatchEvent>
    <bpmn:sequenceFlow id="flow1-1" sourceRef="start-event-1" targetRef="send-message-1" />
    <bpmn:sequenceFlow id="flow1-2" sourceRef="send-message-1" targetRef="wait-for-message2" />
    <bpmn:sequenceFlow id="flow1-3" sourceRef="wait-for-message2" targetRef="end-event-1" />
    <bpmn:endEvent id="end-event-1">
      <bpmn:incoming>flow1-3</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
  <bpmn:message id="message1-id" name="message1" />
  <bpmn:message id="message2-id" name="message2" />
</bpmn:definitions>`;

const source2 = `
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_05spjsy"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="collaboration">
    <bpmn:participant id="participant-1" name="one" processRef="process-1" />
    <bpmn:participant id="participant-2" name="two" processRef="process-2" />
    <bpmn:messageFlow id="message1-flow" sourceRef="send-message-1" targetRef="start-event-2" />
    <bpmn:messageFlow id="message2-flow" sourceRef="end-event-2" targetRef="wait-for-message2" />
  </bpmn:collaboration>
  <bpmn:process id="process-1" name="sender" isExecutable="true">
    <bpmn:startEvent id="start-event-1">
      <bpmn:outgoing>flow1-1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:intermediateThrowEvent id="send-message-1">
      <bpmn:incoming>flow1-1</bpmn:incoming>
      <bpmn:outgoing>flow1-2</bpmn:outgoing>
      <bpmn:messageEventDefinition id="message1def-1" messageRef="message1-id">
      </bpmn:messageEventDefinition>
    </bpmn:intermediateThrowEvent>
    <bpmn:intermediateCatchEvent id="wait-for-message2">
      <bpmn:incoming>flow1-2</bpmn:incoming>
      <bpmn:outgoing>flow1-3</bpmn:outgoing>
      <bpmn:messageEventDefinition id="message2def-1" messageRef="message2-id" />
    </bpmn:intermediateCatchEvent>
    <bpmn:sequenceFlow id="flow1-1" sourceRef="start-event-1" targetRef="send-message-1" />
    <bpmn:sequenceFlow id="flow1-2" sourceRef="send-message-1" targetRef="wait-for-message2" />
    <bpmn:sequenceFlow id="flow1-3" sourceRef="wait-for-message2" targetRef="end-event-1" />
    <bpmn:endEvent id="end-event-1">
      <bpmn:incoming>flow1-3</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
  <bpmn:process id="process-2" name="receiver" isExecutable="true">
    <bpmn:startEvent id="start-event-2">
      <bpmn:outgoing>flow2-1</bpmn:outgoing>
      <bpmn:messageEventDefinition id="message1def-2" messageRef="message1-id" />
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow2-1" sourceRef="start-event-2" targetRef="end-event-2" />
    <bpmn:endEvent id="end-event-2">
      <bpmn:incoming>flow2-1</bpmn:incoming>
      <bpmn:messageEventDefinition id="message2def-2" messageRef="message2-id" />
    </bpmn:endEvent>
  </bpmn:process>
  <bpmn:message id="message1-id" name="message1" />
  <bpmn:message id="message2-id" name="message2" />
</bpmn:definitions>`;

Feature('Issue 32 - Process order in diagram should not affect execution', () => {
  Scenario('Two executable processes signalling each other, receiving process tops diagram', () => {
    let context, definition, end;
    When('definition is ran', async () => {
      context = await testHelpers.context(source1);
      definition = new Definition(context);
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });
  });

  Scenario('Two executable processes signalling each other, sending process tops diagram', () => {
    let context, definition, end;
    When('definition is ran', async () => {
      context = await testHelpers.context(source2);
      definition = new Definition(context);
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });
  });
});
