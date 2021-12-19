import Definition from '../../src/definition/Definition';
import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';

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

    Then('it runs to end', async () => {
      return ended;
    });
  });
});
