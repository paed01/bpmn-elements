import * as ck from 'chronokinesis';
import { Definition } from 'bpmn-elements';
import JsExtension from '../resources/extensions/JsExtension.js';
import testHelpers from '../helpers/testHelpers.js';
import factory from '../helpers/factory.js';
import CamundaExtension from '../resources/extensions/CamundaExtension.js';

Feature('Skip discarding flows if parallel gateway is not used', () => {
  after(ck.reset);

  Scenario('A process with task splits', () => {
    /** @type {Definition} */
    let definition;
    Given('a process matching scenario', async () => {
      const source = factory.resource('conditional-flows.bpmn');
      const context = await testHelpers.context(source, {
        extensions: {
          js: JsExtension,
        },
      });
      definition = new Definition(context, { settings: { skipDiscard: true } });
    });

    const discardedFlows = [];
    And('a listener counting discarded flows', () => {
      definition.broker.subscribeTmp(
        'event',
        'flow.discard',
        (_, msg) => {
          discardedFlows.push(msg.content.id);
        },
        { noAck: true }
      );
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('no flows were discarded', () => {
      expect(discardedFlows).to.have.length(0);
    });

    And('only some tasks were taken', () => {
      expect(definition.getActivityById('start').counters, 'start').to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('task1').counters, 'task1').to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('task2').counters, 'task2').to.deep.equal({ taken: 0, discarded: 0 });
      expect(definition.getActivityById('task3').counters, 'task3').to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('task4').counters, 'task4').to.deep.equal({ taken: 0, discarded: 0 });
      expect(definition.getActivityById('end').counters, 'end').to.deep.equal({ taken: 1, discarded: 0 });
    });
  });

  Scenario('A process with loop back', () => {
    /** @type {Definition} */
    let definition;
    Given('a process matching scenario', async () => {
      const source = factory.resource('loop.bpmn');
      const context = await testHelpers.context(source, {
        extensions: {
          js: JsExtension,
        },
      });
      definition = new Definition(context, { settings: { skipDiscard: true }, variables: { input: 0 } });
    });

    const discardedFlows = [];
    And('a listener counting discarded flows', () => {
      definition.broker.subscribeTmp(
        'event',
        'flow.discard',
        (_, msg) => {
          discardedFlows.push(msg.content.id);
        },
        { noAck: true }
      );
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('no flows were discarded', () => {
      expect(discardedFlows).to.have.length(0);
    });

    And('only some tasks were taken', () => {
      expect(definition.getActivityById('start').counters, 'start').to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('task1').counters, 'task1').to.deep.equal({ taken: 3, discarded: 0 });
      expect(definition.getActivityById('decision').counters, 'decision').to.deep.equal({ taken: 3, discarded: 0 });
      expect(definition.getActivityById('task2').counters, 'task2').to.deep.equal({ taken: 2, discarded: 0 });
      expect(definition.getActivityById('end').counters, 'end').to.deep.equal({ taken: 1, discarded: 0 });
    });
  });

  Scenario('A process with event based gateway succeeded by signal and timer', () => {
    /** @type {Definition} */
    let definition;
    Given('a process matching scenario', async () => {
      const source = factory.resource('event-based-gateway-with-same-target.bpmn');
      const context = await testHelpers.context(source, {
        extensions: {
          js: JsExtension,
        },
      });
      definition = new Definition(context, { settings: { skipDiscard: true }, variables: { input: 0 } });
    });

    const discardedFlows = [];
    And('a listener counting discarded flows', () => {
      definition.broker.subscribeTmp(
        'event',
        'flow.discard',
        (_, msg) => {
          discardedFlows.push(msg.content.id);
        },
        { noAck: true }
      );
    });

    let end;
    let wait;
    When('ran', () => {
      wait = definition.waitFor('wait');
      end = definition.waitFor('end');
      definition.run();
    });

    let signalEvent;
    Then('run is awaiting signal', async () => {
      signalEvent = await wait;
    });

    When('run is signalled', () => {
      definition.signal(signalEvent.content.signal);
    });

    Then('run completes', () => {
      return end;
    });

    And('no flows were discarded', () => {
      expect(discardedFlows).to.have.length(0);
    });

    And('only some tasks were taken', () => {
      expect(definition.getActivityById('start').counters, 'start').to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('gateway').counters, 'gateway').to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('signalEvent').counters, 'signalEvent').to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('task1').counters, 'task1').to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('timerEvent').counters, 'end').to.deep.equal({ taken: 0, discarded: 1 });
      expect(definition.getActivityById('end').counters, 'end').to.deep.equal({ taken: 1, discarded: 0 });
    });
  });

  ['engine-issue-73.bpmn', 'engine-issue-73_2.bpmn'].forEach((source) => {
    Scenario(`${source} should complete as expected`, () => {
      /** @type {Definition} */
      let definition;
      Given('a process matching scenario', async () => {
        const context = await testHelpers.context(factory.resource(source), {
          extensions: {
            camunda: CamundaExtension,
          },
        });
        definition = new Definition(context, {
          settings: { skipDiscard: true },
          variables: { input: 0 },
          services: {
            takeFlow() {
              return true;
            },
          },
        });
      });

      And('a listener for wait immediately signalling or discarding if touched more than trice', () => {
        definition.broker.subscribeTmp(
          'event',
          'activity.wait',
          (_, msg) => {
            const elm = definition.getActivityById(msg.content.id);
            if (elm.counters.taken > 2) {
              elm.discard();
            } else {
              definition.signal(msg.content.reference ?? { id: msg.content.id, executionId: msg.content.executionId });
            }
          },
          { noAck: true }
        );
      });

      const discardedFlows = [];
      And('a listener counting discarded flows', () => {
        definition.broker.subscribeTmp(
          'event',
          'flow.discard',
          (_, msg) => {
            discardedFlows.push(msg.content.id);
          },
          { noAck: true }
        );
      });

      let end;
      When('ran', () => {
        end = definition.waitFor('end');
        definition.run();
      });

      Then('run completes', () => {
        return end;
      });

      And('with no discarded flows', () => {
        expect(discardedFlows).to.have.length(0);
      });
    });
  });

  [
    'join-paradox-2.bpmn',
    'join-paradox-1.bpmn',
    'join-paradox-3.bpmn',
    'join-paradox-3-with-loopback.bpmn',
    'join-paradox-4.bpmn',
    'join-paradox-5.bpmn',
    'join-inbound.bpmn',
    'issue-42-same-target-sequence-flows.bpmn',
    'issue-42-same-target-sequence-flows-with-excl-gw.bpmn',
    'parallel-join-edgecase.bpmn',
  ].forEach((source) => {
    Scenario(`${source} with parallel converging gateways should complete as expected`, () => {
      /** @type {Definition} */
      let definition;
      Given('a process matching scenario', async () => {
        const context = await testHelpers.context(factory.resource(source), {
          extensions: {
            camunda: CamundaExtension,
          },
        });
        definition = new Definition(context, {
          settings: { skipDiscard: true },
          variables: { input: 0 },
          services: {
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
          },
        });
      });

      And('a listener for wait immediately signalling or discarding if touched more than thrice', () => {
        definition.broker.subscribeTmp(
          'event',
          'activity.wait',
          (_, msg) => {
            const elm = definition.getActivityById(msg.content.id);
            if (elm.counters.taken > 2) {
              elm.discard();
            } else {
              definition.signal(msg.content.reference ?? { id: msg.content.id, executionId: msg.content.executionId });
            }
          },
          { noAck: true }
        );
      });

      const discardedFlows = [];
      And('a listener counting discarded flows', () => {
        definition.broker.subscribeTmp(
          'event',
          'flow.discard',
          (_, msg) => {
            discardedFlows.push(msg.content.id);
          },
          { noAck: true }
        );
      });

      And('a guard for infinite loop', () => {
        definition.broker.subscribeTmp(
          'event',
          'activity.start',
          (_, msg) => {
            if (definition.getActivityById(msg.content.id)?.counters.taken > 5) throw new Error('eternal loop');
          },
          { noAck: true }
        );
      });

      let end;
      When('ran', () => {
        end = definition.waitFor('end');
        definition.run();
      });

      Then('run completes', () => {
        return end;
      });
    });
  });
});
