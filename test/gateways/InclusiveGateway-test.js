import testHelpers from '../helpers/testHelpers';
import { ActivityError } from '../../src/error/Errors';

describe('InclusiveGateway', () => {
  describe('behavior', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="Definitions_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="mainProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="decisions" />
        <inclusiveGateway id="decisions" default="defaultFlow" />
        <endEvent id="end1" />
        <endEvent id="end2" />
        <endEvent id="end3" />
        <sequenceFlow id="condFlow1" sourceRef="decisions" targetRef="end1">
          <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition1}</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="condFlow2" sourceRef="decisions" targetRef="end3">
          <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition2}</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="defaultFlow" sourceRef="decisions" targetRef="end2" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('variables and services are passed to conditional flow', async () => {
      const activity = context.getActivityById('decisions');
      context.environment.variables.condition1 = true;

      activity.activate();

      const leave = activity.waitFor('leave');
      activity.inbound[0].take();

      await leave;

      expect(activity.outbound[0].counters).to.have.property('take', 1);
      expect(activity.outbound[0].counters).to.have.property('discard', 0);
      expect(activity.outbound[1].counters).to.have.property('take', 0);
      expect(activity.outbound[1].counters).to.have.property('discard', 1);
      expect(activity.outbound[2].counters).to.have.property('take', 0);
      expect(activity.outbound[2].counters).to.have.property('discard', 1);
    });

    it('discards default outbound if one outbound was taken', async () => {
      const activity = context.getActivityById('decisions');
      context.environment.variables.condition2 = true;

      activity.activate();

      const leave = activity.waitFor('leave');
      activity.inbound[0].take();

      await leave;

      expect(activity.outbound[0].counters).to.have.property('take', 0);
      expect(activity.outbound[0].counters).to.have.property('discard', 1);
      expect(activity.outbound[1].counters).to.have.property('take', 1);
      expect(activity.outbound[1].counters).to.have.property('discard', 0);
      expect(activity.outbound[2].counters).to.have.property('take', 0);
      expect(activity.outbound[2].counters).to.have.property('discard', 1);
    });

    it('discards default outbound if more than one outbound was taken', async () => {
      const activity = context.getActivityById('decisions');
      context.environment.variables.condition1 = true;
      context.environment.variables.condition2 = true;

      activity.activate();

      const leave = activity.waitFor('leave');
      activity.inbound[0].take();

      await leave;

      expect(activity.outbound[0].counters).to.have.property('take', 1);
      expect(activity.outbound[0].counters).to.have.property('discard', 0);
      expect(activity.outbound[1].counters).to.have.property('take', 1);
      expect(activity.outbound[1].counters).to.have.property('discard', 0);
      expect(activity.outbound[2].counters).to.have.property('take', 0);
      expect(activity.outbound[2].counters).to.have.property('discard', 1);
    });

    it('takes default outbound if no conditional flow was taken', async () => {
      const activity = context.getActivityById('decisions');
      context.environment.variables.condition1 = false;
      context.environment.variables.condition2 = false;

      activity.activate();

      const leave = activity.waitFor('leave');
      activity.inbound[0].take();

      await leave;

      expect(activity.outbound[0].counters).to.have.property('take', 0);
      expect(activity.outbound[0].counters).to.have.property('discard', 1);
      expect(activity.outbound[1].counters).to.have.property('take', 0);
      expect(activity.outbound[1].counters).to.have.property('discard', 1);
      expect(activity.outbound[2].counters).to.have.property('take', 1);
      expect(activity.outbound[2].counters).to.have.property('discard', 0);
    });

    it('discards all outbound if inbound was discarded', async () => {
      const activity = context.getActivityById('decisions');
      context.environment.variables.condition1 = true;
      context.environment.variables.condition2 = true;

      activity.activate();

      const leave = activity.waitFor('leave');
      activity.inbound[0].discard();

      await leave;

      expect(activity.outbound[0].counters).to.have.property('take', 0);
      expect(activity.outbound[0].counters).to.have.property('discard', 1);
      expect(activity.outbound[1].counters).to.have.property('take', 0);
      expect(activity.outbound[1].counters).to.have.property('discard', 1);
      expect(activity.outbound[2].counters).to.have.property('take', 0);
      expect(activity.outbound[2].counters).to.have.property('discard', 1);
    });

    it('emits error if no flow was taken', async () => {
      const source2 = `
      <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <inclusiveGateway id="decision" />
          <endEvent id="theEnd1" />
          <endEvent id="theEnd2" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="theEnd1">
            <conditionExpression xsi:type="tFormalExpression" language="JavaScript"><![CDATA[
            next(null, environment.variables.input <= 50);
            ]]></conditionExpression>
          </sequenceFlow>
          <sequenceFlow id="flow3" sourceRef="decision" targetRef="theEnd2">
            <conditionExpression xsi:type="tFormalExpression" language="JavaScript"><![CDATA[
            next(null, environment.variables.input <= 20);
            ]]></conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      context = await testHelpers.context(source2);
      const activity = context.getActivityById('decision');
      context.environment.variables.input = 51;

      activity.activate();

      const error = activity.waitFor('error');
      activity.inbound[0].take();

      const errApi = await error;

      expect(errApi.content.error).to.be.instanceOf(ActivityError).and.match(/no conditional flow/i);
    });
  });
});
