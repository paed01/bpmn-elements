import { Definition } from '../../../src/index.js';
import testHelpers from '../../helpers/testHelpers.js';
import factory from '../../helpers/factory.js';

const source = factory.resource('issue-42-same-target-sequence-flows.bpmn');

Feature('Issue 42 - discard loops due to multiple outbound flows to same target', () => {
  function takeFlow(index, vars) {
    return vars.takeFlowIndices.includes(index);
  }

  let context, definition, end;
  beforeEachScenario('a source with multiple outbound conditional flows to the same target', async () => {
    context = await testHelpers.context(source);
    definition = new Definition(context, {
      services: {
        takeFlow,
      },
      variables: {
        takeFlowIndices: [0],
      },
    });
  });

  Scenario('definition is ran discarding all flows to the same target', () => {
    When('definition is ran', () => {
      end = definition.waitFor('leave');
      definition.run();
    });

    Then('execution completed', () => {
      return end;
    });

    And('target activity is discarded twice due to loop back flow', () => {
      expect(definition.getActivityById('task2').counters).to.deep.equal({ taken: 0, discarded: 2 });
    });
  });

  Scenario('definition is ran taking one flow, discarding the rest to the same target', () => {
    When('definition is ran taking first flow', () => {
      end = definition.waitFor('leave');

      definition.environment.variables.takeFlowIndices.push(1);

      definition.run();
    });

    Then('execution completed', () => {
      return end;
    });

    let task;
    And('target activity is taken once', () => {
      task = definition.getActivityById('task2');
      expect(task.counters).to.deep.equal({ taken: 1, discarded: 1 });
    });

    And('sequence flow 1 is taken', () => {
      expect(task.inbound.find((f) => f.id === 'to-task2-1').counters).to.deep.equal({ take: 1, discard: 0, looped: 0 });
    });

    When('definition is ran again taking second flow', () => {
      end = definition.waitFor('leave');

      definition.environment.variables.takeFlowIndices = [2];

      definition.run();
    });

    Then('execution completed', () => {
      return end;
    });

    And('target activity is taken once', () => {
      expect(task.counters).to.deep.equal({ taken: 2, discarded: 2 });
    });

    And('sequence flow 2 is taken', () => {
      expect(task.inbound.find((f) => f.id === 'to-task2-2').counters).to.deep.equal({ take: 1, discard: 2, looped: 0 });
    });
  });

  Scenario('definition is ran taking all flows to the same target', () => {
    When('definition is ran', () => {
      end = definition.waitFor('leave');

      definition.environment.variables.takeFlowIndices.push(1, 2, 3);

      definition.run();
    });

    Then('execution completed', () => {
      return end;
    });

    And('target activity is taken once', () => {
      expect(definition.getActivityById('task2').counters).to.deep.equal({ taken: 1, discarded: 1 });
    });
  });
});
