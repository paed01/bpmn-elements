import { Definition } from '../../../src/index.js';
import testHelpers from '../../helpers/testHelpers.js';
import factory from '../../helpers/factory.js';

const source = factory.resource('exclusive-gateway-as-join.bpmn');

Feature('Exclusive gateway used for joining', () => {
  Scenario('a number of exclusive gateway join and split', () => {
    let context, definition, end;
    When('running a definition matching the scenario', async () => {
      context = await testHelpers.context(source);

      definition = new Definition(context);
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });
  });
});
