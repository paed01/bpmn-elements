import { Definition } from 'bpmn-elements';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';

const linkSource = `
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="theProcess" isExecutable="true">
    <startEvent id="start" />
    <sequenceFlow id="to-decision" sourceRef="start" targetRef="decision" />
    <exclusiveGateway id="decision" default="to-end1" />
    <sequenceFlow id="to-end1" sourceRef="decision" targetRef="end1" />
    <endEvent id="end1" />
    <sequenceFlow id="to-throw" sourceRef="decision" targetRef="throw">
      <conditionExpression xsi:type="tFormalExpression">\${environment.variables.go}</conditionExpression>
    </sequenceFlow>
    <intermediateThrowEvent id="throw">
      <linkEventDefinition name="LINKA" />
    </intermediateThrowEvent>
    <intermediateCatchEvent id="catch">
      <linkEventDefinition name="LINKA" />
    </intermediateCatchEvent>
    <sequenceFlow id="from-catch" sourceRef="catch" targetRef="end2" />
    <endEvent id="end2" />
  </process>
</definitions>`;

Feature('Link as goto', () => {
  Scenario('throw → catch invocation when branch is taken', () => {
    /** @type {Definition} */
    let definition;
    Given('a process with a throw and a paired catch', async () => {
      const context = await testHelpers.context(linkSource);
      definition = new Definition(context, { variables: { go: true } });
    });

    let end;
    const linkCatch = [];
    When('definition is ran', () => {
      definition.broker.subscribeTmp(
        'event',
        'activity.start',
        (_, msg) => {
          if (msg.content.id === 'catch') {
            linkCatch.push(msg);
          }
        },
        { noAck: true }
      );

      end = definition.waitFor('end');
      definition.run();
    });

    Then('definition completes', () => {
      return end;
    });

    And('throw event was taken', () => {
      expect(definition.getActivityById('throw').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    And('catch event was taken once', () => {
      expect(definition.getActivityById('catch').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    And('catch event has throw event as inbound', () => {
      expect(linkCatch, 'catch start events').to.have.length(1);
      expect(linkCatch[0].content.inbound, 'inbound length').to.have.length(1);
      expect(linkCatch[0]?.content.inbound[0]).to.deep.include({ id: 'throw' });
    });

    And('downstream end after catch was reached', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('taken', 1);
    });
  });

  Scenario('catch is dormant when throw branch is discarded', () => {
    /** @type {Definition} */
    let definition;
    Given('a process where the throw branch is bypassed', async () => {
      const context = await testHelpers.context(linkSource);
      definition = new Definition(context, { variables: { go: false } });
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('definition completes', () => {
      return end;
    });

    And('throw event counters stay at 0', () => {
      expect(definition.getActivityById('throw').counters).to.deep.equal({ taken: 0, discarded: 0 });
    });

    And('catch event was never invoked — counters stay at 0', () => {
      expect(definition.getActivityById('catch').counters).to.deep.equal({ taken: 0, discarded: 0 });
    });

    And('catch is not running', () => {
      expect(definition.getActivityById('catch')).to.have.property('isRunning', false);
    });

    And('end2 (downstream of catch) was not reached', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('taken', 0);
    });
  });

  Scenario('catch never publishes activity.wait', () => {
    let definition;
    let waitMessages;
    Given('a process with a paired throw/catch', async () => {
      const context = await testHelpers.context(linkSource);
      definition = new Definition(context, { variables: { go: true } });
      waitMessages = [];
      definition.broker.subscribeTmp(
        'event',
        'activity.wait',
        (_, msg) => {
          if (msg.content.id === 'catch') waitMessages.push(msg);
        },
        { noAck: true }
      );
    });

    When('definition is ran to completion', async () => {
      const end = definition.waitFor('end');
      definition.run();
      await end;
    });

    Then('no activity.wait was published for the catch', () => {
      expect(waitMessages).to.have.length(0);
    });
  });

  Scenario('pending link throw survives stop/recover/resume', () => {
    /** @type {Definition} */
    let definition;
    let context;
    let state;

    Given('a process with throw and catch where stop happens after throw fires', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-throw" sourceRef="start" targetRef="throw" />
          <intermediateThrowEvent id="throw">
            <linkEventDefinition name="LINKA" />
          </intermediateThrowEvent>
          <intermediateCatchEvent id="catch">
            <linkEventDefinition name="LINKA" />
          </intermediateCatchEvent>
          <sequenceFlow id="from-catch" sourceRef="catch" targetRef="userTask" />
          <userTask id="userTask" />
          <sequenceFlow id="to-end" sourceRef="userTask" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end, wait;
    When('definition is ran and pauses at the user task downstream of catch', async () => {
      wait = definition.waitFor('wait');
      end = definition.waitFor('end');
      definition.run();
      await wait;
    });

    And('definition is stopped while userTask is waiting', () => {
      definition.stop();
    });

    And('state is captured', () => {
      state = JSON.parse(JSON.stringify(definition.getState()));
    });

    When('definition is recovered into a fresh instance and resumed', () => {
      definition = new Definition(context).recover(state);
      end = definition.waitFor('end');
      definition.resume();
    });

    And('the user task is signaled', () => {
      const userTask = definition.getPostponed().find((api) => api.id === 'userTask');
      expect(userTask, 'userTask api').to.exist;
      userTask.signal();
    });

    Then('definition completes', () => {
      return end;
    });

    And('catch ran exactly once across the lifecycle', () => {
      expect(definition.getActivityById('catch').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    And('throw was taken exactly once', () => {
      expect(definition.getActivityById('throw').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });
  });

  Scenario('link routes into a parallel join (link as alternate path to join)', () => {
    /** @type {Definition} */
    let definition;
    let join;

    Given('a process where one of the join inbound paths is reached only via a link', async () => {
      const source = factory.resource('link-to-parallel-join.bpmn');
      const context = await testHelpers.context(source);
      definition = new Definition(context, { variables: { condition: true } });
      join = definition.getActivityById('join');
    });

    When('definition is ran with condition routing to the link', async () => {
      const leave = definition.waitFor('leave');
      definition.run();
      await leave;
    });

    Then('process completes via the link → catch → join path', () => {
      expect(definition.getActivityById('end').counters).to.have.property('taken', 1);
    });

    And('the catch was invoked once', () => {
      expect(definition.getActivityById('catch-link').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    And('the parallel join took once (link branch arrived as take, sibling branches discarded back to it)', () => {
      expect(join.counters).to.have.property('taken', 1);
    });

    When('definition is ran again with condition flipped so link is bypassed', async () => {
      definition.environment.variables.condition = false;
      const leave = definition.waitFor('leave');
      definition.run();
      await leave;
    });

    Then('process completes via the non-link parallel paths', () => {
      expect(definition.getActivityById('end').counters).to.have.property('taken', 2);
    });

    And('catch counter unchanged from the previous run', () => {
      expect(definition.getActivityById('catch-link').counters).to.have.property('taken', 1);
    });

    And('the parallel join took twice in total', () => {
      expect(join.counters).to.have.property('taken', 2);
    });
  });

  Scenario('two throws share a single catch — sync catch processes both', () => {
    /** @type {Definition} */
    let definition;
    Given('a process where both inclusive branches throw the same link name into one catch', async () => {
      const source = factory.resource('link-multiple-catch.bpmn');
      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        variables: { take1: true, take2: true },
      });
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('definition completes', () => {
      return end;
    });

    And('both throws were taken', () => {
      expect(definition.getActivityById('goto-a').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('goto-b').counters).to.have.property('taken', 1);
    });

    And('the shared catch ran twice', () => {
      expect(definition.getActivityById('catch-a').counters).to.deep.equal({ taken: 2, discarded: 0 });
    });

    And('the downstream end was taken twice', () => {
      expect(definition.getActivityById('end-a').counters).to.have.property('taken', 2);
    });
  });

  Scenario('two throws share a single catch — async catch queues the second throw', () => {
    /** @type {Definition} */
    let definition;
    Given('a process where the catch completion is held until the next tick', async () => {
      const source = factory.resource('link-multiple-catch.bpmn');
      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        variables: { take1: true, take2: true },
        extensions: {
          asyncCatchEnd(activity) {
            if (activity.id !== 'catch-a') return;

            activity.on('end', (api) => {
              if (api.fields.redelivered) return;

              const { broker } = activity;
              broker.publish('format', 'run.end.async', { endRoutingKey: 'run.end.async.done' });

              process.nextTick(() => {
                broker.publish('format', 'run.end.async.done', {});
              });
            });
          },
        },
      });
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('definition completes', () => {
      return end;
    });

    And('both throws were taken', () => {
      expect(definition.getActivityById('goto-a').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('goto-b').counters).to.have.property('taken', 1);
    });

    And('the catch ran twice — the second throw was queued until the first finished', () => {
      expect(definition.getActivityById('catch-a').counters).to.deep.equal({ taken: 2, discarded: 0 });
    });

    And('the downstream end was taken twice', () => {
      expect(definition.getActivityById('end-a').counters).to.have.property('taken', 2);
    });
  });

  Scenario('two throws share a single catch — pending throw survives stop/recover/resume', () => {
    /** @type {Definition} */
    let definition;
    let context, state;

    const asyncCatch = {
      asyncCatchEnd(activity) {
        if (activity.id !== 'catch') return;
        activity.on('end', (api) => {
          if (api.fields.redelivered) return;
          const broker = activity.broker;
          broker.publish('format', 'run.end.async', { endRoutingKey: 'run.end.async.done' });
          process.nextTick(() => broker.publish('format', 'run.end.async.done', {}));
        });
      },
    };

    Given('a process with two throws sharing one catch downstream of a user task', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-gw" sourceRef="start" targetRef="gw" />
          <inclusiveGateway id="gw" />
          <sequenceFlow id="to-throw1" sourceRef="gw" targetRef="throw1">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.take1}</conditionExpression>
          </sequenceFlow>
          <sequenceFlow id="to-throw2" sourceRef="gw" targetRef="throw2">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.take2}</conditionExpression>
          </sequenceFlow>
          <intermediateThrowEvent id="throw1">
            <linkEventDefinition name="LINKA" />
          </intermediateThrowEvent>
          <intermediateThrowEvent id="throw2">
            <linkEventDefinition name="LINKA" />
          </intermediateThrowEvent>
          <intermediateCatchEvent id="catch">
            <linkEventDefinition name="LINKA" />
          </intermediateCatchEvent>
          <sequenceFlow id="to-userTask" sourceRef="catch" targetRef="userTask" />
          <userTask id="userTask" />
          <sequenceFlow id="to-end" sourceRef="userTask" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
      definition = new Definition(context, {
        variables: { take1: true, take2: true },
        extensions: asyncCatch,
      });
    });

    let wait;
    When('definition runs until the user task waits after the first catch run', async () => {
      wait = definition.waitFor('wait');
      definition.run();
      await wait;
    });

    And('definition is stopped while a pending throw is still queued on the catch', () => {
      definition.stop();
    });

    And('state is captured', () => {
      state = JSON.parse(JSON.stringify(definition.getState()));
    });

    let end;
    When('definition is recovered into a fresh instance and resumed', () => {
      definition = new Definition(context, { extensions: asyncCatch }).recover(state);
      end = definition.waitFor('end');
      definition.resume();
    });

    let wait2;
    And('the first waiting user task is signaled (the second wait fires from the queued throw)', async () => {
      wait2 = definition.waitFor('wait');
      const userTask = definition.getPostponed().find((api) => api.id === 'userTask');
      expect(userTask, 'first userTask api').to.exist;
      userTask.signal();
      await wait2;
    });

    And('the second waiting user task is signaled', () => {
      const userTask = definition.getPostponed().find((api) => api.id === 'userTask');
      expect(userTask, 'second userTask api').to.exist;
      userTask.signal();
    });

    Then('definition completes', () => {
      return end;
    });

    And('both throws were taken', () => {
      expect(definition.getActivityById('throw1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('throw2').counters).to.have.property('taken', 1);
    });

    And('the shared catch ran twice across the lifecycle', () => {
      expect(definition.getActivityById('catch').counters).to.deep.equal({ taken: 2, discarded: 0 });
    });

    And('the downstream end was reached twice', () => {
      expect(definition.getActivityById('end').counters).to.have.property('taken', 2);
    });
  });

  Scenario('throw with no matching catch silently completes', () => {
    /** @type {Definition} */
    let definition;

    Given('a process whose throw has no catch with the same linkName', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-throw" sourceRef="start" targetRef="throw" />
          <intermediateThrowEvent id="throw">
            <linkEventDefinition name="GHOST" />
          </intermediateThrowEvent>
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('definition completes', () => {
      return end;
    });

    And('throw was taken', () => {
      expect(definition.getActivityById('throw').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });
  });
});
