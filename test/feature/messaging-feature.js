import Definition from '../../src/definition/Definition';
import testHelpers from '../helpers/testHelpers';

Feature('Messaging', () => {
  Scenario('A process that expects message to start', () => {
    let definition;
    Given('two start events, both waiting for a message and conforming to an exclusive gateway', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="messageProcess" isExecutable="true">
          <startEvent id="start1">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <startEvent id="start2">
            <messageEventDefinition messageRef="Message2" />
          </startEvent>
          <sequenceFlow id="from12gateway" sourceRef="start1" targetRef="gateway" />
          <sequenceFlow id="from22gateway" sourceRef="start2" targetRef="gateway" />
          <exclusiveGateway id="gateway" />
        </process>
        <message id="Message1" name="Start by name" />
        <message id="Message2" name="Start by me" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = Definition(context);
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    let start1, start2;
    Then('both start events are waiting for message', async () => {
      [start1, start2] = definition.getPostponed();
      expect(start1).to.have.property('id', 'start1');
      expect(start2).to.have.property('id', 'start2');
    });

    When('first start event is signaled', () => {
      start1.signal();
    });

    Then('definition completes', () => {
      return end;
    });

    And('first start event is taken', () => {
      expect(start1.owner.counters).to.have.property('taken', 1);
      expect(start1.owner.counters).to.have.property('discarded', 0);
    });

    And('second start event is discarded', () => {
      expect(start2.owner.counters).to.have.property('taken', 0);
      expect(start2.owner.counters).to.have.property('discarded', 1);
    });

    And('gateway is taken and discarded', () => {
      expect(definition.getActivityById('gateway').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('gateway').counters).to.have.property('discarded', 1);
    });
  });
});
