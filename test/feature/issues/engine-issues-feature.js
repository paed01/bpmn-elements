import { Definition } from 'bpmn-elements';
import testHelpers from '../../helpers/testHelpers.js';
import factory from '../../helpers/factory.js';

const engineIssue180 = factory.resource('engine-issue-180.bpmn');
const engineIssue180signal = factory.resource('engine-issue-180-signal.bpmn');
const engineIssue180message = factory.resource('engine-issue-180-message.bpmn');
const signalAfterSignal = factory.resource('signal-after-signal.bpmn');
const userTaskReminderSource = factory.resource('user-task-reminder-timer.bpmn');
const userTaskReminderCycleSource = factory.resource('user-task-reminder-cycle.bpmn');

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

  Scenario('non-interrupting user task reminder timer has fired, and the user needs more time (#170)', () => {
    let context, definition;
    const notifications = [];
    const services = {
      notify(id, next) {
        notifications.push(id);
        next();
      },
    };
    Given('a user task with a non-interrupting reminder timer that triggers a notify script task', async () => {
      context = await testHelpers.context(userTaskReminderSource);
      definition = new Definition(context, { services });
    });

    When('definition is ran', () => {
      definition.run();
    });

    Then('user task is waiting and reminder timer is executing', () => {
      const postponed = definition.getPostponed();
      expect(postponed.map((api) => api.id)).to.deep.equal(['reminder-timer', 'user-task']);
      expect(definition.environment.timers.executing).to.have.length(1);
    });

    And('reminder timer accepts cancel api call', () => {
      const [timer] = definition.getPostponed((api) => api.id === 'reminder-timer');
      const [execution] = timer.getExecuting();
      expect(execution.content.accepts).to.deep.equal(['cancel']);
    });

    When('user fails to complete the task in time', () => {
      definition.environment.timers.executing[0].callback();
    });

    Then('user is notified by the script task', () => {
      expect(notifications).to.deep.equal(['notify']);
      expect(definition.getActivityById('notified').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    let state;
    Given('run is stopped and state is saved', () => {
      definition.stop();
      state = definition.getState();
    });

    When('definition is recovered and resumed', () => {
      definition = new Definition(context.clone(), { services }).recover(JSON.parse(JSON.stringify(state)));
      definition.resume();
    });

    Then('user task is still waiting, but no timer is running that gives the user more time', () => {
      const postponed = definition.getPostponed();
      expect(postponed.map((api) => api.id)).to.deep.equal(['user-task']);
      expect(definition.environment.timers.executing).to.have.length(0);
    });

    let end;
    When('user task is finally signaled', () => {
      end = definition.waitFor('end');
      definition.signal({ id: 'user-task' });
    });

    Then('run completes', () => {
      return end;
    });

    And('user task and reminder timer were taken once, nothing discarded', () => {
      expect(definition.getActivityById('user-task').counters).to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('reminder-timer').counters).to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('notify').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });
  });

  Scenario('the notify script gives the user more time by updating the reminder timer cycle expression variable (#170)', () => {
    let context, definition;
    let nextCycle;
    const notifications = [];
    const services = {
      notify(id) {
        notifications.push(id);
        return nextCycle;
      },
    };
    Given('a user task reminder timer with an environment variable cycle expression, updated by the notify script', async () => {
      context = await testHelpers.context(userTaskReminderCycleSource);
      definition = new Definition(context, {
        variables: { reminderCycle: 'R/PT10M' },
        services,
      });
    });

    When('definition is ran', () => {
      definition.run();
    });

    Then('reminder timer is armed with the initial cycle interval', () => {
      const [timer] = definition.environment.timers.executing;
      expect(timer.delay).to.equal(1000 * 60 * 10);
    });

    When('user fails to complete the task in time, and the notify script decides to allow an hour until next reminder', () => {
      nextCycle = 'R/PT1H';
      definition.environment.timers.executing[0].callback();
    });

    Then('user is notified', () => {
      expect(notifications).to.deep.equal(['notify']);
    });

    And('the repeated reminder timer is re-armed with the updated cycle interval', () => {
      const [timer] = definition.environment.timers.executing;
      expect(timer.delay).to.equal(1000 * 60 * 60);
    });

    let state;
    Given('run is stopped and state is saved', () => {
      definition.stop();
      state = JSON.parse(JSON.stringify(definition.getState()));
    });

    When('definition is recovered and resumed', () => {
      definition = new Definition(context.clone(), { services }).recover(state);
      definition.resume();
    });

    Then('the armed reminder timer keeps its deadline', () => {
      const [timer] = definition.environment.timers.executing;
      expect(timer.delay).to.be.within(1000 * 60 * 59, 1000 * 60 * 60);
    });

    When('user fails to complete the task in time again, and the notify script allows two hours until next reminder', () => {
      nextCycle = 'R/PT2H';
      definition.environment.timers.executing[0].callback();
    });

    Then('user is notified again', () => {
      expect(notifications).to.deep.equal(['notify', 'notify']);
    });

    And('the repeated reminder timer is re-armed with the resumed environment cycle interval', () => {
      const [timer] = definition.environment.timers.executing;
      expect(timer.delay).to.equal(1000 * 60 * 60 * 2);
    });

    let end;
    When('user task is finally signaled', () => {
      end = definition.waitFor('end');
      definition.signal({ id: 'user-task' });
    });

    Then('run completes without pending timers', async () => {
      await end;
      expect(definition.environment.timers.executing).to.have.length(0);
    });

    And('user was notified twice, and the armed reminder run was discarded when the task completed', () => {
      expect(definition.getActivityById('user-task').counters).to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('reminder-timer').counters).to.deep.equal({ taken: 2, discarded: 1 });
      expect(definition.getActivityById('notify').counters).to.deep.equal({ taken: 2, discarded: 0 });
      expect(definition.getActivityById('notified').counters).to.deep.equal({ taken: 2, discarded: 0 });
    });
  });
});
