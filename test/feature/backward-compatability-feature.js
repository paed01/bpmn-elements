import {promises as fs} from 'fs';
import Definition from '../../src/definition/Definition';
import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';

const motherOfAllSource = factory.resource('mother-of-all.bpmn');

Feature('Backward compatability 5.2', () => {
  Scenario('Slimmer state', () => {
    let context;
    before(async () => {
      context = await testHelpers.context(motherOfAllSource);
    });

    let definition, state;
    Given('a state from version 5', async () => {
      state = JSON.parse(await fs.readFile('./test/resources/mother-of-all-state-5.json'));
    });

    let leave;
    When('recovered and resumed with state from version 5', () => {
      definition = new Definition(context).recover(state);
      leave = definition.waitFor('leave');
      definition.resume();
    });

    And('waiting tasks are signaled', () => {
      definition.signal({id: 'userTask1'});
      definition.signal({id: 'subUserTask1'});
    });

    Then('run completes', () => {
      return leave;
    });
  });
});
