import testHelpers from '../helpers/testHelpers.js';
import Definition from '../../src/definition/Definition.js';

Feature('Definition', () => {
  Scenario('A definition with one process and a user task', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="theDefinition" name="Definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <userTask id="task" />
      </process>
    </definitions>`;

    let context, definition;
    Given('a definition', async () => {
      context = await testHelpers.context(source, {settings: {}});

      definition = new Definition(context, {
        settings: {
          strict: true,
        },
        variables: {
          data: 1,
        },
      });
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('leave');
      definition.run();
    });

    let runningBp;
    Then('process environment variables has the expected properties', () => {
      [runningBp] = definition.getProcesses();
      expect(runningBp.environment.variables).to.have.property('data', 1);
      expect(runningBp.environment.variables).to.have.property('content');
      expect(runningBp.environment.variables).to.have.property('fields');
    });

    let task;
    And('user task has same environment as process', () => {
      task = definition.getActivityById('task');

      const bpTask = runningBp.getActivityById('task');
      expect(task === bpTask).to.be.true;
      expect(task.context === runningBp.context).to.be.true;

      const contextTask = context.getActivityById('task');
      expect(task === contextTask).to.be.false;

      expect(task.environment === runningBp.environment, 'same environment').to.be.true;
    });

    And('settings', () => {
      expect(task.environment.settings).to.deep.equal({strict: true});
    });

    And('differs from definition', () => {
      expect(runningBp.environment === definition.environment, 'same environment').to.be.false;
      expect(runningBp.environment.variables === definition.environment.variables, 'same environment variables').to.be.false;
    });

    And('definition environment variables has the expected properties', () => {
      expect(definition.environment.variables).to.deep.equal({data: 1});
    });

    And('same services are available', () => {
      expect(runningBp.environment.services === definition.environment.services, 'same services').to.be.true;
    });

    And('settings', () => {
      expect(runningBp.environment.settings).to.deep.equal({strict: true});
    });

    When('definition completes', () => {
      definition.signal({id: 'task'});
    });

    Then('definition environment variables has the expected variables', async () => {
      await end;
      expect(definition.environment.variables).to.deep.equal({data: 1});
    });

    When('ran again with a new service function and settings', () => {
      end = definition.waitFor('leave');
      definition.environment.addService('testFn', () => {});
      definition.environment.settings.strict = false;
      definition.run();
    });

    Then('process environment variables has the expected properties', () => {
      [runningBp] = definition.getProcesses();
      expect(runningBp.environment.variables).to.have.property('data', 1);
      expect(runningBp.environment.variables).to.have.property('content').with.property('id', 'theProcess');
      expect(runningBp.environment.variables).to.have.property('fields');
    });

    And('user task has same environment as process', () => {
      task = definition.getActivityById('task');
      expect(task.environment === runningBp.environment, 'same environment').to.be.true;
    });

    And('settings', () => {
      expect(runningBp.environment.settings).to.deep.equal({strict: false});
    });

    But('differs from definition', () => {
      expect(runningBp.environment === definition.environment, 'same environment').to.be.false;
      expect(runningBp.environment.variables === definition.environment.variables, 'same environment variables').to.be.false;
    });

    And('definition environment variables have the expected properties', () => {
      expect(definition.environment.variables).to.deep.equal({data: 1});
    });

    And('same services are available', () => {
      expect(runningBp.environment.services === definition.environment.services, 'same services').to.be.true;
      expect(runningBp.environment.services).to.have.property('testFn');
    });

    And('settings', () => {
      expect(runningBp.environment.settings).to.deep.equal({strict: false});
    });

    When('definition completes', () => {
      definition.signal({id: 'task'});
    });

    Then('definition environment variables has the expected variables', async () => {
      await end;
      expect(definition.environment.variables).to.deep.equal({data: 1});
    });

    When('ran again with a assigned service object', () => {
      end = definition.waitFor('leave');
      definition.environment.services = {newFn() {}, extraFn() {}};
      definition.run();
    });

    Then('process environment services has the expected functions', () => {
      [runningBp] = definition.getProcesses();
      expect(runningBp.environment.services).to.have.property('newFn').that.is.a('function');
      expect(runningBp.environment.services).to.have.property('extraFn').that.is.a('function');
    });
  });
});
