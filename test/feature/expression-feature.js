import testHelpers from '../helpers/testHelpers';
import Definition from '../../src/definition/Definition';
import {resolveExpression} from '@aircall/expression-parser';

Feature('expressions', () => {
  Scenario('@aircall/expression-parser', () => {
    let definition;
    Given('a process with faulty sequence flow condition expression syntax', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="syntax-error-definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="my-process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-end1" sourceRef="start" targetRef="end1">
            <conditionExpression xsi:type="tFormalExpression">\${true === "false'}</conditionExpression>
          </sequenceFlow>
          <sequenceFlow id="to-end2" sourceRef="start" targetRef="end2" />
          <endEvent id="end1" />
          <endEvent id="end2" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = Definition(context, {
        expressions: {resolveExpression},
      });
    });

    let errored;
    When('definition is ran', () => {
      errored = definition.waitFor('error');
      definition.run();
    });

    Then('run fails with error from expression parser', async () => {
      const err = await errored;
      expect(err.content.error).to.match(/syntax/i);
    });
  });
});
