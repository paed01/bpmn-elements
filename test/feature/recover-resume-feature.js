import testHelpers from '../helpers/testHelpers.js';
import Definition from '../../src/definition/Definition.js';
import factory from '../helpers/factory.js';

const extensions = {
  camunda: {
    moddleOptions: testHelpers.camundaBpmnModdle,
  },
};

Feature('Recover resume', () => {
  Scenario('recover with disable track state setting off', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
        <userTask id="task" />
        <sequenceFlow id="to-end" sourceRef="task" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    let context, definition;
    Given('a definition with setting disable-track', async () => {
      context = await testHelpers.context(source);
      definition = new Definition(context, { settings: { disableTrackState: true } });
    });

    let wait;
    When('run', () => {
      wait = definition.waitFor('wait');
      definition.run();
    });

    Then('run is waiting', () => {
      return wait;
    });

    let state;
    When('getting state', () => {
      state = definition.getState();
    });

    Then('state has only waiting child', () => {
      expect(state.execution.processes[0].execution.children).to.have.length(1);
    });

    And('no flows', () => {
      expect(state.execution.processes[0].execution.flows).to.have.length(0);
    });

    And('process broker state has only one user task', () => {
      expect(state.execution.processes[0].broker.queues[1].messages).to.have.length(1);
    });

    When('definition is recovered and resumed', () => {
      definition.stop();

      definition = new Definition(context.clone(), { settings: { disableTrackState: true } });

      definition.recover(state).resume();
    });

    let end;
    And('task is signalled', () => {
      end = definition.waitFor('leave');
      definition.signal({ id: 'task' });
    });

    Then('run completes', () => {
      return end;
    });

    Given('a definition with setting enabled track', async () => {
      context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('run', () => {
      wait = definition.waitFor('wait');
      definition.run();
    });

    Then('run is waiting', () => {
      return wait;
    });

    When('getting state', () => {
      state = definition.getState();
    });

    Then('state has all children', () => {
      expect(state.execution.processes[0].execution.children).to.have.length(3);
    });

    And('all flows but without broker state', () => {
      expect(state.execution.processes[0].execution.flows).to.have.length(2);
      expect(state.execution.processes[0].execution.flows[0].broker).to.be.undefined;
      expect(state.execution.processes[0].execution.flows[1].broker).to.be.undefined;
    });

    And('process broker state has only one user task', () => {
      expect(state.execution.processes[0].broker.queues[1].messages).to.have.length(1);
    });
  });

  Scenario('recover and resume mother-of-all with state setting off', () => {
    let context, definition;
    Given('a mother of all process with user task, timer, and loop', async () => {
      context = await testHelpers.context(factory.resource('mother-of-all.bpmn'), { extensions });
      definition = new Definition(context, { settings: { disableTrackState: true } });
    });

    let wait;
    When('run', () => {
      wait = definition.waitFor('wait');
      definition.run();
    });

    Then('run waits for user input', async () => {
      await wait;
    });

    let state;
    When('getting state', () => {
      state = definition.getState();
    });

    let userTaskStateRun1;
    Then('state has only running user task', () => {
      expect(state.execution.processes[0].execution.children).to.have.length(1);

      userTaskStateRun1 = state.execution.processes[0].execution.children[0];
    });

    And('no flows', () => {
      expect(state.execution.processes[0].execution.flows).to.have.length(0);
    });

    And('no message flows', () => {
      expect(state.execution.processes[0].execution.messageFlows).to.have.length(0);
    });

    And('no associations', () => {
      expect(state.execution.processes[0].execution.associations).to.be.undefined;
    });

    And('process broker state has only one user task', () => {
      expect(state.execution.processes[0].broker.queues[1].messages).to.have.length(1);
    });

    When('definition is recovered and resumed', () => {
      definition.stop();

      definition = new Definition(context.clone(), { settings: { disableTrackState: true } });

      definition.recover(state).resume();
    });

    And('task is signalled', () => {
      wait = definition.waitFor('wait');
      definition.signal({ id: userTaskStateRun1.id });
    });

    Then('run waits for second user input', async () => {
      await wait;
      definition.stop();
    });

    When('getting state', () => {
      state = definition.getState();
    });

    let runningSubProcessState;
    Then('state has only one waiting child', () => {
      expect(state.execution.processes[0].execution.children).to.have.length(1);

      runningSubProcessState = state.execution.processes[0].execution.children[0];
    });

    And('no flows', () => {
      expect(state.execution.processes[0].execution.flows).to.have.length(0);
    });

    And('sub process state has running user task and timer', () => {
      expect(runningSubProcessState.execution.children).to.have.length(2);
    });

    And('no sub process flows', () => {
      expect(runningSubProcessState.execution.flows).to.have.length(0);
    });

    When('definition is recovered and resumed again', () => {
      definition.stop();

      definition = new Definition(context.clone(), { settings: { disableTrackState: true } });

      definition.recover(state).resume();
    });

    And('sub process task is signalled', () => {
      wait = definition.waitFor('wait');
      definition.signal({ id: runningSubProcessState.execution.children[0].id });
    });

    Then('run waits for first user input again', async () => {
      await wait;
      definition.stop();
    });

    When('getting state', () => {
      state = definition.getState();
    });

    let userTaskStateRun2;
    Then('state has one running user task with reset counters', () => {
      expect(state.execution.processes[0].execution.children).to.have.length(1);

      userTaskStateRun2 = state.execution.processes[0].execution.children[0];
      expect(userTaskStateRun2.id).to.equal(userTaskStateRun1.id);
      expect(userTaskStateRun2.counters).to.deep.equal({ taken: 0, discarded: 0 });
    });

    And('no flows', () => {
      expect(state.execution.processes[0].execution.flows).to.have.length(0);
    });

    And('no message flows', () => {
      expect(state.execution.processes[0].execution.messageFlows).to.have.length(0);
    });
  });
});
