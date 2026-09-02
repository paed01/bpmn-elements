import { Definition } from 'bpmn-elements';

import testHelpers from '../../helpers/testHelpers.js';
import factory from '../../helpers/factory.js';

const source = factory.resource('exclusive-gateway-as-join.bpmn');

Feature('Exclusive gateway used for joining', () => {
  Scenario('a number of exclusive gateway join and split', () => {
    let context;
    /** @type {Definition} */
    let definition;
    let end;
    When('running a definition matching the scenario', async () => {
      context = await testHelpers.context(source);

      definition = new Definition(context);
      end = definition.waitFor('leave');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    When('same instance is ran again', () => {
      end = definition.waitFor('leave');
      definition.run();
    });

    Then('second run completes', () => {
      return end;
    });

    When('same instance is ran yet again', () => {
      end = definition.waitFor('leave');
      definition.run();
    });

    Then('third run completes', () => {
      return end;
    });
  });
});
