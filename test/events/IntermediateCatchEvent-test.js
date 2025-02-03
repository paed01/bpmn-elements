import IntermediateCatchEvent from '../../src/events/IntermediateCatchEvent.js';
import testHelpers from '../helpers/testHelpers.js';

describe('IntermediateCatchEvent', () => {
  describe('without event definitions', () => {
    let event;
    beforeEach(() => {
      event = IntermediateCatchEvent({ id: 'emptyEvent' }, testHelpers.emptyContext());
    });

    it('completes when signaled', async () => {
      const wait = event.waitFor('wait');
      const leave = event.waitFor('leave');

      event.run();
      (await wait).signal();

      await leave;

      expect(event.counters).to.have.property('taken', 1);
    });

    it('completes when messaged', async () => {
      const wait = event.waitFor('wait');
      const leave = event.waitFor('leave');

      event.run();
      (await wait).sendApiMessage('message');

      await leave;

      expect(event.counters).to.have.property('taken', 1);
    });

    it('leaves when discarded by api', async () => {
      const wait = event.waitFor('wait');
      const leave = event.waitFor('leave');

      event.run();
      (await wait).discard();

      await leave;

      expect(event.counters).to.have.property('discarded', 1);
    });

    it('clears listeners when stopped', async () => {
      const wait = event.waitFor('wait');

      event.run();
      (await wait).stop();

      expect(event.broker).to.have.property('consumerCount', 0);
    });
  });

  describe('with event definitions', () => {
    let context;
    beforeEach(async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <intermediateCatchEvent id="event">
            <messageEventDefinition />
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">\${environment.variables.duration}</timeDuration>
            </timerEventDefinition>
          </intermediateCatchEvent>
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
      context.environment.variables.duration = 'PT2S';
    });

    it('discards pending event definitions when event completes', async () => {
      const event = context.getActivityById('event');

      const messages = [];
      event.broker.subscribeTmp(
        'execution',
        'execute.*',
        (routingKey, message) => {
          messages.push(message);
        },
        { noAck: true }
      );

      const wait = event.waitFor('wait');
      const leave = event.waitFor('leave');

      event.run();

      const api = await wait;

      api.signal();

      await leave;

      const discarded = messages.filter(({ fields }) => fields.routingKey === 'execute.discard');
      expect(discarded.map(({ content }) => content.type)).to.have.same.members(['bpmn:TimerEventDefinition']);
    });

    it('discards all event definitions if discarded while executing', async () => {
      const event = context.getActivityById('event');

      const messages = [];
      event.broker.subscribeTmp(
        'execution',
        'execute.*',
        (routingKey, message) => {
          messages.push(message);
        },
        { noAck: true }
      );

      const wait = event.waitFor('wait');
      const leave = event.waitFor('leave');

      event.run();

      await wait;
      event.getApi().discard();

      await leave;

      expect(event.counters).to.have.property('discarded', 1);

      const discarded = messages.filter(({ fields }) => fields.routingKey === 'execute.discard');
      expect(discarded.map(({ content }) => content.type)).to.have.members(['bpmn:MessageEventDefinition', 'bpmn:TimerEventDefinition']);
    });
  });

  describe('with timer event definition', () => {
    const source = `
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="timeoutEvent" />
        <intermediateCatchEvent id="timeoutEvent">
          <timerEventDefinition>
            <timeDuration xsi:type="tFormalExpression">\${environment.variables.duration}</timeDuration>
          </timerEventDefinition>
        </intermediateCatchEvent>
        <sequenceFlow id="flow2" sourceRef="timeoutEvent" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
      context.environment.variables.duration = 'PT0.01S';
    });

    it('completes when timeout occur', async () => {
      const event = context.getActivityById('timeoutEvent');

      const leave = event.waitFor('leave');

      event.run();

      await leave;

      expect(event.counters).to.have.property('taken', 1);
    });

    it('is discarded if discarded while executing', async () => {
      context.environment.variables.duration = 'PT2S';

      const event = context.getActivityById('timeoutEvent');

      const leave = event.waitFor('leave');
      const timer = event.waitFor('timer');

      event.run();

      const api = await timer;
      api.discard();

      await leave;

      expect(event.counters).to.have.property('discarded', 1);
    });
  });

  describe('with message event definition', () => {
    const source = `
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="event" />
        <intermediateCatchEvent id="event">
          <messageEventDefinition />
        </intermediateCatchEvent>
        <sequenceFlow id="flow2" sourceRef="event" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('completes when wait event api is signaled', async () => {
      const event = context.getActivityById('event');

      const leave = event.waitFor('leave');
      const wait = event.waitFor('wait');

      event.run();

      const api = await wait;

      api.signal();

      await leave;

      expect(event.counters).to.have.property('taken', 1);
    });

    it('completes when parent event api is signaled', async () => {
      const event = context.getActivityById('event');

      const leave = event.waitFor('leave');
      const wait = event.waitFor('wait');

      event.run();

      await wait;

      event.getApi().signal({ data: 1 });

      await leave;

      expect(event.counters).to.have.property('taken', 1);
    });
  });

  describe('with conditional event definition', () => {
    const source = `
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="event" />
        <intermediateCatchEvent id="event">
          <conditionalEventDefinition>
            <condition xsi:type="tFormalExpression">\${environment.variables.conditionMet}</condition>
          </conditionalEventDefinition>
        </intermediateCatchEvent>
        <sequenceFlow id="flow2" sourceRef="event" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('completes when event is signaled and condition is met', async () => {
      const event = context.getActivityById('event');

      const leave = event.waitFor('leave');
      const wait = event.waitFor('wait');

      event.run();

      const api = await wait;

      event.environment.variables.conditionMet = true;
      api.signal();

      await leave;

      expect(event.counters).to.have.property('taken', 1);
    });

    it('completes when parent event api is signaled', async () => {
      const event = context.getActivityById('event');

      const leave = event.waitFor('leave');
      const wait = event.waitFor('wait');

      event.run();

      await wait;

      event.environment.variables.conditionMet = true;
      event.getApi().signal({ data: 1 });

      await leave;

      expect(event.counters).to.have.property('taken', 1);
    });

    it('keeps waiting if condition is not met', async () => {
      const event = context.getActivityById('event');
      const wait = event.waitFor('wait');

      event.run();

      await wait;

      event.getApi().signal({ data: 1 });

      expect(event.counters).to.have.property('taken', 0);
    });

    it('completes immediately if condition is met on execute', async () => {
      context.environment.variables.conditionMet = true;
      const event = context.getActivityById('event');

      const leave = event.waitFor('leave');
      event.run();

      await leave;

      expect(event.counters).to.have.property('taken', 1);
    });
  });
});
