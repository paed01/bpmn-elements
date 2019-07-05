import testHelpers from '../helpers/testHelpers';

describe('IntermediateThrowEvent', () => {
  it('without event definitions completes immediately', async () => {
    const source = `
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <intermediateThrowEvent id="emptyEvent" />
      </process>
    </definitions>`;

    const context = await testHelpers.context(source);
    const event = context.getActivityById('emptyEvent');
    const leave = event.waitFor('leave');

    event.run();

    await leave;

    expect(event.counters).to.have.property('taken', 1);
  });

  describe('with event definitions', () => {
    it('discards pending event definitions when event completes', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <intermediateThrowEvent id="event">
            <signalEventDefinition signalRef="mySignal" />
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">\${environment.variables.duration}</timeDuration>
            </timerEventDefinition>
          </intermediateThrowEvent>
        </process>
        <signal id="mySignal" />
      </definitions>`;
      const context = await testHelpers.context(source);
      context.environment.variables.duration = 'PT2S';

      const event = context.getActivityById('event');

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});

      const signaling = event.waitFor('signal');
      const leave = event.waitFor('leave');

      event.run();

      await signaling;

      await leave;

      const discarded = messages.filter(({fields}) => fields.routingKey === 'execute.discard');
      expect(discarded.map(({content}) => content.type)).to.have.same.members(['bpmn:TimerEventDefinition']);
    });
  });

  describe('with signal event definition', () => {
    const source = `
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="event" />
        <intermediateThrowEvent id="event">
          <signalEventDefinition signalRef="mySignal" />
        </intermediateThrowEvent>
        <sequenceFlow id="flow2" sourceRef="event" targetRef="end" />
        <endEvent id="end" />
      </process>
      <signal id="mySignal" name="Signaled by \${content.id}" />
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('emits signal with message that is signal', async () => {
      const event = context.getActivityById('event');

      const leave = event.waitFor('leave');
      const signal = event.waitFor('signal');

      event.run();

      const api = await signal;

      expect(api.content.message).to.eql({
        id: 'mySignal',
        type: 'bpmn:Signal',
        name: 'Signaled by event',
      });

      await leave;

      expect(event.counters).to.have.property('taken', 1);
    });
  });
});
