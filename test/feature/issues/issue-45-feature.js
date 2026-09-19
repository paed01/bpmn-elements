import { Definition } from 'bpmn-elements';
import testHelpers from '../../helpers/testHelpers.js';

const source = `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="sid-38422fae" targetNamespace="http://bpmn.io/bpmn">
    <process id="Process_1" isExecutable="true">
      <startEvent id="Event_Start">
        <outgoing>Flow1_StartToDownstream</outgoing>
        <outgoing>Flow2_StartToDelay</outgoing>
      </startEvent>
      <serviceTask id="Activity_Delay" name="delay" implementation="\${environment.services.delay}">
        <incoming>Flow2_StartToDelay</incoming>
        <outgoing>Flow2_DelayToUpstream</outgoing>
      </serviceTask>
      <parallelGateway id="Gateway_Upstream">
        <incoming>Flow2_DelayToUpstream</incoming>
        <outgoing>Flow2_UpstreamToDownstream</outgoing>
      </parallelGateway>
      <parallelGateway id="Gateway_Downstream">
        <incoming>Flow1_StartToDownstream</incoming>
        <incoming>Flow2_UpstreamToDownstream</incoming>
        <outgoing>Flow_DownstreamToEnd</outgoing>
      </parallelGateway>
      <endEvent id="Event_End">
        <incoming>Flow_DownstreamToEnd</incoming>
      </endEvent>
      <!-- branch #1 -->
      <sequenceFlow id="Flow1_StartToDownstream" sourceRef="Event_Start" targetRef="Gateway_Downstream" />
      <!-- branch #2 -->
      <sequenceFlow id="Flow2_StartToDelay" sourceRef="Event_Start" targetRef="Activity_Delay" />
      <sequenceFlow id="Flow2_DelayToUpstream" sourceRef="Activity_Delay" targetRef="Gateway_Upstream" />
      <sequenceFlow id="Flow2_UpstreamToDownstream" sourceRef="Gateway_Upstream" targetRef="Gateway_Downstream" />
      <!-- to end -->
      <sequenceFlow id="Flow_DownstreamToEnd" sourceRef="Gateway_Downstream" targetRef="Event_End" />
    </process>
  </definitions>
`;

const sourceWithTaskBetweenGateways = `
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="sid-38422fae" targetNamespace="http://bpmn.io/bpmn">
    <process id="Process_1" isExecutable="true">
      <startEvent id="Event_Start" />
      <serviceTask id="Activity_Delay" name="delay" implementation="\${environment.services.delay}" />
      <parallelGateway id="Gateway_Upstream" />
      <serviceTask id="Activity_Between" name="between" implementation="\${environment.services.delay}" />
      <parallelGateway id="Gateway_Downstream" />
      <endEvent id="Event_End" />
      <!-- branch #2 first, so the join is reached via the upstream gateway continuation after the direct branch -->
      <sequenceFlow id="Flow2_StartToDelay" sourceRef="Event_Start" targetRef="Activity_Delay" />
      <sequenceFlow id="Flow1_StartToDownstream" sourceRef="Event_Start" targetRef="Gateway_Downstream" />
      <sequenceFlow id="Flow2_DelayToUpstream" sourceRef="Activity_Delay" targetRef="Gateway_Upstream" />
      <sequenceFlow id="Flow2_UpstreamToBetween" sourceRef="Gateway_Upstream" targetRef="Activity_Between" />
      <sequenceFlow id="Flow2_BetweenToDownstream" sourceRef="Activity_Between" targetRef="Gateway_Downstream" />
      <sequenceFlow id="Flow_DownstreamToEnd" sourceRef="Gateway_Downstream" targetRef="Event_End" />
    </process>
  </definitions>
`;

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
