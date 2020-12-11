import Definition from '../../src/definition/Definition';
import JsExtension from '../resources/extensions/JsExtension';
import testHelpers from '../helpers/testHelpers';

Feature('Stop and resume', () => {
  Scenario('Stop and resume at activity wait', () => {
    let definition;
    Given('a process with form start event, user task, looped user task, receive task, signal events, and message events', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:js="http://paed01.github.io/bpmn-engine/schema/2017/08/bpmn">
        <signal id="namedSignal" name="NamedSignal" />
        <message id="namedMessage" name="NamedMessage" />
        <process id="signalProcess" isExecutable="true">
          <startEvent id="start" js:formKey="start-form" />
          <sequenceFlow id="to-user-task" sourceRef="start" targetRef="user-task" />
          <userTask id="user-task" />
          <sequenceFlow id="to-parallell-task" sourceRef="user-task" targetRef="parallell-task" />
          <userTask id="parallell-task">
            <multiInstanceLoopCharacteristics isSequential="false">
              <loopCardinality>3</loopCardinality>
            </multiInstanceLoopCharacteristics>
          </userTask>
          <sequenceFlow id="to-receive" sourceRef="parallell-task" targetRef="receive" />
          <receiveTask id="receive" />
          <sequenceFlow id="to-sequential-task" sourceRef="receive" targetRef="sequential-task" />
          <receiveTask id="sequential-task">
            <multiInstanceLoopCharacteristics isSequential="true">
              <loopCardinality>3</loopCardinality>
            </multiInstanceLoopCharacteristics>
          </receiveTask>
          <sequenceFlow id="to-signal-event" sourceRef="sequential-task" targetRef="signal-event" />
          <intermediateCatchEvent id="signal-event">
            <signalEventDefinition />
          </intermediateCatchEvent>
          <sequenceFlow id="to-message-event" sourceRef="signal-event" targetRef="message-event" />
          <intermediateCatchEvent id="message-event">
            <messageEventDefinition />
          </intermediateCatchEvent>
          <sequenceFlow id="to-end" sourceRef="signal-event" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, {
        extensions: {
          js: JsExtension,
        }
      });
      definition = Definition(context);
    });

    let stoppedAt;
    const stoppedAtExecutionIds = [];
    And('a listener that will stop the process if waiting unless recovered', () => {
      definition.on('wait', (api) => {
        if (api.content.isRecovered) return;

        stoppedAt = api.id;

        stoppedAtExecutionIds.push(api.content.executionId);

        definition.stop();
      });
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run has stopped at start with form', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('start');
    });

    When('resumed and signaled', () => {
      definition.resume();
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
    });

    Then('run has stopped at user task', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('user-task');
    });

    When('resumed and signaled', () => {
      definition.resume();
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
    });

    Then('run has stopped at parallell looped activity', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('parallell-task');
    });

    When('resumed and signal all pending parallell iteration', () => {
      definition.resume();
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
    });

    Then('run has stopped at receive task', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('receive');
    });

    When('resumed and signaled', () => {
      definition.resume();
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
    });

    Then('run has stopped at first sequential looped activity iteration', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('sequential-task');
    });

    When('resumed and signaled', () => {
      definition.resume();
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
    });

    Then('run has stopped at second sequential looped activity iteration', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('sequential-task');
    });

    When('resumed and signaled', () => {
      definition.resume();
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
    });

    Then('run has stopped at third sequential looped activity iteration', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('sequential-task');
    });

    When('resumed and signaled', () => {
      definition.resume();
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
    });

    Then('run has stopped at anonymous signal event', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('signal-event');
    });

    When('resumed and anonymously signaled', () => {
      definition.resume();
      stoppedAtExecutionIds.shift();
      definition.signal();
    });

    Then('run has stopped at anonymous message event', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('message-event');
    });

    When('resumed and anonymously signaled', () => {
      definition.resume();
      stoppedAtExecutionIds.shift();
      definition.signal();
    });

    Then('run completes', () => {
      return end;
    });
  });
});
