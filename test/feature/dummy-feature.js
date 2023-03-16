import Definition from '../../src/definition/Definition.js';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';

const groupsSource = factory.resource('groups.bpmn');

Feature('Dummy', () => {
  Scenario('Group of elements with categories', () => {
    let context, definition;

    let ended;
    When('a source with groups is ran', async () => {
      context = await testHelpers.context(groupsSource);
      definition = new Definition(context);
      ended = definition.waitFor('end');
      definition.run();
    });

    Then('it runs to end', () => {
      return ended;
    });
  });
});
