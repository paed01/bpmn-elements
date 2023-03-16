import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';

describe('ParallelGateway', () => {
  describe('fork', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theForkProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="fork" />
        <parallelGateway id="fork" />
        <endEvent id="end1" />
        <endEvent id="end2" />
        <sequenceFlow id="flow2" sourceRef="fork" targetRef="end1" />
        <sequenceFlow id="flow3" sourceRef="fork" targetRef="end2" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('takes all outbound', async () => {
      const activity = context.getActivityById('fork');

      activity.activate();

      const leave = activity.waitFor('leave');
      activity.inbound[0].take();

      await leave;

      expect(activity.outbound[0].counters).to.have.property('take', 1);
      expect(activity.outbound[0].counters).to.have.property('discard', 0);
      expect(activity.outbound[1].counters).to.have.property('take', 1);
      expect(activity.outbound[1].counters).to.have.property('discard', 0);
    });

    it('leaves and discards all outbound if inbound was discarded', async () => {
      const activity = context.getActivityById('fork');

      activity.activate();

      const leave = activity.waitFor('leave');
      activity.inbound[0].discard();

      await leave;

      expect(activity.outbound[0].counters).to.have.property('take', 0);
      expect(activity.outbound[0].counters).to.have.property('discard', 1);
      expect(activity.outbound[1].counters).to.have.property('take', 0);
      expect(activity.outbound[1].counters).to.have.property('discard', 1);
    });
  });

  describe('join', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="join" />
        <sequenceFlow id="flow2" sourceRef="start" targetRef="join" />
        <sequenceFlow id="flow3" sourceRef="start" targetRef="join" />
        <parallelGateway id="join" />
        <sequenceFlow id="flow4" sourceRef="join" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('waits for all inbound', async () => {
      const activity = context.getActivityById('join');

      activity.activate();

      const leave = activity.waitFor('leave');
      activity.inbound[0].take();
      activity.inbound[1].take();
      activity.inbound[2].take();

      await leave;

      const outboundFlow = activity.outbound[0];
      expect(outboundFlow.counters).to.have.property('take', 1);
      expect(outboundFlow.counters).to.have.property('discard', 0);
    });

    it('discards outbound if all inbound were discarded', async () => {
      const activity = context.getActivityById('join');

      activity.activate();

      const leave = activity.waitFor('leave');
      activity.inbound[0].discard();
      activity.inbound[1].discard();
      activity.inbound[2].discard();

      await leave;

      const outboundFlow = activity.outbound[0];
      expect(outboundFlow.counters).to.have.property('discard', 1);
      expect(outboundFlow.counters).to.have.property('take', 0);
    });

    it('takes outbound if one inbound is discarded', async () => {
      const activity = context.getActivityById('join');

      activity.activate();

      const leave = activity.waitFor('leave');
      activity.inbound[0].take();
      activity.inbound[1].take();
      activity.inbound[2].discard();

      await leave;

      expect(activity.outbound[0].counters).to.have.property('take', 1);
      expect(activity.outbound[0].counters).to.have.property('discard', 0);
    });

    it('takes outbound if all but one inbound is discarded', async () => {
      const activity = context.getActivityById('join');

      activity.activate();

      const leave = activity.waitFor('leave');
      activity.inbound[0].take();
      activity.inbound[1].discard();
      activity.inbound[2].discard();

      await leave;

      expect(activity.outbound[0].counters).to.have.property('take', 1);
      expect(activity.outbound[0].counters).to.have.property('discard', 0);
    });

    it('takes outbound if first inbound is discarded but the rest are taken', async () => {
      const activity = context.getActivityById('join');

      activity.activate();

      const leave = activity.waitFor('leave');
      activity.inbound[0].discard();
      activity.inbound[1].take();
      activity.inbound[2].take();

      await leave;

      expect(activity.outbound[0].counters).to.have.property('take', 1);
      expect(activity.outbound[0].counters).to.have.property('discard', 0);
    });
  });

  describe('misc', () => {
    it('completes process with multiple joins in discarded path', async () => {
      const context = await testHelpers.context(factory.resource('multiple-joins.bpmn'));
      const bp = context.getProcessById('multiple-joins');
      bp.environment.variables.input = 49;

      const leave = bp.waitFor('leave');

      bp.on('wait', (api) => {
        api.signal();
      });

      bp.run();

      await leave;

      const join1 = bp.getActivityById('join1');

      expect(join1.inbound[0].counters).to.have.property('take', 1);
      expect(join1.inbound[0].counters).to.have.property('discard', 0);
      expect(join1.inbound[1].counters).to.have.property('take', 0);
      expect(join1.inbound[1].counters).to.have.property('discard', 1);
      expect(join1.outbound[0].counters).to.have.property('take', 1);
      expect(join1.outbound[0].counters).to.have.property('discard', 0);

      const join2 = bp.getActivityById('join2');

      expect(join2.inbound[0].counters).to.have.property('take', 0);
      expect(join2.inbound[0].counters).to.have.property('discard', 1);
      expect(join2.inbound[1].counters).to.have.property('take', 1);
      expect(join2.inbound[1].counters).to.have.property('discard', 0);
      expect(join2.outbound[0].counters).to.have.property('take', 1);
      expect(join2.outbound[0].counters).to.have.property('discard', 0);
    });

    it('should join discarded flow with tasks', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="theStart" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decisions" />
          <inclusiveGateway id="decisions" />
          <sequenceFlow id="flow2" sourceRef="decisions" targetRef="script" />
          <sequenceFlow id="flow4" sourceRef="decisions" targetRef="task">
            <conditionExpression xsi:type="tFormalExpression" language="JavaScript"><![CDATA[
              next(null, environment.variables.input <= 50);
            ]]></conditionExpression>
          </sequenceFlow>
          <scriptTask id="script" scriptFormat="Javascript">
            <script>next();</script>
          </scriptTask>
          <userTask id="task" />
          <sequenceFlow id="flow3" sourceRef="script" targetRef="join" />
          <sequenceFlow id="flow5" sourceRef="task" targetRef="join" />
          <parallelGateway id="join" />
          <sequenceFlow id="flow6" sourceRef="join" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const bp = context.getProcessById('theProcess');
      bp.environment.variables.input = 51;

      const leave = bp.waitFor('leave');

      bp.on('wait', (api) => api.signal());

      bp.run();

      await leave;

      const join = bp.getActivityById('join');

      expect(join.inbound[0].counters).to.have.property('take', 1);
      expect(join.inbound[0].counters).to.have.property('discard', 0);
      expect(join.inbound[1].counters).to.have.property('take', 0);
      expect(join.inbound[1].counters).to.have.property('discard', 1);
      expect(join.outbound[0].counters).to.have.property('take', 1);
      expect(join.outbound[0].counters).to.have.property('discard', 0);
    });

    it('regardless of flow order', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="theStart" />
          <inclusiveGateway id="decision" />
          <userTask id="task" />
          <scriptTask id="script" scriptFormat="Javascript">
            <script>next();</script>
          </scriptTask>
          <parallelGateway id="join" />
          <endEvent id="end" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="task">
            <conditionExpression xsi:type="tFormalExpression" language="JavaScript"><![CDATA[
              next(null, environment.variables.input <= 50);
            ]]></conditionExpression>
          </sequenceFlow>
          <sequenceFlow id="flow3" sourceRef="task" targetRef="join" />
          <sequenceFlow id="flow4" sourceRef="decision" targetRef="script" />
          <sequenceFlow id="flow5" sourceRef="script" targetRef="join" />
          <sequenceFlow id="flow6" sourceRef="join" targetRef="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const bp = context.getProcessById('theProcess');
      bp.environment.variables.input = 51;

      const leave = bp.waitFor('leave');

      bp.on('wait', (api) => api.signal());

      bp.run();

      await leave;

      const join = bp.getActivityById('join');

      expect(join.outbound[0].counters).to.have.property('take', 1);
      expect(join.outbound[0].counters).to.have.property('discard', 0);
    });

    it('and with default decision flow', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="theStart" />
          <inclusiveGateway id="decision" default="flow4" />
          <userTask id="task" />
          <scriptTask id="script" scriptFormat="Javascript">
            <script>next();</script>
          </scriptTask>
          <parallelGateway id="join" />
          <endEvent id="end" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="script">
            <conditionExpression xsi:type="tFormalExpression" language="JavaScript"><![CDATA[
              next(null, environment.variables.input <= 50);
            ]]></conditionExpression>
          </sequenceFlow>
          <sequenceFlow id="flow3" sourceRef="script" targetRef="join" />
          <sequenceFlow id="flow4" sourceRef="decision" targetRef="task" />
          <sequenceFlow id="flow5" sourceRef="task" targetRef="join" />
          <sequenceFlow id="flow6" sourceRef="join" targetRef="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const bp = context.getProcessById('theProcess');
      bp.environment.variables.input = 50;

      const leave = bp.waitFor('leave');

      bp.on('wait', (api) => api.signal());

      bp.run();

      await leave;

      const join = bp.getActivityById('join');

      expect(join.outbound[0].counters).to.have.property('take', 1);
      expect(join.outbound[0].counters).to.have.property('discard', 0);
    });

    it('completes process with initial join in discarded path', async () => {
      const context = await testHelpers.context(factory.resource('multiple-joins.bpmn'));
      const bp = context.getProcessById('multiple-joins');
      bp.environment.variables.input = 50;

      const leave = bp.waitFor('leave');

      bp.on('wait', (api) => api.signal());

      bp.run();

      await leave;
    });

    it('completes process with ending join', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="theStart" />
          <parallelGateway id="fork" />
          <parallelGateway id="join" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="fork" />
          <sequenceFlow id="flow2" sourceRef="fork" targetRef="join" />
          <sequenceFlow id="flow3" sourceRef="fork" targetRef="join" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const bp = context.getProcessById('theProcess');

      const leave = bp.waitFor('leave');

      bp.on('wait', (api) => api.signal());

      bp.run();

      await leave;
    });

    it('completes process with succeeding joins', async () => {
      const context = await testHelpers.context(factory.resource('succeeding-joins.bpmn'));
      const [bp] = context.getProcesses();
      bp.environment.variables.input = 50;

      const leave = bp.waitFor('leave');

      bp.on('wait', (api) => api.signal());

      bp.run();

      await leave;
    });
  });
});
