import Definition from '../../src/definition/Definition';
import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';

Feature('Issues', () => {
  Scenario('Multiple discard loop back', () => {
    let definition;
    Given('a source with two user tasks in sequence ending up in two succeeding decisions with loopback', async () => {
      const context = await testHelpers.context(factory.resource('engine-issue-73.bpmn'));
      definition = Definition(context);
    });

    let leave, wait;
    When('definition is ran', () => {
      leave = definition.waitFor('leave');
      wait = definition.waitFor('wait');
      definition.run();
    });

    let userApi, task1;
    Then('first user task waits for signal', async () => {
      userApi = await wait;
      task1 = userApi.owner;
    });

    When('signaled', () => {
      wait = definition.waitFor('wait');
      userApi.signal();
    });

    let task2;
    Then('second user task waits for signal', async () => {
      userApi = await wait;
      task2 = userApi.owner;
    });

    When('signaled', () => {
      wait = definition.waitFor('wait');
      userApi.signal();
    });

    Then('first user task waits for signal again', async () => {
      userApi = await wait;
    });

    When('discarded', () => {
      wait = definition.waitFor('wait');
      userApi.discard();
    });

    Then('definition completes', () => {
      return leave;
    });

    And('first user task is taken once and discarded twice', () => {
      expect(task1.counters).to.have.property('taken', 1);
      expect(task1.counters).to.have.property('discarded', 2);
    });

    And('second user task is taken once and discarded twice', () => {
      expect(task2.counters).to.have.property('taken', 1);
      expect(task2.counters).to.have.property('discarded', 2);
    });

    And('first decision is taken once and discarded once since discard loop prevents more', () => {
      const decision = definition.getActivityById('decision1');
      expect(decision.counters).to.have.property('taken', 1);
      expect(decision.counters).to.have.property('discarded', 1);
    });

    And('second decision is discarded twice', () => {
      const decision = definition.getActivityById('decision2');
      expect(decision.counters).to.have.property('taken', 0);
      expect(decision.counters).to.have.property('discarded', 2);
    });

    And('end event is discarded four times', () => {
      const decision = definition.getActivityById('end');
      expect(decision.counters).to.have.property('taken', 0);
      expect(decision.counters).to.have.property('discarded', 4);
    });
  });

  Scenario('Recovered loopback flows', () => {
    let context, definition, state;

    const extensions = {
      saveAllOutputToEnvironmentExtension,
    };

    function saveAllOutputToEnvironmentExtension(activity, {environment}) {
      activity.on('end', (api) => {
        environment.output[api.id] = api.content.output;
      });
    }

    function onWaitHandler(def) {
      return function onWait(api) {
        if (api.owner.counters.taken === 0) {
          api.signal({isIterationOne: true});
        } else if (api.owner.counters.taken === 1) {
          if (!api.content.isRecovered) {
            state = def.getState();
            def.stop();
          } else {
            api.signal({isIterationTwo: true});
          }
        } else if (api.owner.counters.taken === 2) {
          api.signal();
        }
      };
    }

    Given('an usertask ending up in decision with two loopback flows each taken once and an end event', async () => {
      context = await testHelpers.context(factory.resource('engine-issue-73_2.bpmn'));
      definition = Definition(context, {extensions});
    });

    let stopped;
    When('definition is ran and state is saved on second usertask wait', () => {
      stopped = definition.waitFor('stop');
      definition.on('wait', onWaitHandler(definition));
      definition.run();
    });

    Then('definition stops', () => {
      return stopped;
    });

    let recovered, completed;
    When('resumed', () => {
      recovered = Definition(context.clone(), {extensions}).recover(state);
      completed = recovered.waitFor('leave');
      stopped = recovered.waitFor('stop');
      recovered.on('wait', onWaitHandler(recovered));
      recovered.resume();
    });

    Then('run completes', () => {
      return completed;
    });

    let usertask;
    And('usertask is taken thrice', () => {
      usertask = recovered.getActivityById('usertask');
      expect(usertask.counters).to.have.property('taken', 3);
    });

    And('discarded 4 times', () => {
      expect(usertask.counters).to.have.property('discarded', 4);
    });

    And('end event is taken once and discarded twice', () => {
      const endEvent = recovered.getActivityById('end');
      expect(endEvent.counters).to.have.property('taken', 1);
      expect(endEvent.counters).to.have.property('discarded', 2);
    });
  });

  Scenario('Save state on wait - engine issue #105', () => {
    let context, definition, state, options;
    Given('two exclusive gateways, one user task with save state extension, and multiple loopback flows', async () => {
      context = await testHelpers.context(factory.resource('engine-issue-105.bpmn'));
      options = {
        services: {
          async doTask1(scope, callback) {
            await sleep(50); // calling other heavy service...
            return callback(null);
          },
          async doTask2(scope, callback) {
            await sleep(50); // calling other heavy service...
            scope.environment.variables.passTask2--;
            return callback(null);
          },
        },
        extensions: {
          listenUserTask(activity) {
            if (activity.id !== 'UserTask') return;
            activity.on('wait', async (api) => {
              api.owner.logger.debug('##### log state immediately in wait');
              state = JSON.stringify(await definition.getState());
            });
          },
        }
      };

      definition = Definition(context, {
        variables: {
          passTask2: 1
        },
        ...options,
      });

      function sleep(msec) {
        return new Promise((resolve) => {
          setTimeout(resolve, msec);
        });
      }
    });

    let leave, wait;
    When('definition is ran', () => {
      leave = definition.waitFor('leave');
      wait = definition.waitFor('wait');

      definition.run();
    });

    let userApi;
    Then('user task waits for signal', async () => {
      userApi = await wait;
    });

    When('signaled', () => {
      userApi.signal();
    });

    Then('definition execution completes', () => {
      return leave;
    });

    And('user task was discarded thrice', () => {
      const task = definition.getActivityById('UserTask');
      expect(task.counters).to.have.property('taken', 1);
      expect(task.counters).to.have.property('discarded', 2);
    });

    When('definition is recovered with state from wait', () => {
      definition = Definition(context.clone(), options);
      definition.recover(JSON.parse(state));
    });

    And('resumed', () => {
      leave = definition.waitFor('leave');
      wait = definition.waitFor('wait');

      let count = 0;
      definition.broker.subscribeTmp('event', 'activity.discard', (_, msg) => {
        if (msg.content.id === 'UserTask') {
          if (count++ > 3) {
            throw new Error('Into infinity');
          }
        }
      }, {noAck: true});

      definition.resume();
    });

    Then('user task waits for signal again', async () => {
      userApi = await wait;
    });

    When('signaled', () => {
      userApi.signal();
    });

    Then('resumed definition execution completes', () => {
      return leave;
    });

    And('user task was discarded thrice', () => {
      const task = definition.getActivityById('UserTask');
      expect(task.counters).to.have.property('taken', 1);
      expect(task.counters).to.have.property('discarded', 2);
    });
  });
});
