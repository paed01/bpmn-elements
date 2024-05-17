import { Definition } from '../../../src/index.js';
import testHelpers from '../../helpers/testHelpers.js';
import factory from '../../helpers/factory.js';

const engineIssue180 = factory.resource('engine-issue-180.bpmn');
const engineIssue180signal = factory.resource('engine-issue-180-signal.bpmn');
const engineIssue180message = factory.resource('engine-issue-180-message.bpmn');
const signalAfterSignal = factory.resource('signal-after-signal.bpmn');

Feature('Engine issues', () => {
  Scenario('sub-process triggered by event not working the second time (#180)', () => {
    let context, definition, end;
    When('running a definition matching the scenario where sub-process catches error', async () => {
      context = await testHelpers.context(engineIssue180);

      definition = new Definition(context, { settings: { dummyService: false } });
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('catching sub-process ran twice', () => {
      expect(definition.getActivityById('on-error').counters).to.deep.equal({ taken: 2, discarded: 0 });
    });

    When('running a definition matching the scenario where sub-process catches message', async () => {
      context = await testHelpers.context(engineIssue180message);

      definition = new Definition(context, { settings: { dummyService: false } });
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('catching sub-process ran twice since messages are delegated', () => {
      expect(definition.getActivityById('on-message').counters).to.deep.equal({ taken: 2, discarded: 0 });
    });
  });

  Scenario('sub-process triggered by signal event not working (#180)', () => {
    let context, definition, end;
    When('running a definition matching the scenario where sub-process catches signal', async () => {
      context = await testHelpers.context(engineIssue180signal);

      definition = new Definition(context, { settings: { dummyService: false } });
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('catching sub-process was taken twice', () => {
      expect(definition.getActivityById('on-signal').counters).to.deep.equal({ taken: 2, discarded: 0 });
    });
  });

  Scenario('throw signal succeeded by catch signal, what happens', () => {
    let context, definition, end;
    When('running a definition matching the scenario', async () => {
      context = await testHelpers.context(signalAfterSignal);

      definition = new Definition(context, { settings: { dummyService: false } });
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run is waiting for catch signal', () => {
      expect(definition.activityStatus).to.equal('wait');
    });

    When('catch signal is signalled', () => {
      definition.signal({ id: definition.getPostponed().pop().content.signal.id });
    });

    Then('run completes', () => {
      return end;
    });
  });
});
