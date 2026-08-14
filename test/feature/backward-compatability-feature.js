import fs from 'fs/promises';
import { Definition } from 'bpmn-elements';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';

const motherOfAllSource = factory.resource('mother-of-all.bpmn');

Feature('Backward compatability', () => {
  Scenario('Slimmer state 5.2', () => {
    let context;
    before(async () => {
      context = await testHelpers.context(motherOfAllSource);
    });

    let definition, state;
    Given('a state from version 5', async () => {
      // @ts-expect-error type coverage
      state = JSON.parse(await fs.readFile('./test/resources/mother-of-all-state-5.json'));
    });

    let leave;
    When('recovered and resumed with state from version 5', () => {
      definition = new Definition(context).recover(state);
      leave = definition.waitFor('leave');
      definition.resume();
    });

    And('waiting tasks are signaled', () => {
      definition.signal({ id: 'userTask1' });
      definition.signal({ id: 'subUserTask1' });
    });

    Then('run completes', () => {
      return leave;
    });
  });

  Scenario('State 17.3', () => {
    let context;
    before(async () => {
      context = await testHelpers.context(motherOfAllSource);
    });

    let definition, state;
    Given('a state from version 17.3', async () => {
      // @ts-expect-error type coverage
      state = JSON.parse(await fs.readFile('./test/resources/mother-of-all-state-17.3.json'));
    });

    let leave;
    When('recovered and resumed with state from version 17.3', () => {
      definition = new Definition(context).recover(state);
      leave = definition.waitFor('leave');
      definition.resume();
    });

    And('waiting tasks are signaled', () => {
      definition.signal({ id: 'userTask1' });
      definition.signal({ id: 'subUserTask1' });
    });

    Then('run completes', () => {
      return leave;
    });
  });

  Scenario('State 18', () => {
    let context;
    before(async () => {
      context = await testHelpers.context(motherOfAllSource);
    });

    let definition, state;
    Given('a state from version 18', async () => {
      // @ts-expect-error type coverage
      state = JSON.parse(await fs.readFile('./test/resources/mother-of-all-state-18.json'));
    });

    let leave;
    When('recovered and resumed with state from version 18', () => {
      definition = new Definition(context).recover(state);
      leave = definition.waitFor('leave');
      definition.resume();
    });

    And('waiting tasks are signaled', () => {
      definition.signal({ id: 'userTask1' });
      definition.signal({ id: 'subUserTask1' });
    });

    Then('run completes', () => {
      return leave;
    });
  });

  Scenario('State with an in-flight discarded sequence flow (pre "no flow discards")', () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def_1" targetNamespace="http://bpmn.io/schema/bpmn">
      <process id="proc" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="to_task" sourceRef="start" targetRef="task" />
        <userTask id="task" />
        <sequenceFlow id="to_end" sourceRef="task" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    let context;
    before(async () => {
      context = await testHelpers.context(source);
    });

    let state;
    Given('a running definition waiting at a user task', async () => {
      const definition = new Definition(context);
      const wait = definition.waitFor('wait');
      definition.run();
      await wait;
      state = definition.getState();
    });

    And('the state carries in-flight discarded and looped flow tokens on the process activity queue', () => {
      const processState = state.execution.processes[0];
      const executionId = processState.execution.executionId;
      const activityQ = processState.broker.queues.find((q) => q.name.startsWith('execute-'));
      const parent = { id: 'proc', type: 'bpmn:Process', executionId };

      activityQ.messages.push({
        fields: { routingKey: 'flow.discard', exchange: 'event', consumerTag: '_process-flow-controller' },
        content: {
          action: 'discard',
          id: 'to_task',
          type: 'bpmn:SequenceFlow',
          sourceId: 'start',
          targetId: 'task',
          isSequenceFlow: true,
          isDefault: false,
          sequenceId: 'to_task_discard_legacy',
          parent,
        },
        properties: { persistent: true, type: 'discard', messageId: 'smq.mid-legacy-discard', timestamp: 1 },
      });

      activityQ.messages.push({
        fields: { routingKey: 'flow.looped', exchange: 'event', consumerTag: '_process-flow-controller' },
        content: {
          action: 'looped',
          id: 'to_task',
          type: 'bpmn:SequenceFlow',
          sourceId: 'start',
          targetId: 'task',
          isSequenceFlow: true,
          isDefault: false,
          sequenceId: 'to_task_looped_legacy',
          parent,
        },
        properties: { persistent: true, type: 'looped', messageId: 'smq.mid-legacy-looped', timestamp: 1 },
      });
    });

    let definition, leave;
    When('recovered and resumed', () => {
      definition = new Definition(context.clone()).recover(state);
      leave = definition.waitFor('leave');
      definition.resume();
    });

    And('the waiting task is signaled', () => {
      definition.signal({ id: 'task' });
    });

    Then('run completes without stranding on the orphan discard token', () => {
      return leave;
    });
  });

  Scenario('State is stamped with a state version', () => {
    let context;
    before(async () => {
      context = await testHelpers.context(motherOfAllSource);
    });

    let definition, state;
    Given('a running definition', () => {
      definition = new Definition(context);
      definition.run();
    });

    When('state is saved', () => {
      state = definition.getState();
    });

    Then('it is stamped with a positive state version', () => {
      expect(state.stateVersion).to.be.a('number').that.is.above(0);
    });
  });
});
