import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';
import Definition from '../../src/definition/Definition';
import camundaBpmnModdle from 'camunda-bpmn-moddle/resources/camunda';

const extensions = {
  camunda: {
    moddleOptions: camundaBpmnModdle,
  },
};

const source = factory.resource('send-signal.bpmn');

Feature('Definition', () => {
  Scenario('A definition with one non-executable process', () => {
    let definition, context;
    Given('a definition with a user task', async () => {
      context = await testHelpers.context(source, {extensions});
      definition = new Definition(context);
    });

    let end;
    When('run', () => {
      end = definition.waitFor('leave').catch((err) => {
        return err;
      });

      definition.run();
    });

    Then('no executable error is thrown', async () => {
      const err = await end;
      expect(err).to.be.an('error').with.property('message', 'No executable process');
    });

    And('definition run was discarded', () => {
      expect(definition.counters).to.have.property('discarded', 1);
      expect(definition.counters).to.have.property('completed', 0);
    });

    When('run with unknown process id', () => {
      end = definition.waitFor('leave').catch((err) => {
        return err;
      });

      definition.run({
        processId: 'hittepa',
      });
    });

    Then('no executable error is thrown', async () => {
      const err = await end;
      expect(err).to.be.an('error').with.property('message', 'No executable process');
    });

    And('definition run was discarded', () => {
      expect(definition.counters).to.have.property('discarded', 2);
      expect(definition.counters).to.have.property('completed', 0);
    });

    When('run with process id', () => {
      end = definition.waitFor('leave');
      definition.run({
        processId: definition.getProcesses()[0].id,
      });
    });

    Then('user task is waiting', async () => {
      const [task] = definition.getPostponed();
      expect(task).to.have.property('type', 'bpmn:UserTask');
    });

    When('user task is signaled', () => {
      end = definition.waitFor('leave');
      definition.signal({
        id: definition.getPostponed()[0].id,
      });
    });

    Then('definition completes', async () => {
      return end;
    });

    And('definition run was completed', () => {
      expect(definition.counters).to.have.property('completed', 1);
      expect(definition.counters).to.have.property('discarded', 2);
    });

    let state;
    When('run again with process id', () => {
      definition.on('activity.wait', () => {
        state = definition.getState();
      });

      definition.run({
        processId: definition.getProcesses()[0].id,
      });
    });

    Given('state is saved on waiting user task', () => {
      expect(state).to.be.ok;
    });

    When('definition is recovered', () => {
      definition = new Definition(context.clone());
      definition.recover(state);
    });

    And('resumed', () => {
      definition.resume();
    });

    Then('user task is waiting', async () => {
      const [task] = definition.getPostponed();
      expect(task).to.have.property('type', 'bpmn:UserTask');
    });

    When('user task is signaled', () => {
      end = definition.waitFor('leave');
      definition.signal({
        id: definition.getPostponed()[0].id,
      });
    });

    Then('definition completes', async () => {
      return end;
    });

    And('definition run was completed', () => {
      expect(definition.counters).to.have.property('completed', 2);
      expect(definition.counters).to.have.property('discarded', 2);
    });
  });
});
