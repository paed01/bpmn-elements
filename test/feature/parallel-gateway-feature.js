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

    And('join end message inbound flows are only the taken inbound sequence flows', () => {
      expect(endMsg.content.inbound).to.have.length(2);
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

    And('join start message inbound flows are only the taken inbound sequence flows', () => {
      expect(endMsg.content.inbound).to.have.length(2);
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

  Scenario('A process with a single parallel gateway with one inbound and one outbound fed by task peers wrapped in a loopback', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="to-entry" sourceRef="start" targetRef="entry" />
        <exclusiveGateway id="entry" />
        <sequenceFlow id="to-task1" sourceRef="entry" targetRef="task1" />
        <task id="task1" />
        <sequenceFlow id="to-task2" sourceRef="task1" targetRef="task2" />
        <task id="task2" />
        <sequenceFlow id="to-task3" sourceRef="task2" targetRef="task3" />
        <task id="task3" />
        <sequenceFlow id="to-gateway" sourceRef="task3" targetRef="gateway" />
        <parallelGateway id="gateway" />
        <sequenceFlow id="to-decide" sourceRef="gateway" targetRef="decide" />
        <exclusiveGateway id="decide" default="to-end" />
        <sequenceFlow id="loopback" sourceRef="decide" targetRef="entry">
          <conditionExpression xsi:type="bpmn:tFormalExpression">\${environment.services.takeOnce()}</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="to-end" sourceRef="decide" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    let context;
    /** @type {Definition} */
    let definition;
    Given('a definition matching the scenario', async () => {
      context = await testHelpers.context(source);
      definition = new Definition(context, { services: getTakeServices() });
    });

    let leave;
    let endMsg;
    When('definition is ran', () => {
      leave = definition.waitFor('leave');

      definition.broker.subscribeTmp(
        'event',
        'activity.end',
        (_, msg) => {
          if (msg.content.id === 'gateway') endMsg = msg;
        },
        { noAck: true }
      );

      definition.run();
    });

    Then('run completes', () => {
      return leave;
    });

    let gateway;
    And('parallel gateway was taken twice, once per loop', () => {
      gateway = definition.getActivityById('gateway');
      expect(gateway.counters).to.deep.equal({ taken: 2, discarded: 0 });
    });

    And('gateway has one inbound and one outbound flow', () => {
      expect(gateway.inbound).to.have.length(1);
      expect(gateway.outbound).to.have.length(1);
    });

    And('gateway end message has the taken inbound sequence flow', () => {
      expect(endMsg.content.inbound).to.have.length(1);
    });

    And('each upstream task peer was taken twice', () => {
      for (const id of ['task1', 'task2', 'task3']) {
        expect(definition.getActivityById(id).counters, id).to.deep.equal({ taken: 2, discarded: 0 });
      }
    });

    And('no pending inbound exists', () => {
      expect(gateway.broker.getQueue('inbound-q').messageCount).to.equal(0);
    });

    And('end event was taken once', () => {
      expect(definition.getActivityById('end').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    let stopped;
    let state;
    When('ran again with a listener stopping run when gateway has started monitoring', () => {
      definition = new Definition(context.clone(), { services: getTakeServices() });

      definition.broker.subscribeTmp(
        'event',
        'activity.start',
        (_, msg) => {
          if (msg.content.id === 'gateway') {
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

    When('recovered and resumed from gateway', () => {
      definition = new Definition(context.clone(), { services: getTakeServices() }).recover(state);

      leave = definition.waitFor('leave');

      definition.resume();
    });

    Then('run completes', () => {
      return leave;
    });

    And('parallel gateway completed both loops', () => {
      gateway = definition.getActivityById('gateway');
      expect(gateway.counters).to.deep.equal({ taken: 2, discarded: 0 });
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
      expect(joinLeaveMsg.content.inbound).to.have.length(2);
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

function getTakeServices() {
  return {
    takeOnce({ content, environment }) {
      const onceId = `${environment.variables.content.executionId}_${content.id}`;
      const count = environment.variables[onceId] ?? 0;
      environment.variables[onceId] = count + 1;
      return count === 0;
    },
  };
}
