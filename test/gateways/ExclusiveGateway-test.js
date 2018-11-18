import testHelpers from '../helpers/testHelpers';
import { ActivityError } from '../../src/error/Errors';

describe('ExclusiveGateway', () => {
  describe('behavior', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="Definitions_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="mainProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="decision" />
        <exclusiveGateway id="decision" default="defaultFlow" />
        <sequenceFlow id="condFlow1" sourceRef="decision" targetRef="end1">
          <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition1}</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="condFlow2" sourceRef="decision" targetRef="end3">
          <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition2}</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="defaultFlow" sourceRef="decision" targetRef="end2" />
        <endEvent id="end1" />
        <endEvent id="end2" />
        <endEvent id="end3" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('takes conditional flow if evaluation is met and discards rest', async () => {
      const activity = context.getActivityById('decision');
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

    it('takes the first conditional flow even if more than one meet condition', async () => {
      const activity = context.getActivityById('decision');
      context.environment.variables.condition1 = true;
      context.environment.variables.condition2 = true;

      activity.activate();

      const leave = activity.waitFor('leave');
      activity.inbound[0].take();

      await leave;

      expect(activity.outbound[0].counters).to.have.property('take', 1);
      expect(activity.outbound[1].counters).to.have.property('take', 0);
      expect(activity.outbound[1].counters).to.have.property('discard', 1);
      expect(activity.outbound[2].counters).to.have.property('take', 0);
      expect(activity.outbound[2].counters).to.have.property('discard', 1);
    });

    it('takes first conditional flow regardless of position in definition', async () => {
      const activity = context.getActivityById('decision');
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

    it('takes default flow if no other flows were taken', async () => {
      const activity = context.getActivityById('decision');

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

    it('should support one diverging flow without a condition', async () => {
      const source2 = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="theStart" />
          <exclusiveGateway id="decision" />
          <endEvent id="end" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="end" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source2);
      const activity = context.getActivityById('decision');

      activity.activate();

      const leave = activity.waitFor('leave');
      activity.inbound[0].take();

      await leave;

      expect(activity.outbound[0].counters).to.have.property('take', 1);
      expect(activity.outbound[0].counters).to.have.property('discard', 0);
    });

    it('should support two diverging flows with conditions', async () => {
      const source2 = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="theStart" />
          <exclusiveGateway id="decision" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="end1">
            <conditionExpression xsi:type="tFormalExpression" language="JavaScript"><![CDATA[
            this.environment.variables.input <= 50
            ]]></conditionExpression>
          </sequenceFlow>
          <sequenceFlow id="flow3" sourceRef="decision" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression" language="JavaScript"><![CDATA[
            this.environment.variables.input > 50
            ]]></conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      context = await testHelpers.context(source2, {Logger: testHelpers.Logger});
      const activity = context.getActivityById('decision');
      context.environment.variables.input = 50;

      activity.activate();

      const leave = activity.waitFor('leave');
      activity.inbound[0].take();

      await leave;

      expect(activity.outbound[0].counters).to.have.property('take', 1);
      expect(activity.outbound[0].counters).to.have.property('discard', 0);
      expect(activity.outbound[1].counters).to.have.property('take', 0);
      expect(activity.outbound[1].counters).to.have.property('discard', 1);
    });

    it('discards all outbound if inbound was discarded', async () => {
      const activity = context.getActivityById('decision');

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

    it('emits error when no flow was taken', async () => {
      const source2 = `
      <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="decision" />
          <exclusiveGateway id="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="theEnd1">
            <conditionExpression xsi:type="tFormalExpression" language="JavaScript"><![CDATA[
            this.environment.variables.input <= 50
            ]]></conditionExpression>
          </sequenceFlow>
          <sequenceFlow id="flow3" sourceRef="decision" targetRef="theEnd2">
            <conditionExpression xsi:type="tFormalExpression" language="JavaScript"><![CDATA[
            this.environment.variables.input <= 20
            ]]></conditionExpression>
          </sequenceFlow>
          <endEvent id="theEnd1" />
          <endEvent id="theEnd2" />
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

  describe('resume()', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="Definitions_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="mainProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="decision" />
        <exclusiveGateway id="decision" default="defaultFlow" />
        <task id="task" />
        <sequenceFlow id="defaultFlow" sourceRef="decision" targetRef="end2" />
        <sequenceFlow id="condFlow1" sourceRef="decision" targetRef="end1">
          <conditionExpression xsi:type="tFormalExpression">\${variables.condition1}</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="condFlow2" sourceRef="decision" targetRef="task">
          <conditionExpression xsi:type="tFormalExpression">\${variables.condition2}</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="flow2" sourceRef="task" targetRef="end3" />
        <endEvent id="end1" />
        <endEvent id="end2" />
        <endEvent id="end3" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('stop on enter continuous resumed gateway outbound', async () => {
      const activity = context.getActivityById('decision');

      activity.activate();

      activity.once('enter', () => activity.stop());
      const stop = activity.waitFor('stop');
      activity.inbound[0].take();

      await stop;

      const leave = activity.waitFor('leave');

      activity.resume();

      await leave;

      expect(activity.outbound[0].counters).to.have.property('take', 1);
      expect(activity.outbound[0].counters).to.have.property('discard', 0);
      expect(activity.outbound[1].counters).to.have.property('take', 0);
      expect(activity.outbound[1].counters).to.have.property('discard', 1);
      expect(activity.outbound[2].counters).to.have.property('take', 0);
      expect(activity.outbound[2].counters).to.have.property('discard', 1);
    });
  });
});
