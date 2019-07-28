import Definition from '../../src/definition/Definition';
import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';

Feature('Link', () => {
  Scenario('Link intermediate throw event & link intermediate cast event', () => {
    let definition;
    const logBook = [];
    Given('a process with two flows with logging, the first flow ends with link, the second catches the link and then logs', async () => {
      const source = factory.resource('link-event.bpmn');
      const context = await testHelpers.context(source);

      definition = Definition(context, {
        services: {
          log(...args) {
            logBook.push(...args);
          }
        }
      });
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('definition completes immediately', () => {
      return end;
    });

    And('first flow script logged', () => {
      expect(logBook[0]).to.equal('task1');
    });

    And('second flow script logged', () => {
      expect(logBook[1]).to.equal('task2');
    });
  });
});
