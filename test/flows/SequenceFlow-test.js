import { resolveExpression } from '@aircall/expression-parser';
import { SequenceFlow } from 'bpmn-elements/flows';
import factory from '../helpers/factory.js';
import js from '../resources/extensions/JsExtension.js';
import testHelpers from '../helpers/testHelpers.js';
import { Scripts } from '../helpers/JavaScripts.js';

const extensions = {
  js,
};

const multipleInboundSource = factory.resource('multiple-multiple-inbound.bpmn').toString();

class TestScripts {
  constructor() {
    this.javaScripts = new Scripts();
    this.scripts = new Map();
  }
  register({ id, type, behaviour }) {
    if (!behaviour.conditionExpression) return;

    const scriptBody = behaviour.conditionExpression.body;
    const sync = !/next\(/.test(scriptBody);

    // @ts-expect-error type coverage
    const registered = this.javaScripts.register({
      id,
      type,
      behaviour: {
        conditionExpression: {
          ...behaviour.conditionExpression,
          language: 'javascript',
        },
      },
    });

    this.scripts.set(id, { sync, registered });
  }
  getScript(_language, { id }) {
    const { sync, registered } = this.scripts.get(id);
    return {
      execute,
    };

    function execute(executionContext, callback) {
      if (sync) {
        const result = registered.script.runInNewContext(executionContext);
        return callback(null, result);
      }
      return registered.script.runInNewContext({ ...executionContext, next: callback });
    }
  }
}

describe('SequenceFlow', () => {
  describe('properties', () => {
    let context;
    before(async () => {
      context = await testHelpers.context(multipleInboundSource);
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
    /** @type {import('bpmn-elements').ContextInstance} */
    let context;
    before(async () => {
      context = await testHelpers.context(factory.resource('multiple-multiple-inbound.bpmn'));
      expect(context.getSequenceFlows().length).to.be.above(0);
    });

    it('emits looped if flow target is in discard sequence', () => {
      const flow = context.getSequenceFlowById('taskflow-1');
      /** @type {import('bpmn-elements').ElementBrokerMessage} */
      let message;
      flow.broker.subscribeOnce('event', 'flow.*', (_, msg) => {
        message = msg;
      });

      flow.discard({ discardSequence: ['decision-1'] });

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
      expect(activity.outbound[2].counters).to.have.property('take', 0);
    });

    it('can register script condition to all flows with conditions', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="theStart" />
          <inclusiveGateway id="decision" default="flow2" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="end1" />
          <endEvent id="end1" />
          <sequenceFlow id="flowWithSyncScript" sourceRef="decision" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression" language="sync">environment.variables.isOk</conditionExpression>
          </sequenceFlow>
          <endEvent id="end2" />
          <sequenceFlow id="flowWithScript" sourceRef="decision" targetRef="end3">
            <conditionExpression xsi:type="tFormalExpression">next(null, environment.variables.isNotOk);</conditionExpression>
          </sequenceFlow>
          <endEvent id="end3" />
          <sequenceFlow id="flowWithoutCondition" sourceRef="decision" targetRef="end4" />
          <endEvent id="end4" />
        </process>
      </definitions>`;

      const ctx = await testHelpers.context(source, { scripts: new TestScripts() });
      ctx.environment.variables.isOk = true;

      const activity = ctx.getActivityById('decision');
      activity.run();

      expect(activity.outbound[0]).to.have.property('id', 'flow2');
      expect(activity.outbound[0].counters).to.have.property('take', 0);

      expect(activity.outbound[1]).to.have.property('id', 'flowWithSyncScript');
      expect(activity.outbound[1].counters).to.have.property('discard', 0);
      expect(activity.outbound[1].counters).to.have.property('take', 1);

      expect(activity.outbound[2]).to.have.property('id', 'flowWithScript');
      expect(activity.outbound[2].counters).to.have.property('take', 0);

      expect(activity.outbound[3]).to.have.property('id', 'flowWithoutCondition');
      expect(activity.outbound[3].counters).to.have.property('discard', 0);
      expect(activity.outbound[3].counters).to.have.property('take', 1);
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
            <conditionExpression>\${environment.services.isBelow(variables.input,2)}</conditionExpression>
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
      expect(activity.outbound[1].counters).to.have.property('take', 0);
    });

    it('calls a service expression that resolves to a function with the flow as scope', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="theStart" />
          <inclusiveGateway id="decision" default="flow2" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <endEvent id="end3" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="end1" />
          <sequenceFlow id="flow3" sourceRef="decision" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression">\${environment.services.cond}</conditionExpression>
          </sequenceFlow>
          <sequenceFlow id="flow4" sourceRef="decision" targetRef="end3">
            <conditionExpression xsi:type="tFormalExpression">\${environment.services.cond}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      const ctx = await testHelpers.context(source);
      const scopes = [];
      ctx.environment.addService('cond', function cond(scope) {
        scopes.push(scope.id);
        return scope.id === 'flow3';
      });

      const activity = ctx.getActivityById('decision');
      activity.run();

      expect(scopes, 'function called once per conditional flow with the flow id').to.have.members(['flow3', 'flow4']);

      expect(activity.outbound.find((f) => f.id === 'flow3').counters).to.deep.include({ take: 1, discard: 0 });
      expect(activity.outbound.find((f) => f.id === 'flow4').counters).to.deep.include({ take: 0 });
    });

    it('resolves an asynchronous function-valued service expression via its callback', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="theStart" />
          <inclusiveGateway id="decision" default="flow2" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="end1" />
          <sequenceFlow id="flow3" sourceRef="decision" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression">\${environment.services.cond}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      const ctx = await testHelpers.context(source);
      ctx.environment.addService('cond', function cond(scope, next) {
        process.nextTick(next, null, scope.id === 'flow3');
      });

      const activity = ctx.getActivityById('decision');
      const left = activity.waitFor('leave');
      activity.run();
      await left;

      expect(activity.outbound.find((f) => f.id === 'flow3').counters).to.deep.include({ take: 1, discard: 0 });
    });

    it('returns the function result synchronously when the condition is executed without a callback', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="theStart" />
          <task id="task" />
          <endEvent id="end" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="task" />
          <sequenceFlow id="flow2" sourceRef="task" targetRef="end">
            <conditionExpression xsi:type="tFormalExpression">\${environment.services.cond}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      const ctx = await testHelpers.context(source);
      ctx.environment.addService('cond', (scope) => scope.id === 'flow2');

      const flow = ctx.getActivityById('task').outbound.find((f) => f.id === 'flow2');
      const condition = flow.getCondition();
      // @ts-expect-error type coverage
      const result = condition.execute({ fields: {}, content: { id: 'task' }, properties: {} });

      expect(result).to.be.true;
    });

    it('does not error a non-gateway activity when every outbound condition is falsy', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="theStart" />
          <task id="task" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="task" />
          <sequenceFlow id="flow2" sourceRef="task" targetRef="end1">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.never}</conditionExpression>
          </sequenceFlow>
          <sequenceFlow id="flow3" sourceRef="task" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.never}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      const ctx = await testHelpers.context(source);

      const activity = ctx.getActivityById('task');
      const errors = [];
      activity.broker.subscribeTmp('event', 'activity.error', (_, msg) => errors.push(msg), { noAck: true });

      const leave = activity.waitFor('leave');
      activity.run();
      await leave;

      expect(errors, 'unlike a gateway, no error is raised').to.have.length(0);
      expect(activity.counters, 'activity is taken').to.include({ taken: 1 });
      expect(activity.outbound.find((f) => f.id === 'flow2').counters).to.include({ take: 0 });
      expect(activity.outbound.find((f) => f.id === 'flow3').counters).to.include({ take: 0 });
    });

    it('neither takes nor discards the outbound of a non-gateway activity with falsy conditions', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="theStart" />
          <task id="task" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="task" />
          <sequenceFlow id="flow2" sourceRef="task" targetRef="end1">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.never}</conditionExpression>
          </sequenceFlow>
          <sequenceFlow id="flow3" sourceRef="task" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.never}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      const ctx = await testHelpers.context(source);

      const activity = ctx.getActivityById('task');
      const leave = activity.waitFor('leave');
      activity.run();
      await leave;

      expect(activity.outbound.find((f) => f.id === 'flow2').counters).to.include({ take: 0, discard: 0 });
      expect(activity.outbound.find((f) => f.id === 'flow3').counters).to.include({ take: 0, discard: 0 });
    });

    it('can handle external resource condition with custom script handler', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="theStart" />
          <inclusiveGateway id="decision" default="flow2" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="end1" />
          <sequenceFlow id="flow3withExternalResource" sourceRef="decision" targetRef="end2">
            <conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript" js:resource="./external.js" />
          </sequenceFlow>
        </process>
      </definitions>`;

      let count = 0;
      const ctx = await testHelpers.context(source, {
        extensions,
        scripts: {
          register() {},
          getScript(_, { id, behaviour }) {
            if (id !== 'flow3withExternalResource') return;
            if (behaviour.conditionExpression.resource !== './external.js') return;
            return {
              execute(executionContext, callback) {
                count++;
                return callback(null, executionContext.environment.variables.input > 3);
              },
            };
          },
        },
      });

      ctx.environment.variables.input = 2;

      const activity = ctx.getActivityById('decision');
      activity.run();

      expect(activity.outbound[1]).to.have.property('id', 'flow3withExternalResource');
      expect(activity.outbound[1].counters).to.have.property('take', 0);

      ctx.environment.variables.input = 4;

      activity.run();

      expect(activity.outbound[1]).to.have.property('id', 'flow3withExternalResource');
      expect(activity.outbound[1].counters).to.have.property('take', 1);

      expect(count).to.equal(2);
    });

    it('script condition executes and returns result in callback', async () => {
      const context = await testHelpers.context(factory.valid());
      const flow = context.getSequenceFlowById('flow3');

      const res = await new Promise((resolve, reject) => {
        flow.getCondition().execute(
          {
            content: {
              // @ts-expect-error type coverage
              parent: {},
            },
          },
          (err, result) => {
            if (err) return reject(err);
            return resolve(result);
          }
        );
      });

      expect(res).to.equal(true);
    });

    it('if script throws rethrows error or returns error in callback', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="start" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <sequenceFlow id="flow" sourceRef="start" targetRef="end1" />
          <sequenceFlow id="flowWithScript" sourceRef="start" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression" language="js">
              next(null, content.empty.prop);
            </conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, {
        scripts: {
          register() {
            return {};
          },
          getScript() {
            return {
              execute() {
                throw new Error('scripterror');
              },
            };
          },
        },
      });
      const flow = context.getSequenceFlowById('flowWithScript');

      expect(() => {
        // @ts-expect-error executed without required callback
        flow.getCondition().execute({
          content: {
            parent: {},
          },
        });
      }).to.throw(/scripterror/i);

      const res = await new Promise((resolve, reject) => {
        flow.getCondition().execute(
          {
            content: {
              // @ts-expect-error type coverage
              parent: {},
            },
          },
          (err) => {
            if (err) return resolve(err);
            return reject(new Error('Wut?'));
          }
        );
      });

      expect(res).to.match(/scripterror/);
    });

    it('expression condition executes and returns result or in callback', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="start" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <sequenceFlow id="flow" sourceRef="start" targetRef="end1" />
          <sequenceFlow id="flowWithExpression" sourceRef="start" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression">\${content.isOk}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const flow = context.getSequenceFlowById('flowWithExpression');

      expect(
        // @ts-expect-error type coverage
        flow.getCondition().execute({
          content: {
            isOk: 1,
            parent: {},
          },
        })
      ).to.equal(1);

      const res = await new Promise((resolve, reject) => {
        flow.getCondition().execute(
          {
            content: {
              isOk: 2,
              // @ts-expect-error type coverage
              parent: {},
            },
          },
          (err, result) => {
            if (err) return reject(err);
            return resolve(result);
          }
        );
      });

      expect(res).to.equal(2);
    });

    it('invalid expression condition throws error or returns error in callback', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="start" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <sequenceFlow id="flow" sourceRef="start" targetRef="end1" />
          <sequenceFlow id="flowWithExpression" sourceRef="start" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression">\${content.isOk"}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, {
        expressions: { resolveExpression },
      });
      const flow = context.getSequenceFlowById('flowWithExpression');

      expect(() => {
        // @ts-expect-error executed without required callback
        flow.getCondition().execute({
          content: {
            isOk: 1,
            parent: {},
          },
        });
      }).to.throw(/Unterminated string literal/i);

      const res = await new Promise((resolve, reject) => {
        flow.getCondition().execute(
          {
            content: {
              isOk: 2,
              // @ts-expect-error type coverage
              parent: {},
            },
          },
          (err) => {
            if (err) return resolve(err);
            return reject(new Error('Ehhhh'));
          }
        );
      });

      expect(res).to.match(/Unterminated string literal/i);
    });

    it('return empty if no condition', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="testProcess" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess1" isExecutable="true">
          <startEvent id="start" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <sequenceFlow id="flow" sourceRef="start" targetRef="end1" />
          <sequenceFlow id="flowWithExpression" sourceRef="start" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression">\${content.isOk}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const flow = context.getSequenceFlowById('flow');

      expect(flow.getCondition()).to.be.null;
    });

    it('throws if script type is unsupported', () => {
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
      const flow = new SequenceFlow(flowDef, testHelpers.emptyContext(undefined, { scripts: undefined }));

      expect(() => {
        // @ts-expect-error executed without required callback
        flow.getCondition().execute({
          content: {
            parent: {},
          },
        });
      }).to.throw(Error, /Java is unsupported/i);
    });

    it('throws if condition body is empty', () => {
      const flowDef = {
        id: 'flow',
        type: 'bpmn:SequenceFlow',
        parent: {},
        behaviour: {
          conditionExpression: {
            body: '',
          },
        },
      };
      const flow = new SequenceFlow(flowDef, testHelpers.emptyContext(undefined, { scripts: undefined }));

      expect(() => {
        // @ts-expect-error executed without required callback
        flow.getCondition().execute({
          content: {
            parent: {},
          },
        });
      }).to.throw(Error, /without body is unsupported/i);
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

  describe('getApi()', () => {
    it('getApi() returns message Api with default message', async () => {
      const context = await testHelpers.context(multipleInboundSource);

      const flow = context.getSequenceFlowById('taskflow-1');

      const api = flow.getApi();
      expect(api).to.have.property('id', 'taskflow-1');
    });
  });

  describe('shake(message)', () => {
    it('shake defaults content shake sequence to empty array', async () => {
      const context = await testHelpers.context(multipleInboundSource);

      const flow = context.getSequenceFlowById('taskflow-1');

      /** @type {import('bpmn-elements').ElementBrokerMessage} */
      let message;
      flow.broker.subscribeOnce('event', 'flow.shake', (_, msg) => {
        message = msg;
      });

      // @ts-expect-error type coverage
      flow.shake({ content: {} });

      expect(message.content.sequence).to.deep.equal([
        {
          id: flow.id,
          isSequenceFlow: true,
          sourceId: flow.sourceId,
          targetId: 'decision-1',
          type: 'bpmn:SequenceFlow',
        },
      ]);
    });
  });
});
