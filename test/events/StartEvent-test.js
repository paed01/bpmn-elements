import JsExtension from '../resources/extensions/JsExtension.js';
import MessageEventDefinition from '../../src/eventDefinitions/MessageEventDefinition.js';
import StartEvent from '../../src/events/StartEvent.js';
import testHelpers from '../helpers/testHelpers.js';

describe('StartEvent', () => {
  describe('behaviour', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('completes immediately', async () => {
      const event = context.getActivityById('start');
      const leave = event.waitFor('leave');

      event.run();

      await leave;

      expect(event.counters).to.have.property('taken', 1);
    });
  });

  describe('with form', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" js:formKey="my-form" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source, {
        extensions: {
          js: JsExtension,
        },
      });
    });

    it('requires signal to complete', async () => {
      const event = context.getActivityById('start');

      const wait = event.waitFor('wait');
      const leave = event.waitFor('leave');

      event.run();

      const waitApi = await wait;
      waitApi.signal({
        formfield1: 1,
        formfield2: 2,
      });

      const api = await leave;

      expect(api.content.output).to.eql({
        formfield1: 1,
        formfield2: 2,
      });
    });

    it('stopped while waiting cancels all listeners', async () => {
      const event = context.getActivityById('start');

      const wait = event.waitFor('wait');

      event.run();

      const waitApi = await wait;
      waitApi.stop();

      expect(event.broker.getExchange('api')).to.have.property('bindingCount', 0);
      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('discarded while waiting discards run and ignores signal', async () => {
      const event = context.getActivityById('start');

      const wait = event.waitFor('wait');

      event.run();

      const waitApi = await wait;
      waitApi.discard();

      expect(event.counters).to.have.property('discarded', 1);
      expect(event.counters).to.have.property('taken', 0);

      waitApi.signal();

      expect(event.counters).to.have.property('taken', 0);
      expect(event.counters).to.have.property('discarded', 1);
    });

    it('keeps state when stopped', async () => {
      const event = context.getActivityById('start');

      const wait = event.waitFor('wait');

      event.run();

      await wait;

      event.stop();

      const runQ = event.broker.getQueue('run-q');
      expect(runQ).to.have.property('messageCount', 1);
      expect(runQ).to.have.property('consumerCount', 0);
      expect(runQ.peek()).to.have.property('fields').with.property('routingKey', 'run.execute');
      expect(runQ.peek()).to.have.property('content').with.property('form').that.eql({
        type: 'js:formkey',
        key: 'my-form',
      });

      const executeQ = event.broker.getQueue('execute-q');
      expect(executeQ).to.have.property('messageCount', 1);
      expect(executeQ).to.have.property('consumerCount', 0);
      expect(executeQ.peek()).to.have.property('fields').with.property('routingKey', 'execute.start');
    });

    it('ignores delegated api signals if not delegated', async () => {
      const event = context.getActivityById('start');

      const wait = event.waitFor('wait');

      event.run();
      await wait;

      event.broker.publish(
        'api',
        'definition.signal.some-id',
        {
          message: {
            id: 'start',
          },
        },
        { delegate: false }
      );

      expect(event.counters).property('taken', 0);
    });

    it('ignores delegated api signals if no content message', async () => {
      const event = context.getActivityById('start');

      const wait = event.waitFor('wait');

      event.run();
      await wait;

      event.broker.publish('api', 'definition.signal.some-id', {}, { delegate: true });

      expect(event.counters).property('taken', 0);
    });

    it('ignores delegated api signals if id doesn´t match', async () => {
      const event = context.getActivityById('start');

      const wait = event.waitFor('wait');

      event.run();
      await wait;

      event.broker.publish(
        'api',
        'definition.signal.some-id',
        {
          message: {
            id: 'end',
          },
        },
        { delegate: true }
      );

      expect(event.counters).property('taken', 0);
    });
  });

  describe('with MessageEventDefinition', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start">
          <messageEventDefinition />
        </startEvent>
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="end" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('requires signal to complete', async () => {
      const event = context.getActivityById('start');
      const wait = event.waitFor('wait');
      const leave = event.waitFor('leave');

      event.run();

      const waitApi = await wait;
      waitApi.signal(1);

      const api = await leave;

      expect(api.content.output).to.equal(1);
    });

    it('keeps state when stopped', async () => {
      const event = context.getActivityById('start');

      const wait = event.waitFor('wait');

      event.run();

      await wait;

      event.stop();

      const runQ = event.broker.getQueue('run-q');
      expect(runQ).to.have.property('messageCount', 1);
      expect(runQ).to.have.property('consumerCount', 0);
      expect(runQ.peek()).to.have.property('fields').with.property('routingKey', 'run.execute');

      const executeQ = event.broker.getQueue('execute-q');
      expect(executeQ).to.have.property('messageCount', 2);
      expect(executeQ).to.have.property('consumerCount', 0);
      expect(executeQ.messages[0]).to.have.property('fields').with.property('routingKey', 'execute.update');
      expect(executeQ.messages[0]).to.have.property('content').with.property('type', 'bpmn:StartEvent');
      expect(executeQ.messages[1]).to.have.property('fields').with.property('routingKey', 'execute.start');
      expect(executeQ.messages[1]).to.have.property('content').with.property('type', 'bpmn:MessageEventDefinition');
    });
  });

  describe('with TimerEventDefinition', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start">
          <timerEventDefinition>
            <timeDuration xsi:type="tFormalExpression">PT0.01S</timeDuration>
          </timerEventDefinition>
        </startEvent>
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="end" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('postpones complete until duration', async () => {
      const event = context.getActivityById('start');
      const leave = event.waitFor('leave');

      event.run();
      await leave;
    });
  });

  describe('with ConditionalEventDefinition', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start">
          <conditionalEventDefinition>
            <condition xsi:type="tFormalExpression">\${environment.variables.conditionMet}</condition>
          </conditionalEventDefinition>
        </startEvent>
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="end" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('emits wait', async () => {
      const event = context.getActivityById('start');
      const wait = event.waitFor('wait');

      event.run();

      const api = await wait;
      expect(api.content.parent).to.have.property('id', 'theProcess');
    });

    it('completes when signaled and condition is met', async () => {
      const event = context.getActivityById('start');
      const wait = event.waitFor('wait');
      const leave = event.waitFor('leave');

      event.run();

      const waitApi = await wait;

      context.environment.variables.conditionMet = true;

      expect(event.counters).to.have.property('taken', 0);
      expect(event.counters).to.have.property('discarded', 0);

      waitApi.signal();

      await leave;

      expect(event.counters).to.have.property('taken', 1);
      expect(event.counters).to.have.property('discarded', 0);
    });

    it('completes immediately if condtion is met', () => {
      context.environment.variables.conditionMet = true;

      const event = context.getActivityById('start');
      const leave = event.waitFor('leave');

      event.run();

      return leave;
    });
  });

  describe('multiple event definitions', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start">
          <timerEventDefinition>
            <timeDuration xsi:type="tFormalExpression">\${environment.variables.timeout}</timeDuration>
          </timerEventDefinition>
          <messageEventDefinition />
        </startEvent>
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="end" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('cancels other executing definitions when first completes', async () => {
      context.environment.variables.timeout = 'PT2S';

      const event = context.getActivityById('start');
      const leave = event.waitFor('leave');
      const wait = event.waitFor('wait');

      const discarded = [];
      event.broker.subscribeTmp(
        'execution',
        'execute.discard',
        (_, message) => {
          discarded.push(message);
        },
        { noAck: true }
      );

      event.run();

      const api = await wait;
      api.signal({
        output: 1,
      });

      await leave;

      expect(discarded[0].fields).to.have.property('routingKey', 'execute.discard');
      expect(discarded[0].content).to.have.property('type', 'bpmn:TimerEventDefinition');
    });
  });

  describe('stop', () => {
    it('on enter cancels all listeners', () => {
      const event = StartEvent(
        {
          id: 'start',
        },
        testHelpers.emptyContext()
      );

      event.once('enter', (api) => api.stop());

      event.run();

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('on start cancels all listeners', () => {
      const event = StartEvent(
        {
          id: 'start',
        },
        testHelpers.emptyContext()
      );

      event.once('start', (api) => api.stop());

      event.run();

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('on wait cancels all listeners', () => {
      const event = StartEvent(
        {
          id: 'start',
          type: 'startevent',
          behaviour: {
            eventDefinitions: [{ Behaviour: MessageEventDefinition }],
          },
        },
        testHelpers.emptyContext()
      );

      event.once('wait', (api) => api.stop());

      event.run();

      expect(event.broker).to.have.property('consumerCount', 0);
    });
  });

  describe('discard', () => {
    it('on enter discards run', () => {
      const event = StartEvent(
        {
          id: 'start',
        },
        testHelpers.emptyContext()
      );

      event.once('enter', (api) => api.discard());

      event.run();

      expect(event.counters).to.have.property('discarded', 1);
    });

    it('on start discards run', () => {
      const event = StartEvent(
        {
          id: 'start',
        },
        testHelpers.emptyContext()
      );

      event.once('start', (api) => api.discard());

      event.run();

      expect(event.counters).to.have.property('discarded', 1);
    });

    it('discard on message wait discards run and ignores signal', () => {
      const event = StartEvent(
        {
          id: 'start',
          type: 'startevent',
          behaviour: {
            eventDefinitions: [{ Behaviour: MessageEventDefinition }],
          },
        },
        testHelpers.emptyContext()
      );

      event.once('wait', (api) => {
        api.discard();
        api.signal();
      });

      event.run();

      expect(event.counters).to.have.property('discarded', 1);
      expect(event.counters).to.have.property('taken', 0);
    });

    it('discard on form wait discards run and ignores signal', () => {
      const event = StartEvent(
        {
          id: 'start',
          type: 'startevent',
          behaviour: {},
        },
        testHelpers.emptyContext()
      );

      event.once('enter', () => event.broker.publish('format', 'run.enter', { form: { key: 1 } }));
      event.once('wait', (api) => {
        api.discard();
        api.signal();
      });

      event.run();

      expect(event.counters).to.have.property('discarded', 1);
      expect(event.counters).to.have.property('taken', 0);
    });
  });
});
