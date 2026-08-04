import { Definition } from 'bpmn-elements';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';

const groupsSource = factory.resource('groups.bpmn');

Feature('Dummy', () => {
  Scenario('Group of elements with categories', () => {
    let context;
    /** @type {import('bpmn-elements').Definition} */
    let definition;

    let ended;
    When('a source with groups is ran', async () => {
      context = await testHelpers.context(groupsSource);
      definition = new Definition(context);
      ended = definition.waitFor('end');
      definition.run();
    });

    And('category can be retrieved', () => {
      expect(definition.getElementById('Category_1275ejz')?.placeholder).to.be.true;
    });

    Then('it runs to end', () => {
      return ended;
    });
  });
});
