import { Definition } from 'bpmn-elements';
import testHelpers from '../helpers/testHelpers.js';
import factory from '../helpers/factory.js';

Feature('Ad-hoc subprocess', () => {
  Scenario('Running ad-hoc subprocess', () => {
    let context, definition;
    Given('a process matching feature', async () => {
      const source = factory.resource('ad-hoc-subprocess.bpmn');
      context = await testHelpers.context(source);
    });

    let leave;
    const completedActivities = [];
    When('running definition', () => {
      definition = new Definition(context);

      definition.broker.subscribeTmp(
        'event',
        'activity.end',
        (_, msg) => {
          completedActivities.push({ id: msg.content.id, parent: msg.content.parent.id });
        },
        { noAck: true }
      );

      leave = definition.waitFor('leave');

      definition.run();
    });

    Then('definition completes', () => {
      return leave;
    });

    And('all ad-hoc subprocess activities were taken', () => {
      expect(completedActivities).to.deep.equal([
        { id: 'start', parent: 'process_0' },
        { id: 'task1', parent: 'adhoc' },
        { id: 'throw', parent: 'adhoc' },
        { id: 'task2', parent: 'adhoc' },
        { id: 'task3', parent: 'adhoc' },
        { id: 'adhoc', parent: 'process_0' },
        { id: 'end', parent: 'process_0' },
      ]);
    });
  });

  Scenario('Sequential ad-hoc subprocess', () => {
    let context, definition;
    Given('an ad-hoc subprocess with ordering Sequential and two inner user tasks', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-adhoc" sourceRef="start" targetRef="adhoc" />
          <adHocSubProcess id="adhoc" ordering="Sequential">
            <userTask id="task_a" />
            <userTask id="task_b" />
          </adHocSubProcess>
          <sequenceFlow id="to-end" sourceRef="adhoc" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    const waits = [];
    let end;
    When('running', () => {
      definition = new Definition(context);
      definition.broker.subscribeTmp('event', 'activity.wait', (_, msg) => waits.push(msg.content), { noAck: true });
      end = definition.waitFor('leave');
      definition.run();
    });

    Then('only the first inner task is waiting', () => {
      expect(waits.map((w) => w.id)).to.deep.equal(['task_a']);
    });

    When('the first task is signaled', () => {
      definition.signal({ executionId: waits[0].executionId });
    });

    Then('the second inner task starts waiting', () => {
      expect(waits.map((w) => w.id)).to.deep.equal(['task_a', 'task_b']);
    });

    When('the second task is signaled', () => {
      definition.signal({ executionId: waits[1].executionId });
    });

    Then('the definition completes', () => {
      return end;
    });
  });

  Scenario('Sequential ad-hoc subprocess where a start activity flows to another task', () => {
    let context, definition;
    Given('a Sequential ad-hoc subprocess whose first start activity sequence-flows onward', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-adhoc" sourceRef="start" targetRef="adhoc" />
          <adHocSubProcess id="adhoc" ordering="Sequential">
            <userTask id="start_a" />
            <sequenceFlow id="a-to-a2" sourceRef="start_a" targetRef="task_a2" />
            <userTask id="task_a2" />
            <userTask id="start_b" />
          </adHocSubProcess>
          <sequenceFlow id="to-end" sourceRef="adhoc" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    const waits = [];
    let end;
    When('running', () => {
      definition = new Definition(context);
      definition.broker.subscribeTmp('event', 'activity.wait', (_, msg) => waits.push(msg.content), { noAck: true });
      end = definition.waitFor('leave');
      definition.run();
    });

    Then('only the first branch start is waiting', () => {
      expect(waits.map((w) => w.id)).to.deep.equal(['start_a']);
    });

    When('the branch start is signaled', () => {
      definition.signal({ executionId: waits[0].executionId });
    });

    Then('its downstream task runs before the next branch is armed', () => {
      expect(waits.map((w) => w.id)).to.deep.equal(['start_a', 'task_a2']);
    });

    When('the downstream task completes, draining the branch', () => {
      const taskA2 = waits.find((w) => w.id === 'task_a2');
      definition.signal({ executionId: taskA2.executionId });
    });

    Then('the next branch start is armed', () => {
      expect(waits.map((w) => w.id)).to.deep.equal(['start_a', 'task_a2', 'start_b']);
    });

    When('the last branch is signaled', () => {
      const startB = waits.find((w) => w.id === 'start_b');
      definition.signal({ executionId: startB.executionId });
    });

    Then('the definition completes', () => {
      return end;
    });
  });

  Scenario('Ad-hoc subprocess with completion condition', () => {
    let context, definition;
    Given('an ad-hoc subprocess that completes once task_a is done, cancelling the rest', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-adhoc" sourceRef="start" targetRef="adhoc" />
          <adHocSubProcess id="adhoc">
            <completionCondition xsi:type="tFormalExpression">\${content.output.done}</completionCondition>
            <userTask id="task_a" />
            <userTask id="task_b" />
          </adHocSubProcess>
          <sequenceFlow id="to-end" sourceRef="adhoc" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    const waits = [];
    let end, ended;
    When('running', () => {
      definition = new Definition(context);
      definition.broker.subscribeTmp('event', 'activity.wait', (_, msg) => waits.push(msg.content), { noAck: true });
      ended = [];
      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => ended.push(msg.content.id), { noAck: true });
      end = definition.waitFor('leave');
      definition.run();
    });

    Then('both inner tasks are waiting in parallel', () => {
      expect(waits.map((w) => w.id)).to.have.members(['task_a', 'task_b']);
    });

    When('task_a completes with output that satisfies the completion condition', () => {
      const taskA = waits.find((w) => w.id === 'task_a');
      definition.signal({ executionId: taskA.executionId, done: true });
    });

    Then('the definition completes without task_b being signaled', () => {
      return end;
    });

    And('the remaining task_b was cancelled rather than completed', () => {
      expect(ended, 'task_a completed').to.include('task_a');
      expect(ended, 'task_b was cancelled, so it never ended').to.not.include('task_b');
    });
  });

  Scenario('Ad-hoc subprocess keeps running instances when cancelRemainingInstances is false', () => {
    let context, definition;
    Given('an ad-hoc subprocess that completes on task_a but does not cancel the rest', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-adhoc" sourceRef="start" targetRef="adhoc" />
          <adHocSubProcess id="adhoc" cancelRemainingInstances="false">
            <completionCondition xsi:type="tFormalExpression">\${content.output.done}</completionCondition>
            <userTask id="task_a" />
            <userTask id="task_b" />
          </adHocSubProcess>
          <sequenceFlow id="to-end" sourceRef="adhoc" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    const waits = [];
    let end;
    When('running and task_a completes the condition', () => {
      definition = new Definition(context);
      definition.broker.subscribeTmp('event', 'activity.wait', (_, msg) => waits.push(msg.content), { noAck: true });
      end = definition.waitFor('leave');
      definition.run();
      const taskA = waits.find((w) => w.id === 'task_a');
      definition.signal({ executionId: taskA.executionId, done: true });
    });

    Then('the subprocess is not done because task_b is still running', () => {
      expect(definition.isRunning, 'definition still running').to.be.true;
      expect(waits.find((w) => w.id === 'task_b')).to.be.ok;
    });

    When('the remaining task_b is signaled', () => {
      const taskB = waits.find((w) => w.id === 'task_b');
      definition.signal({ executionId: taskB.executionId });
    });

    Then('the definition completes', () => {
      return end;
    });
  });

  Scenario('Recover and resume a Sequential ad-hoc subprocess mid-sequence, then arm the remaining start', () => {
    let context, definition, state;
    Given('a Sequential ad-hoc subprocess with three inner user tasks', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-adhoc" sourceRef="start" targetRef="adhoc" />
          <adHocSubProcess id="adhoc" ordering="Sequential">
            <userTask id="task_a" />
            <userTask id="task_b" />
            <userTask id="task_c" />
          </adHocSubProcess>
          <sequenceFlow id="to-end" sourceRef="adhoc" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    const armInner = (def, id) =>
      def.signal({
        executionId: def
          .getPostponed()[0]
          .getPostponed()
          .find((a) => a.id === id).executionId,
      });

    let waits;
    When('running, task_a completes, then stopped while task_b waits (task_c not yet armed)', () => {
      definition = new Definition(context);
      waits = [];
      definition.broker.subscribeTmp('event', 'activity.wait', (_, msg) => waits.push(msg.content), { noAck: true });
      definition.run();
      armInner(definition, 'task_a');
      definition.stop();
      state = definition.getState();
    });

    And('only task_a then task_b had been armed', () => {
      expect(waits.map((w) => w.id)).to.deep.equal(['task_a', 'task_b']);
    });

    let end;
    And('recovered from serialized state and resumed', () => {
      const recovered = new Definition(context.clone()).recover(JSON.parse(JSON.stringify(state)));
      waits = [];
      recovered.broker.subscribeTmp('event', 'activity.wait', (_, msg) => waits.push(msg.content), { noAck: true });
      end = recovered.waitFor('leave');
      recovered.resume();
      definition = recovered;
    });

    Then('task_b is restored as waiting', () => {
      expect(waits.map((w) => w.id)).to.deep.equal(['task_b']);
    });

    When('task_b is signaled after resume', () => {
      armInner(definition, 'task_b');
    });

    Then('the remaining start task_c is armed after resume', () => {
      expect(waits.map((w) => w.id)).to.deep.equal(['task_b', 'task_c']);
    });

    When('task_c is signaled', () => {
      armInner(definition, 'task_c');
    });

    Then('the definition completes', () => {
      return end;
    });
  });

  Scenario('An uncaught error in a Sequential ad-hoc start fails the sub process', () => {
    let context, definition;
    Given('a Sequential ad-hoc subprocess with two inner user tasks', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-adhoc" sourceRef="start" targetRef="adhoc" />
          <adHocSubProcess id="adhoc" ordering="Sequential">
            <userTask id="task_a" />
            <userTask id="task_b" />
          </adHocSubProcess>
          <sequenceFlow id="to-end" sourceRef="adhoc" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    let errored, waits;
    When('running and the first inner task fails uncaught', () => {
      definition = new Definition(context);
      waits = [];
      definition.broker.subscribeTmp('event', 'activity.wait', (_, msg) => waits.push(msg.content.id), { noAck: true });
      errored = definition.waitFor('error');
      definition.run();
      definition
        .getPostponed()[0]
        .getPostponed()
        .find((a) => a.id === 'task_a')
        .fail(new Error('boom'));
    });

    Then('the error propagates and the definition does not continue to the next start', async () => {
      await errored;
      expect(definition.isRunning, 'definition stopped on the uncaught error').to.be.false;
      expect(waits, 'the next sequential start was never armed').to.not.include('task_b');
    });
  });

  Scenario('A caught error in a Sequential ad-hoc start lets the sequence continue', () => {
    let context, definition;
    Given('a Sequential ad-hoc subprocess whose first task has a boundary error event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-adhoc" sourceRef="start" targetRef="adhoc" />
          <adHocSubProcess id="adhoc" ordering="Sequential">
            <userTask id="task_a" />
            <boundaryEvent id="be" attachedToRef="task_a"><errorEventDefinition /></boundaryEvent>
            <sequenceFlow id="be-to-handled" sourceRef="be" targetRef="task_a_handled" />
            <userTask id="task_a_handled" />
            <userTask id="task_b" />
          </adHocSubProcess>
          <sequenceFlow id="to-end" sourceRef="adhoc" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    const armInner = (def, id) =>
      def.signal({
        executionId: def
          .getPostponed()[0]
          .getPostponed()
          .find((a) => a.id === id).executionId,
      });

    let waits, end;
    When('running and the first task fails but is caught by its boundary event', () => {
      definition = new Definition(context);
      waits = [];
      const tasks = ['task_a', 'task_a_handled', 'task_b'];
      definition.broker.subscribeTmp('event', 'activity.wait', (_, msg) => tasks.includes(msg.content.id) && waits.push(msg.content.id), {
        noAck: true,
      });
      end = definition.waitFor('leave');
      definition.run();
      definition
        .getPostponed()[0]
        .getPostponed()
        .find((a) => a.id === 'task_a')
        .fail(new Error('boom'));
    });

    Then('the caught error reroutes the branch without failing the sub process', () => {
      expect(definition.isRunning, 'the caught error did not fail the definition').to.be.true;
      expect(waits).to.deep.equal(['task_a', 'task_a_handled']);
    });

    And('completing the rerouted branch arms the next sequential start', () => {
      armInner(definition, 'task_a_handled');
      expect(waits).to.deep.equal(['task_a', 'task_a_handled', 'task_b']);
    });

    And('the definition completes once the last start is signaled', () => {
      armInner(definition, 'task_b');
      return end;
    });
  });

  Scenario('Ad-hoc subprocess containing a sub process', () => {
    let context, definition;
    Given('an ad-hoc subprocess whose only start activity is a sub process with an inner user task', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-adhoc" sourceRef="start" targetRef="adhoc" />
          <adHocSubProcess id="adhoc">
            <subProcess id="inner">
              <startEvent id="innerStart" />
              <sequenceFlow id="to-innerTask" sourceRef="innerStart" targetRef="innerTask" />
              <userTask id="innerTask" />
            </subProcess>
          </adHocSubProcess>
          <sequenceFlow id="to-end" sourceRef="adhoc" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    const waits = [];
    let end;
    When('running', () => {
      definition = new Definition(context);
      definition.broker.subscribeTmp('event', 'activity.wait', (_, msg) => waits.push(msg.content), { noAck: true });
      end = definition.waitFor('leave');
      definition.run();
    });

    Then('the inner sub process user task is waiting', () => {
      expect(waits.map((w) => w.id)).to.deep.equal(['innerTask']);
    });

    When('the inner user task is signaled', () => {
      definition.signal({ executionId: waits[0].executionId });
    });

    Then('the definition completes once the inner sub process drains', () => {
      return end;
    });
  });
});
