import { Definition } from 'bpmn-elements';
import testHelpers from '../helpers/testHelpers.js';

const joinSource = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <startEvent id="start" />
    <sequenceFlow id="to-split" sourceRef="start" targetRef="split" />
    <inclusiveGateway id="split" />
    <sequenceFlow id="to-taskA" sourceRef="split" targetRef="taskA">
      <conditionExpression xsi:type="tFormalExpression">\${environment.variables.takeA}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="to-taskB" sourceRef="split" targetRef="taskB">
      <conditionExpression xsi:type="tFormalExpression">\${environment.variables.takeB}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="to-taskC" sourceRef="split" targetRef="taskC">
      <conditionExpression xsi:type="tFormalExpression">\${environment.variables.takeC}</conditionExpression>
    </sequenceFlow>
    <task id="taskA" />
    <serviceTask id="taskB" implementation="\${environment.services.slow}" />
    <task id="taskC" />
    <sequenceFlow id="from-taskA" sourceRef="taskA" targetRef="join" />
    <sequenceFlow id="from-taskB" sourceRef="taskB" targetRef="join" />
    <sequenceFlow id="from-taskC" sourceRef="taskC" targetRef="join" />
    <inclusiveGateway id="join" default="to-end" />
    <sequenceFlow id="to-end" sourceRef="join" targetRef="end" />
    <sequenceFlow id="to-end-conditional" sourceRef="join" targetRef="end-conditional">
      <conditionExpression xsi:type="tFormalExpression">\${environment.variables.takeConditional}</conditionExpression>
    </sequenceFlow>
    <endEvent id="end" />
    <endEvent id="end-conditional" />
  </process>
</definitions>`;

Feature('Inclusive gateway', () => {
  Scenario('A converging inclusive gateway awaits the branches that were actually taken (issue #46)', () => {
    let context;
    /** @type {Definition} */
    let definition;
    Given('a process with an inclusive split into three branches, one asynchronous, joined by an inclusive gateway', async () => {
      context = await testHelpers.context(joinSource);
      definition = new Definition(context, {
        variables: { takeA: true, takeB: true, takeC: false },
        services: {
          slow(...args) {
            setTimeout(args.pop(), 10);
          },
        },
      });
    });

    let leave;
    const convergeMessages = [];
    When('definition is ran with two of the three branches taken', () => {
      definition.broker.subscribeTmp(
        'event',
        'activity.converge',
        (_, msg) => {
          convergeMessages.push(msg.content.id);
        },
        { noAck: true }
      );
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('run completes', () => {
      return leave;
    });

    And('the join emitted activity.converge', () => {
      expect(convergeMessages).to.include('join');
    });

    And('the join fired once, with both taken inbound flows', () => {
      const join = definition.getActivityById('join');
      expect(join.counters).to.deep.equal({ taken: 1, discarded: 0 });
      expect(join.inbound.find(({ id }) => id === 'from-taskA').counters).to.have.property('take', 1);
      expect(join.inbound.find(({ id }) => id === 'from-taskB').counters).to.have.property('take', 1);
      expect(join.inbound.find(({ id }) => id === 'from-taskC').counters).to.have.property('take', 0);
    });

    And('the join took its default outbound once', () => {
      expect(definition.getActivityById('end').counters).to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('end-conditional').counters).to.deep.equal({ taken: 0, discarded: 0 });
    });

    And('no pending inbound exists', () => {
      expect(definition.getPostponed()).to.have.length(0);
    });

    When('ran again with a truthy join condition', () => {
      definition.environment.variables.takeConditional = true;
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('run completes', () => {
      return leave;
    });

    And('the join fired once again and took the conditional outbound', () => {
      expect(definition.getActivityById('join').counters).to.deep.equal({ taken: 2, discarded: 0 });
      expect(definition.getActivityById('end').counters).to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('end-conditional').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    let stopped;
    let state;
    When('ran again with a listener stopping the run when the join has started converging', () => {
      definition = new Definition(context.clone(), {
        variables: { takeA: true, takeB: true, takeC: false },
        services: {
          slow(...args) {
            setTimeout(args.pop(), 10);
          },
        },
      });

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

    Then('run is stopped and state saved', () => {
      return stopped;
    });

    When('recovered and resumed from the converging join', () => {
      definition = new Definition(context.clone(), {
        services: {
          slow(...args) {
            setTimeout(args.pop(), 10);
          },
        },
      }).recover(state);

      leave = definition.waitFor('leave');

      definition.resume();
    });

    Then('run completes', () => {
      return leave;
    });

    And('the join fired once', () => {
      expect(definition.getActivityById('join').counters).to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('end').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });
  });

  Scenario('A converging inclusive gateway without a taken or default outbound', () => {
    /** @type {Definition} */
    let definition;
    Given('a process with an inclusive join whose only outbound flow is conditional', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-fork" sourceRef="start" targetRef="fork" />
          <parallelGateway id="fork" />
          <sequenceFlow id="to-taskA" sourceRef="fork" targetRef="taskA" />
          <sequenceFlow id="to-taskB" sourceRef="fork" targetRef="taskB" />
          <task id="taskA" />
          <task id="taskB" />
          <sequenceFlow id="from-taskA" sourceRef="taskA" targetRef="join" />
          <sequenceFlow id="from-taskB" sourceRef="taskB" targetRef="join" />
          <inclusiveGateway id="join" />
          <sequenceFlow id="to-end" sourceRef="join" targetRef="end">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.takeEnd}</conditionExpression>
          </sequenceFlow>
          <endEvent id="end" />
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let error;
    When('definition is ran', () => {
      error = definition.waitFor('error');
      definition.run();
    });

    Then('the join errors once, after both branches, since no outbound flow was taken', async () => {
      const err = await error;
      expect(err.content.error).to.have.property('message', '<join> no conditional flow taken');
      expect(definition.getActivityById('join').counters).to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('join').inbound.find(({ id }) => id === 'from-taskA').counters).to.have.property('take', 1);
      expect(definition.getActivityById('join').inbound.find(({ id }) => id === 'from-taskB').counters).to.have.property('take', 1);
    });
  });
});
