import { Definition } from 'bpmn-elements';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';

const groupsSource = factory.resource('groups.bpmn');

Feature('Dummy', () => {
  Scenario('Group of elements with categories', () => {
    /** @type {import('bpmn-elements').ContextInstance} */
    let context;
    /** @type {import('bpmn-elements').Definition} */
    let definition;

    let ended;
    Given('a source with groups is ran', async () => {
      context = await testHelpers.context(groupsSource);
      definition = new Definition(context);
    });

    When('ran', () => {
      ended = definition.waitFor('end');
      definition.run();
    });

    Then('it runs to end', () => {
      return ended;
    });

    And('category can be retrieved from definition', () => {
      expect(definition.getElementById('Category_1275ejz').placeholder).to.be.true;
    });
  });
});
