import { IntermediateCatchEvent } from 'bpmn-elements/events';
import testHelpers from '../helpers/testHelpers.js';

describe('IntermediateCatchEvent', () => {
  describe('without event definitions', () => {
    let event;
    beforeEach(() => {
      event = IntermediateCatchEvent(/** @type {any} */ ({ id: 'emptyEvent' }), testHelpers.emptyContext());
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
        (_routingKey, message) => {
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
        (_routingKey, message) => {
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

  describe('with link event definition', () => {
    it('exposes linkNames on activity behaviour for a single-link catch', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="theProcess" isExecutable="true">
          <intermediateCatchEvent id="catch">
            <linkEventDefinition name="LINKA" />
          </intermediateCatchEvent>
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);
      const event = context.getActivityById('catch');
      expect(event.behaviour).to.have.property('linkNames').that.deep.equals(['LINKA']);
    });

    it('deduplicates repeated link names on the same activity', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="theProcess" isExecutable="true">
          <intermediateCatchEvent id="catch">
            <linkEventDefinition name="LINKA" />
            <linkEventDefinition name="LINKA" />
            <linkEventDefinition name="LINKB" />
          </intermediateCatchEvent>
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);
      const event = context.getActivityById('catch');
      expect(event.behaviour.linkNames).to.have.same.members(['LINKA', 'LINKB']);
      expect(event.behaviour.linkNames).to.have.length(2);
    });

    it('exposes all linkNames for a multi-link catch', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="theProcess" isExecutable="true">
          <intermediateCatchEvent id="catch">
            <linkEventDefinition name="LINKA" />
            <linkEventDefinition name="LINKB" />
          </intermediateCatchEvent>
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);
      const event = context.getActivityById('catch');
      expect(event.behaviour.linkNames).to.have.same.members(['LINKA', 'LINKB']);
    });

    it('routes a throw on a secondary link name to a multi-link catch', async () => {
      const { Definition } = await import('bpmn-elements');
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-throw" sourceRef="start" targetRef="throw" />
          <intermediateThrowEvent id="throw">
            <linkEventDefinition name="LINKB" />
          </intermediateThrowEvent>
          <intermediateCatchEvent id="catch">
            <linkEventDefinition name="LINKA" />
            <linkEventDefinition name="LINKB" />
          </intermediateCatchEvent>
          <sequenceFlow id="to-end" sourceRef="catch" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);
      const definition = new Definition(context);
      const end = definition.waitFor('end');
      definition.run();
      await end;
      expect(definition.getActivityById('catch').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end').counters).to.have.property('taken', 1);
    });

    it('a throw with multiple link names triggers catches for either name (one in process)', async () => {
      const { Definition } = await import('bpmn-elements');
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-throw" sourceRef="start" targetRef="throw" />
          <intermediateThrowEvent id="throw">
            <linkEventDefinition name="LINKA" />
            <linkEventDefinition name="LINKB" />
          </intermediateThrowEvent>
          <intermediateCatchEvent id="catchA">
            <linkEventDefinition name="LINKA" />
          </intermediateCatchEvent>
          <sequenceFlow id="to-endA" sourceRef="catchA" targetRef="endA" />
          <endEvent id="endA" />
          <intermediateCatchEvent id="catchB">
            <linkEventDefinition name="LINKB" />
          </intermediateCatchEvent>
          <sequenceFlow id="to-endB" sourceRef="catchB" targetRef="endB" />
          <endEvent id="endB" />
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);
      const definition = new Definition(context);
      const end = definition.waitFor('end');
      definition.run();
      await end;
      expect(definition.getActivityById('catchA').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('catchB').counters).to.have.property('taken', 1);
    });
  });
});
