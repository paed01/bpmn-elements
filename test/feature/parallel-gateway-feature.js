import { Definition } from 'bpmn-elements';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';

const joinSource = factory.resource('join-inbound.bpmn');

Feature('Parallel gateway', () => {
  Scenario('A process with a parallel join with multiple inbound with some touched more than once', () => {
    let context;
    /** @type {Definition} */
    let definition;
    Given('a definition matching the scenario', async () => {
      context = await testHelpers.context(joinSource);
      definition = new Definition(context);
    });

    let leave;
    let endMsg;
    When('definition is ran', () => {
      leave = definition.waitFor('leave');

      definition.broker.subscribeTmp(
        'event',
        'activity.end',
        (_, msg) => {
          if (msg.content.id === 'join') {
            definition.broker.cancel(msg.fields.consumerTag);
            endMsg = msg;
          }
        },
        { noAck: true }
      );

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
      expect(joinGw.inbound).to.have.length(4);
    });

    And('join end message inbound flows is greater then inbound sequence flows', () => {
      expect(endMsg.content.inbound).to.have.length(6);
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

    And('parallel join was taken twice', () => {
      joinGw = definition.getActivityById('join');
      expect(joinGw.counters).to.deep.equal({ taken: 2, discarded: 0 });
    });

    And('has the expected number of inbound flows again', () => {
      expect(joinGw.inbound).to.have.length(4);
    });

    And('join start message inbound flows is greater then inbound sequence flows', () => {
      expect(endMsg.content.inbound).to.have.length(6);
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
      context = await testHelpers.context(joinSource, {
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
      definition = new Definition(context);
    });

    let joinLeavePromise;
    let leave;
    When('definition is ran', () => {
      joinLeavePromise = new Promise((resolve) => {
        definition.broker.subscribeTmp(
          'event',
          'activity.leave',
          (_, msg) => {
            if (msg.content.id === 'join') {
              definition.broker.cancel(msg.fields.consumerTag);
              resolve(msg);
            }
          },
          { noAck: true }
        );
      });

      definition.run();
      leave = definition.waitFor('leave');
    });

    let joinGw, joinLeaveMsg;
    Then('parallel join was taken once', async () => {
      joinLeaveMsg = await joinLeavePromise;
      joinGw = definition.getActivityById('join');
      expect(joinGw.counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    But('with expected number of inbound', () => {
      expect(joinLeaveMsg.content.inbound).to.have.length(6);
    });

    And('and no postponed elements', () => {
      expect(definition.getPostponed()).to.have.length(0);
    });

    And('run completes', () => {
      return leave;
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
