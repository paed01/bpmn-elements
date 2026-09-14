import { Definition } from 'bpmn-elements';
import testHelpers from '../../helpers/testHelpers.js';
import factory from '../../helpers/factory.js';

const source = factory.resource('issue-42-same-target-sequence-flows.bpmn');
const originalSource = factory.resource('issue-42-original.bpmn');

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

    And('target activity is neither taken nor discarded', () => {
      expect(definition.getActivityById('task2').counters).to.deep.equal({ taken: 0, discarded: 0 });
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
      expect(task.counters).to.deep.equal({ taken: 1, discarded: 0 });
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
      expect(task.counters).to.deep.equal({ taken: 2, discarded: 0 });
    });

    And('sequence flow 2 is taken', () => {
      expect(task.inbound.find((f) => f.id === 'to-task2-2').counters).to.deep.equal({ take: 1, discard: 0, looped: 0 });
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
      expect(definition.getActivityById('task2').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });
  });

  /**
   * Take each conditional sequence flow at most once per run.
   * The condition expression resolves to this function, so it is called with the
   * flow execution scope and keys on the flow id to break the diagram loops.
   */
  function takeOnce(flowScope) {
    const variables = flowScope.environment.variables;
    const takenFlows = variables.takenFlows || (variables.takenFlows = new Set());
    if (takenFlows.has(flowScope.id)) return false;
    takenFlows.add(flowScope.id);
    return true;
  }

  [
    ['synchronous', (_scope, next) => next()],
    ['asynchronous', (_scope, next) => process.nextTick(next)],
  ].forEach(([kind, serviceTask]) => {
    Scenario(`every task completes with a ${kind} service task implementation`, () => {
      Given('a definition where conditional flows resolve to the takeOnce service function', async () => {
        context = await testHelpers.context(originalSource);
        // @ts-expect-error type coverage
        definition = new Definition(context, { services: { takeOnce, serviceTask } });
      });

      let left;
      When('definition is ran', () => {
        left = definition.waitFor('leave');
        definition.run();
      });

      Then('it completes without error', () => {
        return left;
      });

      And('all twenty service tasks completed at least once', () => {
        for (let n = 1; n <= 20; n++) {
          expect(definition.getActivityById(`task${n}`).counters, `task${n}`)
            .to.have.property('taken')
            .above(0);
        }
      });

      And('the end event was reached', () => {
        expect(definition.getActivityById('end').counters).to.have.property('taken', 1);
      });
    });
  });
});
