import Definition from '../../src/definition/Definition.js';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';

const extensions = {
  camunda: {
    moddleOptions: testHelpers.camundaBpmnModdle,
  },
};

Feature('Performance', () => {
  describe('lots of script conditions', () => {
    let context;
    Given('a diagram with lots of script conditions and nested joins', async () => {
      const source = factory.resource('nested-joins.bpmn');
      context = await testHelpers.context(source, {extensions});
    });

    let definition, ended;
    When('run with default JavaScript', async () => {
      definition = new Definition(await context.clone());
      ended = definition.waitFor('end');
      await definition.run();
    });

    Then('run completes', () => {
      return ended;
    });

    When('run again with default JavaScript', () => {
      definition = new Definition(context.clone());
      ended = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return ended;
    });

    let endEvent;
    And('end event was taken', () => {
      endEvent = definition.getActivityById('end');
      expect(endEvent.counters).to.have.property('taken', 1);
    });

    When('same definition is ran again', () => {
      ended = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return ended;
    });

    And('end event was taken again', () => {
      endEvent = definition.getActivityById('end');
      expect(endEvent.counters).to.have.property('taken', 2);
    });

    When('run with non-op JavaScript', () => {
      definition = new Definition(context.clone(), {
        scripts: {
          register() {},
          getScript() {
            return {
              execute(...args) {
                return args.pop()();
              },
            };
          },
        },
      });
      ended = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return ended;
    });

    When('run without logger', () => {
      definition = new Definition(context.clone(), {
        Logger: null,
      });
      ended = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return ended;
    });

    When('run with non-op JavaScript and no logger', () => {
      definition = new Definition(context.clone(), {
        Logger: null,
        scripts: {
          register() {},
          getScript() {
            return {
              execute(...args) {
                return args.pop()();
              },
            };
          },
        },
      });
      ended = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return ended;
    });

    And('end event was taken', () => {
      expect(definition.getActivityById('end').counters).to.have.property('taken', 1);
    });
  });
});
