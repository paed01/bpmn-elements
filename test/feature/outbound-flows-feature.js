import Definition from '../../src/definition/Definition';
import factory from '../helpers/factory';

import testHelpers from '../helpers/testHelpers';

Feature('Outbound flows', () => {
  Scenario('A process containing a task with conditional flows', () => {
    let definition;
    Given('a task with one default flow, flow with script condition, and a third with expression', async () => {
      const source = factory.resource('conditional-flows.bpmn');
      const context = await testHelpers.context(source);
      definition = Definition(context);
    });

    When('definition is ran with truthy script condition', () => {
      definition.environment.variables.take2 = true;
      definition.run();
    });

    Then('script flow is taken', () => {
      expect(definition.getActivityById('task2').counters).to.deep.equal({
        taken: 1,
        discarded: 0,
      });
    });

    And('the other two discarded', () => {
      expect(definition.getActivityById('task3').counters).to.deep.equal({
        taken: 0,
        discarded: 1,
      });
      expect(definition.getActivityById('task4').counters).to.deep.equal({
        taken: 0,
        discarded: 1,
      });
    });

    When('definition is ran with truthy expression', () => {
      definition.environment.variables.take2 = false;
      definition.environment.variables.take4 = true;
      definition.run();
    });

    Then('expression flow is taken', () => {
      expect(definition.getActivityById('task4').counters).to.deep.equal({
        taken: 1,
        discarded: 1,
      });
    });

    And('the other two discarded', () => {
      expect(definition.getActivityById('task2').counters).to.deep.equal({
        taken: 1,
        discarded: 1,
      });
      expect(definition.getActivityById('task3').counters).to.deep.equal({
        taken: 0,
        discarded: 2,
      });
    });

    When('definition is ran with falsy script and expression', () => {
      definition.environment.variables.take2 = false;
      definition.environment.variables.take4 = false;
      definition.run();
    });

    Then('default flow is taken', () => {
      expect(definition.getActivityById('task3').counters).to.deep.equal({
        taken: 1,
        discarded: 2,
      });
    });

    And('the other two discarded', () => {
      expect(definition.getActivityById('task2').counters).to.deep.equal({
        taken: 1,
        discarded: 2,
      });
      expect(definition.getActivityById('task4').counters).to.deep.equal({
        taken: 1,
        discarded: 2,
      });
    });
  });
});
