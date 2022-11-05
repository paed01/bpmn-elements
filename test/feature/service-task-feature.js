import Definition from '../../src/definition/Definition';
import testHelpers from '../helpers/testHelpers';

Feature('Service task', () => {
  Scenario('Recover and resume mid execution', () => {
    let context, definition;

    Given('a process with a service task', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="script-definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="my-process" isExecutable="true">
          <serviceTask id="task" implementation="\${environment.services.foo}" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
    });

    let called = 0;
    When('definition run', () => {
      definition = new Definition(context, {
        services: {
          foo() {
            ++called;
          },
        },
      });
      definition.run();
    });

    Then('service is called', () => {
      expect(called).to.equal(1);
    });

    let state;
    Given('state is saved', () => {
      state = definition.getState();
    });

    let end;
    When('definition recovered and resumed', () => {
      definition = new Definition(context.clone(), {
        services: {
          foo(...args) {
            args.pop()();
          },
        },
      });

      end = definition.waitFor('leave');

      definition.recover(state).resume();
    });

    Then('resumed definition completes', () => {
      return end;
    });
  });
});
