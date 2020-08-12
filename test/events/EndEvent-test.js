import EndEvent from '../../src/events/EndEvent';
import SequenceFlow from '../../src/flows/SequenceFlow';
import testHelpers from '../helpers/testHelpers';

describe('EndEvent', () => {
  describe('behaviour', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="end" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('completes immediately', async () => {
      const event = context.getActivityById('end');
      const leave = event.waitFor('leave');

      event.run();

      await leave;

      expect(event.counters).to.have.property('taken', 1);
    });
  });

  describe('with TerminateEventDefinition', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="theStart" />
        <endEvent id="fatal">
          <terminateEventDefinition />
        </endEvent>
        <endEvent id="theEnd1" />
        <endEvent id="theEnd2" />
        <endEvent id="theEnd3" />
        <sequenceFlow id="flow1" sourceRef="theStart" targetRef="fatal" />
        <sequenceFlow id="flow2" sourceRef="theStart" targetRef="theEnd1" />
        <sequenceFlow id="flow3" sourceRef="theStart" targetRef="theEnd2" />
        <sequenceFlow id="flow4" sourceRef="theStart" targetRef="theEnd3" />
      </process>
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('emits an terminate event', async () => {
      const event = context.getActivityById('fatal');
      const leave = event.waitFor('leave');

      let message;
      event.broker.subscribeOnce('event', 'process.terminate', (_, msg) => {
        message = msg;
      });

      event.activate();
      event.inbound[0].take();

      await leave;

      expect(message).to.be.ok;
    });
  });

  describe('with ErrorEventDefinition', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="theStart" />
        <endEvent id="endInError">
          <errorEventDefinition errorRef="myError" />
        </endEvent>
        <endEvent id="theEnd1" />
        <endEvent id="theEnd2" />
        <endEvent id="theEnd3" />
        <sequenceFlow id="flow1" sourceRef="theStart" targetRef="endInError" />
        <sequenceFlow id="flow2" sourceRef="theStart" targetRef="theEnd1" />
        <sequenceFlow id="flow3" sourceRef="theStart" targetRef="theEnd2" />
        <sequenceFlow id="flow4" sourceRef="theStart" targetRef="theEnd3" />
      </process>
      <error id="myError" errorCode="ERR_MYERR" name="MyError" />
    </definitions>`;

    let context;
    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('emits an error event', async () => {
      const event = context.getActivityById('endInError');
      const error = event.waitFor('throw');

      event.activate();
      event.inbound[0].take();

      const err = await error;

      expect(err).to.be.ok;
    });
  });

  describe('with multiple inbounds', () => {
    it('publish enter or discard on each inbound', async () => {
      const parent = {id: 'process'};
      const context = testHelpers.emptyContext({
        getInboundSequenceFlows() {
          return [{
            id: 'flow1',
            parent,
            Behaviour: SequenceFlow
          }, {
            id: 'flow2',
            parent,
            Behaviour: SequenceFlow
          }, {
            id: 'flow3',
            parent,
            Behaviour: SequenceFlow
          }];
        }
      });

      const event = EndEvent({
        type: 'bpmn:EndEvent',
        id: 'end',
        parent,
      }, context);

      event.activate();

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.enter', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});
      event.broker.subscribeTmp('event', 'activity.discard', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      context.getInboundSequenceFlows()[0].discard();
      context.getInboundSequenceFlows()[1].take();
      context.getInboundSequenceFlows()[2].discard();

      expect(event.counters).to.have.property('taken', 1);
      expect(event.counters).to.have.property('discarded', 2);

      expect(messages).to.have.length(3);

      expect(messages[0].content).to.have.property('inbound').with.length(1);
      expect(messages[0].content.inbound[0]).to.have.property('id', 'flow1');
      expect(messages[0].content.inbound[0]).to.have.property('action', 'discard');
      expect(messages[1].content.inbound[0]).to.have.property('id', 'flow2');
      expect(messages[1].content.inbound[0]).to.have.property('action', 'take');
      expect(messages[2].content.inbound[0]).to.have.property('id', 'flow3');
      expect(messages[2].content.inbound[0]).to.have.property('action', 'discard');
    });
  });
});
