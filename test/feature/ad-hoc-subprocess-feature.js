import Definition from '../../src/definition/Definition.js';
import testHelpers from '../helpers/testHelpers.js';
import factory from '../helpers/factory.js';

Feature('Ad-hoc subprocess', () => {
  Scenario('Running ad-hoc subprocess', () => {
    let context, definition;
    Given('a process mathching feature', async () => {
      const source = factory.resource('ad-hoc-subprocess.bpmn');
      context = await testHelpers.context(source);
    });

    let leave;
    const completedActivities = [];
    When('running definition', () => {
      definition = new Definition(context);

      definition.broker.subscribeTmp(
        'event',
        'activity.end',
        (_, msg) => {
          completedActivities.push({ id: msg.content.id, parent: msg.content.parent.id });
        },
        { noAck: true }
      );

      leave = definition.waitFor('leave');

      definition.run();
    });

    Then('definition completes', () => {
      return leave;
    });

    And('all ad-hoc subprocess activities were taken', () => {
      expect(completedActivities).to.deep.equal([
        { id: 'start', parent: 'process_0' },
        { id: 'task1', parent: 'adhoc' },
        { id: 'throw', parent: 'adhoc' },
        { id: 'task2', parent: 'adhoc' },
        { id: 'task3', parent: 'adhoc' },
        { id: 'adhoc', parent: 'process_0' },
        { id: 'end', parent: 'process_0' },
      ]);
    });
  });
});
