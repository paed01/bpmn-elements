import { Definition } from 'bpmn-elements';
import testHelpers from '../../helpers/testHelpers.js';
import factory from '../../helpers/factory.js';

const source = factory.resource('issue-45.bpmn');

const sourceWithTaskBetweenGateways = factory.resource('issue-45-task-between-gateways.bpmn');

Feature('Issue 45 - A converging parallelGateway fires before a branch behind another parallelGateway completes', () => {
  [
    ['synchronous', (_scope, next) => next()],
    ['asynchronous', (_scope, next) => process.nextTick(next)],
  ].forEach(([kind, delay]) => {
    Scenario(`delay service task completes ${kind}`, () => {
      let context, definition;
      Given('a source where the join gateway is fed directly by start and via a delayed branch', async () => {
        context = await testHelpers.context(source);
        // @ts-expect-error type coverage
        definition = new Definition(context, { services: { delay } });
      });

      let end;
      When('definition is ran', () => {
        end = definition.waitFor('leave');
        definition.run();
      });

      Then('execution completes', () => {
        return end;
      });

      And('delay service task was taken once', () => {
        expect(definition.getActivityById('Activity_Delay').counters).to.deep.equal({ taken: 1, discarded: 0 });
      });

      And('upstream gateway was taken once', () => {
        expect(definition.getActivityById('Gateway_Upstream').counters).to.deep.equal({ taken: 1, discarded: 0 });
      });

      And('downstream join gateway was taken once', () => {
        expect(definition.getActivityById('Gateway_Downstream').counters).to.deep.equal({ taken: 1, discarded: 0 });
      });

      And('both join inbound flows were taken once', () => {
        const join = definition.getActivityById('Gateway_Downstream');
        for (const flow of join.inbound) {
          expect(flow.counters, flow.id).to.deep.equal({ take: 1, discard: 0, looped: 0 });
        }
      });

      And('end event was taken once', () => {
        expect(definition.getActivityById('Event_End').counters).to.deep.equal({ taken: 1, discarded: 0 });
      });

      And('no activities are postponed', () => {
        expect(definition.getPostponed()).to.have.length(0);
      });
    });
  });

  /** @type {[string, string, string[]][]} */
  const sources = [
    ['direct branch first', source, ['Event_Start', 'Activity_Delay', 'Gateway_Upstream']],
    [
      'delayed branch first with a task between the gateways',
      sourceWithTaskBetweenGateways,
      ['Event_Start', 'Activity_Delay', 'Gateway_Upstream', 'Activity_Between'],
    ],
  ];
  sources.forEach(([kind, src, expectedPeers]) => {
    Scenario(`${kind} and the delay service completes asynchronously`, () => {
      let context, definition;
      Given('a definition with an asynchronous delay service', async () => {
        context = await testHelpers.context(src);
        definition = new Definition(context, { services: { delay: (_scope, next) => setTimeout(next, 10) } });
      });

      let end, monitored;
      When('definition is ran capturing the join peer targets when it converges', () => {
        end = definition.waitFor('leave');
        const join = definition.getActivityById('Gateway_Downstream');
        join.broker.subscribeOnce('event', 'activity.converge', () => {
          monitored = [...join.execution.source[Symbol.for('targets')].keys()];
        });
        definition.run();
      });

      Then('execution completes', () => {
        return end;
      });

      And('downstream join gateway was taken once', () => {
        expect(definition.getActivityById('Gateway_Downstream').counters).to.deep.equal({ taken: 1, discarded: 0 });
      });

      And('end event was taken once', () => {
        expect(definition.getActivityById('Event_End').counters).to.deep.equal({ taken: 1, discarded: 0 });
      });

      And('the join monitored every activity upstream of the fork gateway', () => {
        expect(monitored).to.have.members(expectedPeers);
      });
    });
  });
});
