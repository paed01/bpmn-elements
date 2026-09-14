import { Definition } from 'bpmn-elements';
import testHelpers from '../helpers/testHelpers.js';

Feature('ParallelMultiple event', () => {
  Scenario('Intermediate catch event with parallelMultiple set', () => {
    let context, definition;
    Given('a process with an intermediate catch event awaiting two messages in parallel', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <message id="Message1" name="One" />
        <message id="Message2" name="Two" />
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-catch" sourceRef="start" targetRef="catch" />
          <intermediateCatchEvent id="catch" parallelMultiple="true">
            <messageEventDefinition id="def1" messageRef="Message1" />
            <messageEventDefinition id="def2" messageRef="Message2" />
          </intermediateCatchEvent>
          <sequenceFlow id="to-end" sourceRef="catch" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    let completed;
    When('running', () => {
      definition = new Definition(context);
      completed = definition.waitFor('leave');
      definition.run();
    });

    let catchActivity;
    Then('the catch event is waiting', () => {
      [catchActivity] = definition.getPostponed();
      expect(catchActivity).to.have.property('id', 'catch');
    });

    When('the first message arrives', () => {
      definition.signal({ id: 'Message1' });
    });

    Then('the catch event is still waiting for the second', () => {
      expect(catchActivity.owner.isRunning, 'still running after one of two').to.be.true;
      expect(definition.getPostponed()[0]).to.have.property('id', 'catch');
    });

    When('the second message arrives', () => {
      definition.signal({ id: 'Message2' });
    });

    Then('the definition completes', () => {
      return completed;
    });
  });

  Scenario('Stop and resume a waiting parallelMultiple catch event', () => {
    let context, definition, state;
    Given('a process with a parallelMultiple catch event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <message id="Message1" name="One" />
        <message id="Message2" name="Two" />
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-catch" sourceRef="start" targetRef="catch" />
          <intermediateCatchEvent id="catch" parallelMultiple="true">
            <messageEventDefinition id="def1" messageRef="Message1" />
            <messageEventDefinition id="def2" messageRef="Message2" />
          </intermediateCatchEvent>
          <sequenceFlow id="to-end" sourceRef="catch" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    When('running and the first message arrives', () => {
      definition = new Definition(context);
      definition.run();
      definition.signal({ id: 'Message1' });
    });

    And('the definition is stopped and state is saved', () => {
      definition.stop();
      state = definition.getState();
    });

    let completed;
    And('recovered and resumed', () => {
      const recovered = new Definition(context.clone()).recover(JSON.parse(JSON.stringify(state)));
      completed = recovered.waitFor('leave');
      recovered.resume();
      definition = recovered;
    });

    Then('the catch event is still waiting after resume', () => {
      expect(definition.getPostponed()[0], 'the first message must not need to be re-sent').to.have.property('id', 'catch');
    });

    When('the second message arrives after resume', () => {
      definition.signal({ id: 'Message2' });
    });

    Then('the definition completes', () => {
      return completed;
    });
  });
});
