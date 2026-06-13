import { promises as fs } from 'fs';
import { Definition } from 'bpmn-elements';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';

const motherOfAllSource = factory.resource('mother-of-all.bpmn');

Feature('Backward compatability', () => {
  Scenario('Slimmer state 5.2', () => {
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
      definition.signal({ id: 'userTask1' });
      definition.signal({ id: 'subUserTask1' });
    });

    Then('run completes', () => {
      return leave;
    });
  });

  Scenario('State 17.3', () => {
    let context;
    before(async () => {
      context = await testHelpers.context(motherOfAllSource);
    });

    let definition, state;
    Given('a state from version 17.3', async () => {
      state = JSON.parse(await fs.readFile('./test/resources/mother-of-all-state-17.3.json'));
    });

    let leave;
    When('recovered and resumed with state from version 17.3', () => {
      definition = new Definition(context).recover(state);
      leave = definition.waitFor('leave');
      definition.resume();
    });

    And('waiting tasks are signaled', () => {
      definition.signal({ id: 'userTask1' });
      definition.signal({ id: 'subUserTask1' });
    });

    Then('run completes', () => {
      return leave;
    });
  });

  Scenario('State 18', () => {
    let context;
    before(async () => {
      context = await testHelpers.context(motherOfAllSource);
    });

    let definition, state;
    Given('a state from version 18', async () => {
      state = JSON.parse(await fs.readFile('./test/resources/mother-of-all-state-18.json'));
    });

    let leave;
    When('recovered and resumed with state from version 18', () => {
      definition = new Definition(context).recover(state);
      leave = definition.waitFor('leave');
      definition.resume();
    });

    And('waiting tasks are signaled', () => {
      definition.signal({ id: 'userTask1' });
      definition.signal({ id: 'subUserTask1' });
    });

    Then('run completes', () => {
      return leave;
    });
  });

  Scenario('State is stamped with a state version', () => {
    let context;
    before(async () => {
      context = await testHelpers.context(motherOfAllSource);
    });

    let definition, state;
    Given('a running definition', () => {
      definition = new Definition(context);
      definition.run();
    });

    When('state is saved', () => {
      state = definition.getState();
    });

    Then('it is stamped with a positive state version', () => {
      expect(state.stateVersion).to.be.a('number').that.is.above(0);
    });
  });
});
