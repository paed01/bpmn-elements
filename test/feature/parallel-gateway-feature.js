import Definition from '../../src/definition/Definition.js';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';

const joinSource = factory.resource('join-inbound.bpmn');

Feature('Parallel gateway', () => {
  Scenario('A process with a parallel join with multiple inbound with some touched more than once', () => {
    let context, definition;
    Given('a definition matching the scenario', async () => {
      context = await testHelpers.context(joinSource);
      definition = new Definition(context);
    });

    let leave;
    let startMsg;
    When('definition is ran', () => {
      leave = definition.waitFor('leave');

      definition.broker.subscribeTmp(
        'event',
        'activity.start',
        (_, msg) => {
          if (msg.content.id === 'join') {
            definition.broker.cancel(msg.fields.consumerTag);
            startMsg = msg;
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

    And('join start message inbound flows is greater then inbound sequence flows', () => {
      expect(startMsg.content.inbound).to.have.length(6);
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
      expect(startMsg.content.inbound).to.have.length(6);
    });
  });

  Scenario('Multiple asynchronous tasks joining in parallel join with some inbound touched more than once (not recommended)', () => {
    let context, definition;
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
    });

    let joinGw, joinEndMsg;
    Then('parallel join was taken once', async () => {
      joinEndMsg = await joinLeavePromise;
      joinGw = definition.getActivityById('join');
      expect(joinGw.counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    But('with unexpected number of inbound', () => {
      expect(joinEndMsg.content.inbound).to.have.length(5);
    });

    And('one sequence flow is pending since parallel join is expecting more inbound', () => {
      const postponed = definition.getPostponed();
      expect(postponed).to.have.length(1);
      expect(postponed[0]).to.have.property('type', 'bpmn:SequenceFlow');
    });
  });
});
