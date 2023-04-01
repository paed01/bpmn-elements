import Definition from '../../src/definition/Definition.js';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';

Feature('Activity', () => {
  Scenario('When a task is discarded by multiple flows', () => {
    let definition;

    Given('a process with several decisions all ending up in one manual task', async () => {
      const source = factory.resource('consumer_error.bpmn');
      const context = await testHelpers.context(source);

      definition = new Definition(context);
    });

    let wait;
    When('definition is run', () => {
      wait = definition.waitFor('activity.wait');
      definition.run();
    });

    Then('manual task eventually executes and waits', () => {
      return wait;
    });
  });
});
