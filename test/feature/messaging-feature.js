import Definition from '../../src/definition/Definition.js';
import testHelpers from '../helpers/testHelpers.js';

Feature('Messaging', () => {
  Scenario('A process that expects message to start', () => {
    let definition;
    Given('two start events, both waiting for a message and arriving at the same exclusive gateway', async () => {
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
      definition = new Definition(context);
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    let start1, start2;
    Then('both start events are waiting for message', () => {
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

  Scenario('A process that expects message to continue', () => {
    let definition;
    Given('a start waiting for message 1, two intermediate catch events, both waiting for separate messages - 2 & 3 - and arrive at the same end', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="messageProcess" isExecutable="true">
          <startEvent id="start">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <sequenceFlow id="toInterim1" sourceRef="start" targetRef="interim1" />
          <sequenceFlow id="toInterim2" sourceRef="start" targetRef="interim2" />
          <intermediateCatchEvent id="interim1">
            <messageEventDefinition messageRef="Message2" />
          </intermediateCatchEvent>
          <intermediateCatchEvent id="interim2">
            <messageEventDefinition messageRef="Message3" />
          </intermediateCatchEvent>
          <sequenceFlow id="toEnd1" sourceRef="interim1" targetRef="end" />
          <sequenceFlow id="toEnd2" sourceRef="interim2" targetRef="end" />
          <endEvent id="end" />
        </process>
        <message id="Message1" name="Start message" />
        <message id="Message2" name="Intermediate message 1" />
        <message id="Message3" name="Intermediate message 2" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('message 2 is sent', () => {
      definition.sendMessage(definition.getElementById('Message2').resolve());
    });

    And('message 3 is sent', () => {
      definition.sendMessage(definition.getElementById('Message3').resolve());
    });

    Then('start is still waiting for message 1', () => {
      const postponed = definition.getPostponed();
      expect(postponed).to.have.length(1);
      expect(postponed[0]).to.property('id', 'start');
    });

    When('message 1 arrives', () => {
      definition.sendMessage(definition.getElementById('Message1').resolve());
    });

    Then('definition completes', () => {
      return end;
    });

    And('the intermediate catch events were taken', () => {
      expect(definition.getActivityById('interim1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('interim2').counters).to.have.property('taken', 1);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('message 1 arrives', () => {
      definition.sendMessage(definition.getElementById('Message1').resolve());
    });

    Then('start event caught message and intermediate catch events are waiting for messages', () => {
      const postponed = definition.getPostponed();

      expect(postponed[0]).to.property('id', 'interim1');
      expect(postponed[1]).to.property('id', 'interim2');

      expect(postponed).to.have.length(2);
    });

    When('message 3 is sent', () => {
      definition.sendMessage(definition.getElementById('Message3').resolve());
    });

    Then('first intermediate catch event is still waiting are waiting for messages', () => {
      const postponed = definition.getPostponed();
      expect(postponed[0]).to.property('id', 'interim1');
    });

    When('message 2 is sent', () => {
      definition.sendMessage(definition.getElementById('Message2').resolve());
    });

    Then('definition completes', () => {
      return end;
    });

    And('all events were taken', () => {
      expect(definition.getActivityById('start').counters).to.have.property('taken', 2);
      expect(definition.getActivityById('interim1').counters).to.have.property('taken', 2);
      expect(definition.getActivityById('interim2').counters).to.have.property('taken', 2);
      expect(definition.getActivityById('end').counters).to.have.property('taken', 4);
    });
  });

  Scenario('A participant process that expects thrown message to start', () => {
    let definition;
    Given('a intermediate throw event with message, and participant process with a start event waiting for that message', async () => {
      const source = `
      <definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="mainProcess" isExecutable="true">
          <startEvent id="start1" />
          <sequenceFlow id="toTask" sourceRef="start1" targetRef="send" />
          <intermediateThrowEvent id="send">
            <messageEventDefinition messageRef="Message1" />
          </intermediateThrowEvent>
        </process>
        <process id="participantProcess">
          <startEvent id="start2">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <sequenceFlow id="toEnd" sourceRef="start2" targetRef="end" />
          <endEvent id="end" />
        </process>
        <message id="Message1" name="Start message" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end;
    let main, participant;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('definition completes', () => {
      return end;
    });

    And('main process completed', () => {
      [main, participant] = definition.getProcesses();
      expect(main.counters).to.have.property('completed', 1);
    });

    And('participant process completed', () => {
      expect(participant.counters).to.have.property('completed', 1);
    });

    And('all activities were taken', () => {
      expect(definition.getActivityById('start1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('send').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('start2').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end').counters).to.have.property('taken', 1);
    });
  });

  Scenario('Message flow targets participant process start activity', () => {
    let definition;
    Given('a task with formatted end message and message flow to participant process, and a start event waiting for that message', async () => {
      const source = `
      <definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:js="http://paed01.github.io/bpmn-engine/schema/2017/08/bpmn">
        <collaboration id="Collaboration_0">
          <messageFlow id="fromMainToParticipant" sourceRef="send" targetRef="start2" />
        </collaboration>
        <process id="mainProcess" isExecutable="true">
          <startEvent id="start1" />
          <sequenceFlow id="toTask" sourceRef="start1" targetRef="send" />
          <endEvent id="send">
            <messageEventDefinition messageRef="Message1" />
          </endEvent>
        </process>
        <process id="participantProcess">
          <startEvent id="start2">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <sequenceFlow id="toEnd" sourceRef="start2" targetRef="end" />
          <endEvent id="end" />
        </process>
        <message id="Message1" name="Start message" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end;
    let main, participant;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      [main, participant] = definition.getProcesses();
      definition.run();
    });

    Then('definition completes', () => {
      return end;
    });

    And('main process completed', () => {
      expect(main.counters).to.have.property('completed', 1);
    });

    And('participant process completed', () => {
      expect(participant.counters).to.have.property('completed', 1);
    });

    And('all activities were taken', () => {
      expect(definition.getActivityById('start1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('send').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('start2').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end').counters).to.have.property('taken', 1);
    });
  });

  Scenario('Message flow targets participant lane', () => {
    let definition;
    Given('a task with formatted end message and message flow to participant process, and a start event waiting for that message', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <collaboration id="Collaboration_0">
          <messageFlow id="fromMainToParticipant" sourceRef="send" targetRef="lane2" />
          <participant id="lane2" name="Participant" processRef="participantProcess" />
        </collaboration>
        <process id="mainProcess" isExecutable="true">
          <startEvent id="start1" />
          <sequenceFlow id="toTask" sourceRef="start1" targetRef="send" />
          <endEvent id="send">
            <messageEventDefinition messageRef="Message1" />
          </endEvent>
        </process>
        <process id="participantProcess">
          <startEvent id="start2">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <sequenceFlow id="toEnd" sourceRef="start2" targetRef="end" />
          <endEvent id="end" />
        </process>
        <message id="Message1" name="Start message" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end;
    let main, participant;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      [main, participant] = definition.getProcesses();
      definition.run();
    });

    Then('definition completes', () => {
      return end;
    });

    And('main process completed', () => {
      expect(main.counters).to.have.property('completed', 1);
    });

    And('participant process completed', () => {
      expect(participant.counters).to.have.property('completed', 1);
    });

    And('all activities were taken', () => {
      expect(definition.getActivityById('start1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('send').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('start2').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end').counters).to.have.property('taken', 1);
    });
  });

  Scenario('Message flow emanates from lane', () => {
    let definition;
    Given('a task with formatted end message and message flow to participant process, and a start event waiting for that message', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <collaboration id="Collaboration_0">
          <messageFlow id="fromMainToParticipant" sourceRef="mainProcess" targetRef="lane2" />
          <participant id="lane2" name="Participant" processRef="participantProcess" />
        </collaboration>
        <process id="mainProcess" isExecutable="true">
          <startEvent id="start1" />
          <sequenceFlow id="toTask" sourceRef="start1" targetRef="send" />
          <endEvent id="send">
            <messageEventDefinition messageRef="Message1" />
          </endEvent>
        </process>
        <process id="participantProcess">
          <startEvent id="start2">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <sequenceFlow id="toEnd" sourceRef="start2" targetRef="end" />
          <endEvent id="end" />
        </process>
        <message id="Message1" name="Start message" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end;
    let main, participant;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      [main, participant] = definition.getProcesses();
      definition.run();
    });

    Then('definition completes', () => {
      return end;
    });

    And('main process completed', () => {
      expect(main.counters).to.have.property('completed', 1);
    });

    And('participant process completed', () => {
      expect(participant.counters).to.have.property('completed', 1);
    });

    And('all activities were taken', () => {
      expect(definition.getActivityById('start1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('send').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('start2').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end').counters).to.have.property('taken', 1);
    });
  });

  Scenario('Message flow targets empty participant lane', () => {
    let definition;
    Given('a task with formatted end message and message flow to participant process, and a start event waiting for that message', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <collaboration id="Collaboration_0">
          <messageFlow id="fromMain2Participant" sourceRef="send" targetRef="lane2" />
          <messageFlow id="fromParticipant2Main" sourceRef="lane2" targetRef="receive" />
          <participant id="lane1" name="Main" processRef="mainProcess" />
          <participant id="lane2" name="Participant" processRef="participantProcess" />
        </collaboration>
        <process id="mainProcess" isExecutable="true">
          <startEvent id="start1" />
          <sequenceFlow id="toTask" sourceRef="start1" targetRef="send" />
          <intermediateThrowEvent id="send">
            <messageEventDefinition messageRef="Message1" />
          </intermediateThrowEvent>
          <sequenceFlow id="toReceive" sourceRef="send" targetRef="receive" />
          <intermediateCatchEvent id="receive">
            <messageEventDefinition messageRef="Message2" />
          </intermediateCatchEvent>
        </process>
        <process id="participantProcess" />
        <message id="Message1" name="Start message" />
        <message id="Message2" name="Second message" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end;
    let main, participant;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      [main, participant] = definition.getProcesses();
      definition.run();
    });

    Then('main process waits for message from participant', () => {
      expect(main.counters).to.have.property('completed', 0);
      expect(main.getPostponed()[0]).to.have.property('id', 'receive');
    });

    And('participant process is postponed since nothing happened', () => {
      expect(participant.counters).to.have.property('completed', 0);
    });

    When('a manual procedure is ran to send message to complete main process', () => {
      main.getPostponed()[0].signal();
    });

    Then('definition completes', () => {
      return end;
    });

    And('all activities were taken', () => {
      expect(definition.getActivityById('start1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('send').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('receive').counters).to.have.property('taken', 1);
    });
  });

  Scenario('Both message flow and throw message targeting the same activity', () => {
    let definition;
    Given('a intermediate throw event with message, and message flow to an participant process with a start event waiting for that message', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <collaboration id="Collaboration_0">
          <messageFlow id="fromMainToParticipant" sourceRef="send" targetRef="start2" />
        </collaboration>
        <process id="mainProcess" isExecutable="true">
          <startEvent id="start1" />
          <sequenceFlow id="toSend" sourceRef="start1" targetRef="send" />
          <intermediateThrowEvent id="send">
            <messageEventDefinition messageRef="Message1" />
          </intermediateThrowEvent>
        </process>
        <process id="participantProcess">
          <startEvent id="start2">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <sequenceFlow id="toEnd" sourceRef="start2" targetRef="end" />
          <endEvent id="end" />
        </process>
        <message id="Message1" name="Start message" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end;
    let main, participant;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      [main, participant] = definition.getProcesses();
      definition.run();
    });

    Then('definition completes', () => {
      return end;
    });

    And('main process completed', () => {
      expect(main.counters).to.have.property('completed', 1);
    });

    And('participant process completed', () => {
      expect(participant.counters).to.have.property('completed', 1);
    });

    And('all activities were taken once', () => {
      expect(definition.getActivityById('start1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('send').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('start2').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end').counters).to.have.property('taken', 1);
    });
  });

  Scenario('A receive task', () => {
    let context, definition;
    Given('a receive task waiting for message', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="mainProcess" isExecutable="true">
          <receiveTask id="receive" messageRef="Message1" />
          <sequenceFlow id="toEnd" sourceRef="receive" targetRef="end" />
          <endEvent id="end" />
        </process>
        <message id="Message1" name="Start message" />
      </definitions>`;

      context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let wait, end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      wait = definition.waitFor('wait');
      definition.run();
    });

    let receive;
    Then('definition is waiting for receive task to complete', () => {
      expect(definition.isRunning).to.be.true;
      [receive] = definition.getPostponed();
      expect(receive).to.have.property('id', 'receive');
    });

    And('receive task emits wait without resumed flag', async () => {
      const api = await wait;
      expect(api.content).to.not.have.property('isResumed');
    });

    When('message is sent', () => {
      definition.sendMessage({
        id: 'Message1',
      });
    });

    Then('definition completed', () => {
      return end;
    });

    And('receive task completes', () => {
      expect(receive.owner.counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end').counters).to.have.property('taken', 1);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('definition is waiting for receive task to complete', () => {
      expect(definition.isRunning).to.be.true;
      [receive] = definition.getPostponed();
      expect(receive).to.have.property('id', 'receive');
    });

    When('receive task is signaled', () => {
      receive.signal();
    });

    Then('definition completed', () => {
      return end;
    });

    And('receive task completes', () => {
      expect(receive.owner.counters).to.have.property('taken', 2);
      expect(definition.getActivityById('end').counters).to.have.property('taken', 2);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('definition is waiting for receive task to complete', () => {
      expect(definition.isRunning).to.be.true;
      [receive] = definition.getPostponed();
      expect(receive).to.have.property('id', 'receive');
    });

    When('receive task is discarded', () => {
      receive.discard();
    });

    Then('definition completed', () => {
      return end;
    });

    And('receive task is discarded', () => {
      expect(receive.owner.counters).to.have.property('discarded', 1);
      expect(receive.owner.counters).to.have.property('taken', 2);
      expect(definition.getActivityById('end').counters).to.have.property('discarded', 1);
      expect(definition.getActivityById('end').counters).to.have.property('taken', 2);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('definition is waiting for receive task to complete', () => {
      expect(definition.isRunning).to.be.true;
      [receive] = definition.getPostponed();
      expect(receive).to.have.property('id', 'receive');
    });

    let state;
    Given('definition is stopped and state is saved', () => {
      definition.stop();
      state = definition.getState();
    });

    And('recovered', () => {
      definition = new Definition(context.clone());
      definition.recover(JSON.parse(JSON.stringify(state)));
    });

    When('resumed', () => {
      end = definition.waitFor('end');
      wait = definition.waitFor('wait');
      definition.resume();
    });

    Then('receive task emits wait with resumed flag', async () => {
      const api = await wait;
      expect(api.content).to.have.property('isRecovered', true);
    });

    When('message is sent', () => {
      definition.sendMessage({
        id: 'Message1',
      });
    });

    Then('resumed definition completes', () => {
      return end;
    });

    And('recovered receive task is taken', () => {
      expect(definition.getActivityById('receive').counters).to.have.property('taken', 3);
      expect(definition.getActivityById('receive').counters).to.have.property('discarded', 1);
      expect(definition.getActivityById('end').counters).to.have.property('taken', 3);
      expect(definition.getActivityById('end').counters).to.have.property('discarded', 1);
    });
  });

  Scenario('Two processes with message start activities', () => {
    let definition;
    Given('a intermediate throw event with message, two participant processes that starts with same message', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="mainProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="toSend" sourceRef="start" targetRef="send" />
          <intermediateThrowEvent id="send">
            <messageEventDefinition messageRef="Message1" />
          </intermediateThrowEvent>
        </process>
        <process id="participantProcess1">
          <startEvent id="start1">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <sequenceFlow id="toEnd" sourceRef="start1" targetRef="end1" />
          <endEvent id="end1" />
        </process>
        <process id="participantProcess2">
          <startEvent id="start2">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <sequenceFlow id="toEnd2" sourceRef="start2" targetRef="end2" />
          <endEvent id="end2" />
        </process>
        <message id="Message1" name="Start message" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end;
    let main, participant1, participant2;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      [main, participant1, participant2] = definition.getProcesses();
      definition.run();
    });

    Then('definition completes', () => {
      return end;
    });

    And('main process completed', () => {
      expect(main.counters).to.have.property('completed', 1);
    });

    And('first participant processe have completed', () => {
      expect(participant1.counters).to.have.property('completed', 1);
      expect(participant2.counters).to.have.property('completed', 0);
    });

    And('all activities were taken once', () => {
      expect(definition.getActivityById('start1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('start2').counters).to.have.property('taken', 0);
      expect(definition.getActivityById('end2').counters).to.have.property('taken', 0);
    });

    Given('a intermediate throw event with message followed by the same, one participant processes that starts with message', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="mainProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-send1" sourceRef="start" targetRef="send1" />
          <intermediateThrowEvent id="send1">
            <messageEventDefinition messageRef="Message1" />
          </intermediateThrowEvent>
          <sequenceFlow id="to-send2" sourceRef="send1" targetRef="send2" />
          <intermediateThrowEvent id="send2">
            <messageEventDefinition messageRef="Message1" />
          </intermediateThrowEvent>
        </process>
        <process id="participantProcess1">
          <startEvent id="start1">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <sequenceFlow id="to-end1" sourceRef="start1" targetRef="end1" />
          <endEvent id="end1" />
        </process>
        <message id="Message1" name="Start message" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let participant;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      [main, participant] = definition.getProcesses();
      definition.run();
    });

    Then('definition completes', () => {
      return end;
    });

    And('main process completed', () => {
      expect(main.counters).to.have.property('completed', 1);
    });

    And('first participant process has completed', () => {
      expect(participant.counters).to.have.property('completed', 1);
    });

    And('and a second participant process has completed', () => {
      [,, participant2] = definition.getProcesses();
      expect(participant2.counters).to.have.property('completed', 1);
    });

    And('all activities were taken once', () => {
      expect(definition.getActivityById('start1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
    });
  });

  Scenario('Two processes with signal start activities', () => {
    let definition;
    Given('a intermediate throw event with signal, two participant processes that starts with same signal', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="mainProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="toSend" sourceRef="start" targetRef="send" />
          <intermediateThrowEvent id="send">
            <signalEventDefinition signalRef="Signal1" />
          </intermediateThrowEvent>
        </process>
        <process id="participantProcess1">
          <startEvent id="start1">
            <signalEventDefinition signalRef="Signal1" />
          </startEvent>
          <sequenceFlow id="toEnd" sourceRef="start1" targetRef="end1" />
          <endEvent id="end1" />
        </process>
        <process id="participantProcess2">
          <startEvent id="start2">
            <signalEventDefinition signalRef="Signal1" />
          </startEvent>
          <sequenceFlow id="toEnd2" sourceRef="start2" targetRef="end2" />
          <endEvent id="end2" />
        </process>
        <signal id="Signal1" name="Start message" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end;
    let main, participant1, participant2;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      [main, participant1, participant2] = definition.getProcesses();
      definition.run();
    });

    Then('definition completes', () => {
      return end;
    });

    And('main process completed', () => {
      expect(main.counters).to.have.property('completed', 1);
    });

    And('both participant processes have completed', () => {
      expect(participant1.counters).to.have.property('completed', 1);
      expect(participant2.counters).to.have.property('completed', 1);
    });

    And('all activities were taken once', () => {
      expect(definition.getActivityById('start1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end2').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('start2').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end2').counters).to.have.property('taken', 1);
    });
  });
});
