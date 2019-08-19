import Environment from '../../src/Environment';
import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';
import SequenceFlow from '../../src/flows/SequenceFlow';

describe('SequenceFlow', () => {
  describe('properties', () => {
    let context;
    before(async () => {
      context = await testHelpers.context(factory.resource('multiple-multiple-inbound.bpmn').toString());
      expect(context.getSequenceFlows().length).to.be.above(0);
    });

    it('has source and target id', (done) => {
      context.getSequenceFlows().forEach((f) => {
        expect(f.targetId).to.exist;
        expect(f.sourceId).to.exist;
      });
      done();
    });
  });

  describe('discard', () => {
    let context;
    before(async () => {
      context = await testHelpers.context(factory.resource('multiple-multiple-inbound.bpmn'));
      expect(context.getSequenceFlows().length).to.be.above(0);
    });

    it('emits looped if flow target is in discard sequence', () => {
      const flow = context.getSequenceFlowById('taskflow-1');
      let message;
      flow.broker.subscribeOnce('event', 'flow.*', (_, msg) => {
        message = msg;
      });

      flow.discard({discardSequence: ['decision-1']});

      expect(message.fields).to.have.property('routingKey', 'flow.looped');
      expect(flow.counters).to.have.property('looped', 1);
      expect(flow.counters).to.have.property('discard', 0);
    });
  });

  describe('condition', () => {
    it('resolves environment variable expression', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="theStart" />
          <exclusiveGateway id="decision" default="flow2" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <endEvent id="end3" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="end1" />
          <sequenceFlow id="flow3withExpression" sourceRef="decision" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.isOk}</conditionExpression>
          </sequenceFlow>
          <sequenceFlow id="flow4withExpression" sourceRef="decision" targetRef="end3">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.isNotOk}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      const ctx = await testHelpers.context(source);
      ctx.environment.variables.isOk = true;

      const activity = ctx.getActivityById('decision');
      activity.run();

      expect(activity.outbound[1]).to.have.property('id', 'flow3withExpression');
      expect(activity.outbound[1].counters).to.have.property('discard', 0);
      expect(activity.outbound[1].counters).to.have.property('take', 1);

      expect(activity.outbound[2]).to.have.property('id', 'flow4withExpression');
      expect(activity.outbound[2].counters).to.have.property('discard', 1);
      expect(activity.outbound[2].counters).to.have.property('take', 0);
    });

    it('executes service expression', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="theStart" />
          <exclusiveGateway id="decision" default="flow2" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="end1" />
          <sequenceFlow id="flow3withExpression" sourceRef="decision" targetRef="end2">
            <conditionExpression>\${services.isBelow(variables.input,2)}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      const ctx = await testHelpers.context(source);
      ctx.environment.variables.input = 2;
      ctx.environment.addService('isBelow', (input, test) => {
        return input < Number(test);
      });

      const activity = ctx.getActivityById('decision');
      activity.run();

      expect(activity.outbound[1]).to.have.property('id', 'flow3withExpression');
      expect(activity.outbound[1].counters).to.have.property('discard', 1);
      expect(activity.outbound[1].counters).to.have.property('take', 0);
    });

    it('script condition executes and returns result', async () => {
      const context = await testHelpers.context(factory.valid());
      const flow = context.getSequenceFlowById('flow3');
      expect(flow.evaluateCondition({
        content: {
          parent: {},
        },
      })).to.equal(true);
    });

    it('throws if script type is unsupported', async () => {
      const flowDef = {
        id: 'flow',
        type: 'bpmn:SequenceFlow',
        parent: {},
        behaviour: {
          conditionExpression: {
            language: 'Java',
          },
        },
      };

      const flow = SequenceFlow(flowDef, {environment: Environment()});

      expect(() => {
        flow.evaluateCondition({
          content: {
            parent: {},
          },
        });
      }).to.throw(Error, /Java is unsupported/i);
    });
  });

  describe('events', () => {
    let context;
    beforeEach(async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="theStart" />
          <exclusiveGateway id="decision" default="flow2" />
          <task id="task" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <sequenceFlow id="flow1" name="to decision" sourceRef="theStart" targetRef="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="end1" />
          <sequenceFlow id="flow3withExpression" sourceRef="decision" targetRef="end2">
            <conditionExpression>\${services.isBelow(variables.input,2)}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    it('emits take when take', (done) => {
      const flow = context.getSequenceFlowById('flow1');
      flow.once('take', (msg) => {
        expect(msg).to.have.property('id', 'flow1');
        expect(msg).to.have.property('type', 'bpmn:SequenceFlow');
        expect(msg).to.have.property('name', 'to decision');
        return done();
      });
      flow.take();
    });

    it('emits discard when discard', (done) => {
      const flow = context.getSequenceFlowById('flow1');
      flow.once('discard', (msg) => {
        expect(msg).to.have.property('id', 'flow1');
        expect(msg).to.have.property('type', 'bpmn:SequenceFlow');
        expect(msg).to.have.property('name', 'to decision');
        return done();
      });
      flow.discard();
    });
  });

  describe('getState()', () => {
    let context;
    beforeEach(async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="theStart" />
          <exclusiveGateway id="decision" default="flow2" />
          <task id="task" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <sequenceFlow id="flow1" name="first flow" sourceRef="theStart" targetRef="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="end1" />
          <sequenceFlow id="flow3withExpression" sourceRef="decision" targetRef="end2">
            <conditionExpression>\${services.isBelow(variables.input,2)}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    it('returns expected state on take', () => {
      const flow = context.getSequenceFlowById('flow1');
      flow.take();

      expect(flow.getState()).to.deep.include({
        id: 'flow1',
        type: 'bpmn:SequenceFlow',
        name: 'first flow',
        counters: {
          discard: 0,
          looped: 0,
          take: 1,
        },
      });
    });
  });

  describe('recover()', () => {
    let context, newContext;
    beforeEach(async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="theStart" />
          <exclusiveGateway id="decision" default="flow2" />
          <task id="task" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="end1" />
          <sequenceFlow id="flow3withExpression" sourceRef="decision" targetRef="end2">
            <conditionExpression>\${services.isBelow(variables.input,2)}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
      newContext = context.clone();
    });

    it('recovers counters', () => {
      const flow = context.getSequenceFlowById('flow1');
      flow.take();
      const state = flow.getState();

      const recovered = newContext.getSequenceFlowById('flow1');
      recovered.recover(state);

      expect(recovered.getState().counters).to.eql({
        discard: 0,
        looped: 0,
        take: 1,
      });
    });
  });
});
