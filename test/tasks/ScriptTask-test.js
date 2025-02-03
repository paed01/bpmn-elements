import js from '../resources/extensions/JsExtension.js';
import nock from 'nock';
import request from 'got';
import testHelpers from '../helpers/testHelpers.js';
import { ActivityError } from '../../src/error/Errors.js';
import { Scripts } from '../helpers/JavaScripts.js';
import { Timers } from '../../src/Timers.js';

const extensions = {
  js,
};

describe('ScriptTask', () => {
  describe('behavior', () => {
    it('has access to execution scope', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:js="http://paed01.github.io/bpmn-engine/schema/2017/08/bpmn">
        <process id="theProcess" isExecutable="true">
          <scriptTask id="task" scriptFormat="Javascript">
            <script>
              <![CDATA[
                logger.debug(this);
                next(null, content.input);
              ]]>
            </script>
          </scriptTask>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, { extensions, Logger: testHelpers.Logger });
      context.environment.variables.input = 42;
      const task = context.getActivityById('task');

      const wait = task.waitFor('end');
      task.run({ input: 42 });

      const api = await wait;

      expect(api.content).to.have.property('output', 42);
    });

    it('executes script on taken inbound', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <scriptTask id="scriptTask" scriptFormat="Javascript">
            <script>
              <![CDATA[
                next(null, {input: 2});
              ]]>
            </script>
          </scriptTask>
          <endEvent id="end" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="scriptTask" />
          <sequenceFlow id="flow2" sourceRef="scriptTask" targetRef="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const task = context.getActivityById('scriptTask');
      task.activate();

      const leave = task.waitFor('leave');
      task.inbound[0].take();
      const api = await leave;

      expect(api.content.output).to.have.property('input', 2);
    });

    it('executes external resource script on taken inbound', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <scriptTask id="scriptTask" scriptFormat="Javascript" js:resource="./external.js" />
          <endEvent id="end" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="scriptTask" />
          <sequenceFlow id="flow2" sourceRef="scriptTask" targetRef="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, {
        extensions,
        scripts: {
          register() {},
          getScript(_, { id }) {
            if (id !== 'scriptTask') return;
            return {
              execute(executionContext, callback) {
                return callback(null, { input: 3 });
              },
            };
          },
        },
      });
      const task = context.getActivityById('scriptTask');
      task.activate();

      const leave = task.waitFor('leave');
      task.inbound[0].take();
      const api = await leave;

      expect(api.content.output).to.have.property('input', 3);
    });

    it('behaves as task if script body is not specified', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <scriptTask id="task" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, { extensions, scripts: new Scripts(false) });
      const task = context.getActivityById('task');
      const leave = task.waitFor('leave');
      task.run();
      return leave;
    });

    it("throws error if script handler doesn't recognize script", async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <scriptTask id="task" scriptFormat="coffeescript">
            <script>
              <![CDATA[
                if true then next() else next(new Error("tea"))
              ]]>
            </script>
          </scriptTask>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, { extensions, scripts: new Scripts() });
      const task = context.getActivityById('task');

      const fail = task.waitFor('leave').catch((err) => err);
      task.run();

      const err = await fail;

      expect(err)
        .to.be.instanceOf(ActivityError)
        .and.match(/unsupported/);
    });

    it('throws error if returned in next function', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
        <startEvent id="theStart" />
        <scriptTask id="scriptTask" scriptFormat="Javascript">
          <script>
            <![CDATA[
              next(new Error('Inside'));
            ]]>
          </script>
        </scriptTask>
        <endEvent id="theEnd" />
        <sequenceFlow id="flow1" sourceRef="theStart" targetRef="scriptTask" />
        <sequenceFlow id="flow2" sourceRef="scriptTask" targetRef="theEnd" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const task = context.getActivityById('scriptTask');
      task.activate();

      try {
        const fail = task.waitFor('leave');
        task.inbound[0].take();
        await fail;
      } catch (e) {
        var err = e; // eslint-disable-line
      }

      expect(err)
        .to.be.instanceOf(ActivityError)
        .and.match(/Inside/);
    });

    it('can access services', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
        <startEvent id="theStart" />
        <scriptTask id="scriptTask" scriptFormat="Javascript">
          <script>
            <![CDATA[
              const request = environment.getServiceByName('request');
              request('http://example.com/test')
                .json()
                .then((body) => next(null, body))
                .catch(next);
            ]]>
          </script>
        </scriptTask>
        <endEvent id="theEnd" />
        <sequenceFlow id="flow1" sourceRef="theStart" targetRef="scriptTask" />
        <sequenceFlow id="flow2" sourceRef="scriptTask" targetRef="theEnd" />
        </process>
      </definitions>`;

      nock('http://example.com').get('/test').reply(
        200,
        {
          data: 2,
        },
        {
          'content-type': 'application/json',
        }
      );

      const context = await testHelpers.context(source);
      context.environment.addService('request', request);

      const task = context.getActivityById('scriptTask');
      task.activate();

      const leave = task.waitFor('leave');
      task.inbound[0].take();
      const api = await leave;

      expect(api.content.output).to.include({
        data: 2,
      });
    });

    it('variables are editable and can be used for subsequent decisions', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <exclusiveGateway id="decision" default="flow4" />
        <scriptTask id="scriptTask" scriptFormat="Javascript">
          <script>
            <![CDATA[
              environment.variables.stopLoop = true;
              next();
            ]]>
          </script>
        </scriptTask>
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="decision" />
        <sequenceFlow id="flow2" sourceRef="decision" targetRef="scriptTask">
          <conditionExpression xsi:type="tFormalExpression" language="JavaScript"><![CDATA[
          !this.variables.stopLoop
          ]]></conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="flow3" sourceRef="scriptTask" targetRef="decision" />
        <sequenceFlow id="flow4" sourceRef="decision" targetRef="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      context.environment.assignVariables({ data: 1 });

      const task = context.getActivityById('scriptTask');
      task.activate();

      const leave = task.waitFor('leave');
      task.inbound[0].take();
      await leave;

      expect(context.environment.variables).to.have.property('stopLoop', true);
    });

    it('script with setTimeout that uses environment.timers', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="from-start" sourceRef="start" targetRef="scriptTask" />
          <scriptTask id="scriptTask" scriptFormat="Javascript">
            <script>
              <![CDATA[
                setTimeout(next, 1);
              ]]>
            </script>
          </scriptTask>
          <sequenceFlow id="to-end" sourceRef="scriptTask" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      let callback;

      const context = await testHelpers.context(source, {
        timers: new Timers({
          setTimeout(next) {
            callback = next;
          },
        }),
      });
      context.environment.assignVariables({ data: 1 });

      const task = context.getActivityById('scriptTask');
      task.activate();

      const leave = task.waitFor('leave');
      task.inbound[0].take();

      expect(callback).to.be.a('function');

      callback();

      return leave;
    });
  });

  describe('loop', () => {
    describe('sequential', () => {
      let context;
      beforeEach(async () => {
        context = await getLoopContext(true);
      });

      it('returns result from loop in sequence', async () => {
        const task = context.getActivityById('task');
        const leave = task.waitFor('leave');
        task.run();

        const api = await leave;

        expect(api.content.output).to.have.length(3);
        expect(api.content.output[0]).to.have.property('name', 'Pål');
        expect(api.content.output[1]).to.have.property('name', 'Franz');
        expect(api.content.output[2]).to.have.property('name', 'Immanuel');
      });
    });

    describe('parallell', () => {
      let context;
      beforeEach(async () => {
        context = await getLoopContext(false);
      });

      it('returns result from loop in sequence', async () => {
        const task = context.getActivityById('task');

        const leave = task.waitFor('leave');
        task.run();

        const api = await leave;

        expect(api.content.output).to.have.length(3);
        expect(api.content.output[0]).to.have.property('name', 'Pål');
        expect(api.content.output[1]).to.have.property('name', 'Franz');
        expect(api.content.output[2]).to.have.property('name', 'Immanuel');
      });
    });
  });
});

async function getLoopContext(sequential) {
  const source = `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="sequentialLoopProcess" isExecutable="true">
      <scriptTask id="task" scriptFormat="javascript">
        <multiInstanceLoopCharacteristics isSequential="${sequential}" js:collection="\${environment.variables.names}">
          <loopCardinality>\${environment.variables.names.length}</loopCardinality>
        </multiInstanceLoopCharacteristics>
        <script><![CDATA[
          environment.services.setTimeout(next, 25 - content.index * 5, null, {name: content.item});
        ]]></script>
      </scriptTask>
    </process>
  </definitions>`;
  const context = await testHelpers.context(source, {
    extensions,
  });
  context.environment.variables.names = ['Pål', 'Franz', 'Immanuel'];
  context.environment.addService('setTimeout', setTimeout);
  return context;
}
