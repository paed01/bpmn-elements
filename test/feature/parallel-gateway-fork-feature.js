import { Definition } from 'bpmn-elements';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';

const forkSource = factory.resource('fork-inbound.bpmn');
const forkSourceWithLoopback = factory.resource('fork-inbound-with-loopback.bpmn');
const forkSourceWithPreInbound = factory.resource('fork-inbound-with-pre-inbound.bpmn');

Feature('Parallel gateway fork', () => {
  Scenario('A process with a parallel fork', () => {
    let context;
    /** @type {Definition} */
    let definition;
    Given('a definition matching the scenario', async () => {
      context = await testHelpers.context(forkSource);
      definition = new Definition(context, {
        services: getTakeServices(),
      });
    });

    let leave;
    When('definition is ran', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('run completes', () => {
      return leave;
    });

    let joinGw;
    And('parallel join was taken once', () => {
      joinGw = definition.getActivityById('join');
      expect(joinGw.counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    And('has the expected number of inbound flows', () => {
      expect(joinGw.inbound).to.have.length(2);
    });

    And('no pending inbound exists', () => {
      expect(joinGw.broker.getQueue('inbound-q').messageCount).to.equal(0);
    });

    When('ran again', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('run completes', () => {
      return leave;
    });

    let forkGw;
    And('parallel fork was taken again', () => {
      forkGw = definition.getActivityById('fork');
      expect(forkGw.counters).to.deep.equal({ taken: 2, discarded: 0 });
    });

    And('has the expected number of inbound flows', () => {
      expect(forkGw.inbound).to.have.length(1);
    });

    let stopped;
    let state;
    When('ran again with and a listener stopping run when converging gateway has started monitoring', () => {
      definition = new Definition(context.clone());

      definition.broker.subscribeTmp(
        'event',
        'activity.start',
        (_, msg) => {
          if (msg.content.id === 'join') {
            definition.broker.cancel(msg.fields.consumerTag);
            definition.stop();
            state = definition.getState();
          }
        },
        { noAck: true, priority: 10000 }
      );

      stopped = definition.waitFor('stop');

      definition.run();
    });

    Then('run is stopped and state saved', async () => {
      await stopped;
    });

    When('recovered and resumed from converging gateway', () => {
      definition = new Definition(context.clone()).recover(state);

      leave = definition.waitFor('leave');

      definition.resume();
    });

    Then('run completes', () => {
      return leave;
    });

    When('ran again with and a listener stopping run when converging gateway emits converging event', () => {
      definition = new Definition(context.clone());

      definition.broker.subscribeTmp(
        'event',
        'activity.converge',
        (_, msg) => {
          if (msg.content.id === 'join') {
            definition.broker.cancel(msg.fields.consumerTag);
            definition.stop();
            state = definition.getState();
          }
        },
        { noAck: true, priority: 10000 }
      );

      stopped = definition.waitFor('stop');

      definition.run();
    });

    Then('run is stopped and state saved', async () => {
      await stopped;
    });

    When('recovered and resumed from converging gateway on converge event', () => {
      definition = new Definition(context.clone()).recover(state);

      leave = definition.waitFor('leave');

      definition.resume();
    });

    Then('run completes', () => {
      return leave;
    });
  });

  Scenario('A process with a parallel fork that is touched before preceeding join is executed', () => {
    let context;
    /** @type {Definition} */
    let definition;
    Given('a definition matching the scenario', async () => {
      context = await testHelpers.context(forkSourceWithPreInbound);
      definition = new Definition(context, {
        services: getTakeServices(),
      });
    });

    let leave;
    When('definition is ran', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('run completes', () => {
      return leave;
    });

    let joinGw;
    And('parallel join was taken once', () => {
      joinGw = definition.getActivityById('join');
      expect(joinGw.counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    And('has the expected number of inbound flows', () => {
      expect(joinGw.inbound).to.have.length(2);
    });

    And('no pending inbound exists', () => {
      expect(joinGw.broker.getQueue('inbound-q').messageCount).to.equal(0);
    });

    When('ran again', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('run completes', () => {
      return leave;
    });

    let forkGw;
    And('parallel fork was taken again', () => {
      forkGw = definition.getActivityById('fork');
      expect(forkGw.counters).to.deep.equal({ taken: 2, discarded: 0 });
    });

    And('has the expected number of inbound flows', () => {
      expect(forkGw.inbound).to.have.length(1);
    });

    let stopped;
    let state;
    When('ran again with and a listener stopping run when converging gateway has started monitoring', () => {
      definition = new Definition(context.clone());

      definition.broker.subscribeTmp(
        'event',
        'activity.start',
        (_, msg) => {
          if (msg.content.id === 'join') {
            definition.broker.cancel(msg.fields.consumerTag);
            definition.stop();
            state = definition.getState();
          }
        },
        { noAck: true, priority: 10000 }
      );

      stopped = definition.waitFor('stop');

      definition.run();
    });

    Then('run is stopped and state saved', async () => {
      await stopped;
    });

    When('recovered and resumed from converging gateway', () => {
      definition = new Definition(context.clone()).recover(state);

      leave = definition.waitFor('leave');

      definition.resume();
    });

    Then('run completes', () => {
      return leave;
    });

    When('ran again with and a listener stopping run when converging gateway emits converging event', () => {
      definition = new Definition(context.clone());

      definition.broker.subscribeTmp(
        'event',
        'activity.converge',
        (_, msg) => {
          if (msg.content.id === 'join') {
            definition.broker.cancel(msg.fields.consumerTag);
            definition.stop();
            state = definition.getState();
          }
        },
        { noAck: true, priority: 10000 }
      );

      stopped = definition.waitFor('stop');

      definition.run();
    });

    Then('run is stopped and state saved', async () => {
      await stopped;
    });

    When('recovered and resumed from converging gateway on converge event', () => {
      definition = new Definition(context.clone()).recover(state);

      leave = definition.waitFor('leave');

      definition.resume();
    });

    Then('run completes', () => {
      return leave;
    });
  });

  Scenario('A process with a parallel fork preceeded by a converging gateway surrounded by a loopback', () => {
    let context;
    /** @type {Definition} */
    let definition;
    Given('a definition matching the scenario', async () => {
      context = await testHelpers.context(forkSourceWithLoopback);
      definition = new Definition(context, {
        services: getTakeServices(),
      });
    });

    let leave;
    When('definition is ran', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('run completes', () => {
      return leave;
    });

    let forkGw;
    And('parallel fork was taken twice', () => {
      forkGw = definition.getActivityById('join');
      expect(forkGw.counters).to.deep.equal({ taken: 2, discarded: 1 });
    });

    let joinGw;
    And('parallel join was taken twice', () => {
      joinGw = definition.getActivityById('join');
      expect(joinGw.counters).to.deep.equal({ taken: 2, discarded: 1 });
    });

    And('no pending inbound exists', () => {
      expect(joinGw.broker.getQueue('inbound-q').messageCount).to.equal(0);
    });

    When('ran again', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('run completes', () => {
      return leave;
    });

    And('parallel fork was taken twice again', () => {
      forkGw = definition.getActivityById('fork');
      expect(forkGw.counters).to.deep.equal({ taken: 4, discarded: 0 });
    });

    And('parallel join was taken twice again', () => {
      joinGw = definition.getActivityById('join');
      expect(joinGw.counters).to.deep.equal({ taken: 4, discarded: 2 });
    });

    let stopped;
    let state;
    When('ran again with and a listener stopping run when converging gateway has started monitoring', () => {
      definition = new Definition(context.clone());

      definition.broker.subscribeTmp(
        'event',
        'activity.start',
        (_, msg) => {
          if (msg.content.id === 'join') {
            definition.broker.cancel(msg.fields.consumerTag);
            definition.stop();
            state = definition.getState();
          }
        },
        { noAck: true, priority: 10000 }
      );

      stopped = definition.waitFor('stop');

      definition.run();
    });

    Then('run is stopped and state saved', async () => {
      await stopped;
    });

    When('recovered and resumed from converging gateway', () => {
      definition = new Definition(context.clone()).recover(state);

      leave = definition.waitFor('leave');

      definition.resume();
    });

    Then('run completes', () => {
      return leave;
    });

    When('ran again with and a listener stopping run when converging gateway emits converging event', () => {
      definition = new Definition(context.clone());

      definition.broker.subscribeTmp(
        'event',
        'activity.converge',
        (_, msg) => {
          if (msg.content.id === 'join') {
            definition.broker.cancel(msg.fields.consumerTag);
            definition.stop();
            state = definition.getState();
          }
        },
        { noAck: true, priority: 10000 }
      );

      stopped = definition.waitFor('stop');

      definition.run();
    });

    Then('run is stopped and state saved', async () => {
      await stopped;
    });

    When('recovered and resumed from converging gateway on converge event', () => {
      definition = new Definition(context.clone()).recover(state);

      leave = definition.waitFor('leave');

      definition.resume();
    });

    Then('run completes', () => {
      return leave;
    });
  });

  Scenario('Multiple asynchronous tasks joining in parallel join with some inbound touched more than once', () => {
    let context;
    /** @type {Definition} */
    let definition;
    Given('a definition matching the scenario', async () => {
      context = await testHelpers.context(forkSourceWithLoopback, {
        extensions: {
          makeAsync: {
            extension(activity) {
              if (activity.type !== 'bpmn:Task') return;

              const broker = activity.broker;
              const consumerTag = 'make-async';
              return {
                activate() {
                  broker.subscribeTmp(
                    'event',
                    'activity.start',
                    () => {
                      broker.publish('format', 'run.format.onstart', { endRoutingKey: 'run.format.onstart.end' });

                      setImmediate(() => {
                        broker.publish('format', 'run.format.onstart.end');
                      });
                    },
                    { consumerTag, noAck: true }
                  );
                },
                deactivate() {
                  broker.cancel(consumerTag);
                },
              };
            },
          },
        },
      });
      definition = new Definition(context, {
        services: getTakeServices(),
      });
    });

    let leave;
    When('definition is ran', () => {
      definition.run();
      leave = definition.waitFor('leave');
    });

    Then('run completes', () => {
      return leave;
    });

    And('join was taken the expected number of times', () => {
      const joinGw = definition.getActivityById('join');
      expect(joinGw.counters).to.deep.equal({ taken: 2, discarded: 1 });
    });

    And('fork was taken the expected number of times', () => {
      const forkGw = definition.getActivityById('fork');
      expect(forkGw.counters).to.deep.equal({ taken: 2, discarded: 0 });
    });

    let stopped;
    let state;
    When('ran again saving state at converging gateway executing', () => {
      definition.broker.subscribeTmp(
        'event',
        'activity.start',
        (_, msg) => {
          if (msg.content.id === 'task4') {
            definition.broker.cancel(msg.fields.consumerTag);
            state = definition.getState();
            definition.stop();
          }
        },
        { noAck: true }
      );

      stopped = definition.waitFor('stop');
      definition.run();
    });

    Then('state is saved', () => {
      return stopped;
    });

    When('definition is recovered and resumed from state', () => {
      definition = new Definition(context.clone());
      leave = definition.waitFor('leave');
      return definition.recover(state).resume();
    });

    Then('recovered run completes', () => {
      return leave;
    });

    And('join was taken the expected number of times', () => {
      const joinGw = definition.getActivityById('join');
      expect(joinGw.counters).to.deep.equal({ taken: 3, discarded: 2 });
    });

    And('fork was taken the expected number of times', () => {
      const forkGw = definition.getActivityById('fork');
      expect(forkGw.counters).to.deep.equal({ taken: 3, discarded: 0 });
    });

    When('ran again with and a listener stopping run when converging gateway emits converging event', () => {
      definition = new Definition(context.clone());

      definition.broker.subscribeTmp(
        'event',
        'activity.converge',
        (_, msg) => {
          if (msg.content.id === 'join') {
            definition.broker.cancel(msg.fields.consumerTag);
            definition.stop();
            state = definition.getState();
          }
        },
        { noAck: true, priority: 10000 }
      );

      stopped = definition.waitFor('stop');

      definition.run();
    });

    Then('run is stopped and state saved', async () => {
      await stopped;
    });

    When('recovered and resumed from converging gateway on converge event', () => {
      definition = new Definition(context.clone()).recover(state);

      leave = definition.waitFor('leave');

      definition.resume();
    });

    Then('run completes', () => {
      return leave;
    });
  });
});

function getTakeServices() {
  return {
    takeFlow() {
      return true;
    },
    takeOnce({ content, environment }) {
      const onceId = `${environment.variables.content.executionId}_${content.id}`;
      const count = environment.variables[onceId] ?? 0;
      environment.variables[onceId] = count + 1;
      return count === 0;
    },
    takeTwice({ content, environment }) {
      const onceId = `${environment.variables.content.executionId}_${content.id}`;
      const count = environment.variables[onceId] ?? 0;
      environment.variables[onceId] = count + 1;
      return count === 1;
    },
  };
}
