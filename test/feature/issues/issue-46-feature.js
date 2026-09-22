import { Definition } from 'bpmn-elements';
import testHelpers from '../../helpers/testHelpers.js';
import factory from '../../helpers/factory.js';

const source = factory.resource('issue-46.bpmn');

Feature('Issue 46 - inclusiveGateway has no converging/join implementation', () => {
  /** @type {[string, Record<string, boolean>, string[]][]} */
  const branches = [
    ['A and B taken, C not', { takeA: true, takeB: true, takeC: false }, ['Activity_A', 'Activity_B']],
    ['all three taken', { takeA: true, takeB: true, takeC: true }, ['Activity_A', 'Activity_B', 'Activity_C']],
    ['only the delayed B taken', { takeA: false, takeB: true, takeC: false }, ['Activity_B']],
  ];

  branches.forEach(([kind, variables, taken]) => {
    Scenario(`inclusive split into three branches with ${kind}, joined by an inclusive gateway`, () => {
      let context, definition;
      Given('a definition with a delayed asynchronous service task on branch B', async () => {
        context = await testHelpers.context(source);
        definition = new Definition(context, {
          variables,
          services: { delay: (_scope, next) => setTimeout(next, 10) },
        });
      });

      let end;
      const completed = [];
      When('definition is ran capturing the completion sequence', () => {
        definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => completed.push(msg.content.id), { noAck: true });
        end = definition.waitFor('leave');
        definition.run();
      });

      Then('execution completes', () => {
        return end;
      });

      And('the join fired once, after every taken branch', () => {
        expect(definition.getActivityById('Gateway_Join').counters).to.deep.equal({ taken: 1, discarded: 0 });
        expect(completed.filter((id) => id === 'Gateway_Join')).to.have.length(1);
        for (const id of taken) {
          expect(completed.indexOf(id), `${id} before join`).to.be.below(completed.indexOf('Gateway_Join'));
        }
      });

      And('the taken branches ran once and the untaken not at all', () => {
        for (const id of ['Activity_A', 'Activity_B', 'Activity_C']) {
          expect(definition.getActivityById(id).counters, id).to.deep.equal({ taken: taken.includes(id) ? 1 : 0, discarded: 0 });
        }
      });

      And('only the taken join inbound flows were touched', () => {
        const join = definition.getActivityById('Gateway_Join');
        for (const flow of join.inbound) {
          const expectedTake = taken.some((id) => flow.sourceId === id) ? 1 : 0;
          expect(flow.counters, flow.id).to.deep.equal({ take: expectedTake, discard: 0, looped: 0 });
        }
      });

      And('end event was reached once', () => {
        expect(definition.getActivityById('Event_End').counters).to.deep.equal({ taken: 1, discarded: 0 });
        expect(completed.filter((id) => id === 'Event_End')).to.have.length(1);
      });

      And('no activities are postponed', () => {
        expect(definition.getPostponed()).to.have.length(0);
      });

      When('ran again on the same definition', () => {
        completed.length = 0;
        end = definition.waitFor('leave');
        definition.run();
      });

      Then('execution completes', () => {
        return end;
      });

      And('the join and end event fired once again', () => {
        expect(definition.getActivityById('Gateway_Join').counters).to.deep.equal({ taken: 2, discarded: 0 });
        expect(definition.getActivityById('Event_End').counters).to.deep.equal({ taken: 2, discarded: 0 });
        expect(completed.filter((id) => id === 'Gateway_Join')).to.have.length(1);
      });
    });
  });

  Scenario('the join is stopped while converging and resumed from state', () => {
    let context, definition;
    Given('a definition with A and B taken and a delayed asynchronous B', async () => {
      context = await testHelpers.context(source);
      definition = new Definition(context, {
        variables: { takeA: true, takeB: true, takeC: false },
        services: { delay: (_scope, next) => setTimeout(next, 10) },
      });
    });

    let stopped, state;
    When('definition is ran and stopped when the join starts converging', () => {
      definition.broker.subscribeTmp(
        'event',
        'activity.converge',
        (_, msg) => {
          if (msg.content.id !== 'Gateway_Join') return;
          definition.broker.cancel(msg.fields.consumerTag);
          definition.stop();
          state = definition.getState();
        },
        { noAck: true, priority: 10000 }
      );
      stopped = definition.waitFor('stop');
      definition.run();
    });

    Then('run is stopped with the join postponed', async () => {
      await stopped;
      expect(definition.getPostponed().map(({ id }) => id)).to.include('Gateway_Join');
    });

    let end;
    When('recovered and resumed', () => {
      definition = new Definition(context.clone(), {
        services: { delay: (_scope, next) => setTimeout(next, 10) },
      }).recover(state);
      end = definition.waitFor('leave');
      definition.resume();
    });

    Then('execution completes', () => {
      return end;
    });

    And('the join and end event fired once', () => {
      expect(definition.getActivityById('Gateway_Join').counters).to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('Event_End').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    And('no activities are postponed', () => {
      expect(definition.getPostponed()).to.have.length(0);
    });
  });
});
