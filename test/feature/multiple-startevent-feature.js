import { Definition } from 'bpmn-elements';
import testHelpers from '../helpers/testHelpers.js';
import factory from '../helpers/factory.js';

Feature('Multiple start events', () => {
  Scenario('Two start events waiting to be signaled ending up in a task', () => {
    const source = factory.resource('multiple-signal-startevents.bpmn');

    let definition;
    Given('a process with multiple start events, a joining task and an end event', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        extensions: {
          output(element) {
            if (element.type !== 'bpmn:Process') return;

            const { broker, environment } = element;
            broker.subscribeTmp(
              'event',
              'activity.end',
              (_, { content }) => {
                environment.output[content.id] = 1;
              },
              { noAck: true }
            );
          },
        },
      });
    });

    let leave;
    When('process is ran', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    And('first start event is signaled', () => {
      definition.signal();
    });

    Then('first end event is taken', () => {
      const endEvent = definition.getActivityById('end');
      expect(endEvent.counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    And('second end event is not taken', () => {
      const endEvent = definition.getActivityById('named-end');
      expect(endEvent.counters).to.deep.equal({ taken: 0, discarded: 0 });
    });

    And('process is completed', async () => {
      await leave;
      expect(definition.counters).to.deep.equal({
        completed: 1,
        discarded: 0,
      });
    });

    When('process is ran again', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    And('second start event is signaled', () => {
      const start2 = definition.getPostponed().find(({ id }) => id === 'start2');
      definition.signal(start2.content.signal);
    });

    Then('second end event is taken', () => {
      const endEvent = definition.getActivityById('named-end');
      expect(endEvent.counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    And('first end event is discarded', () => {
      const endEvent = definition.getActivityById('end');
      expect(endEvent.counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    And('process is completed', async () => {
      await leave;

      const pending = definition.getPostponed().map(({ id }) => id);

      expect(definition.counters, `pending <${pending}>`).to.deep.equal({
        completed: 2,
        discarded: 0,
      });
    });
  });

  Scenario('Two start events waiting to be signaled ending up in a parallel join', () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>
    <definitions id="command-definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
      <process id="multiple-start-process" isExecutable="true">
        <startEvent id="start1">
          <signalEventDefinition />
        </startEvent>
        <startEvent id="start2">
          <signalEventDefinition signalRef="Message_1" />
        </startEvent>
        <sequenceFlow id="from-start1" sourceRef="start1" targetRef="join" />
        <sequenceFlow id="from-start2" sourceRef="start2" targetRef="join" />
        <parallelGateway id="join" />
        <sequenceFlow id="to-decision" sourceRef="join" targetRef="decision" />
        <exclusiveGateway id="decision" default="to-end" />
        <sequenceFlow id="to-named-end" sourceRef="decision" targetRef="named-end">
          <conditionExpression xsi:type="tFormalExpression" language="javascript">next(null, environment.output.start2)</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="to-end" sourceRef="decision" targetRef="end" />
        <endEvent id="named-end" name="Named completed" />
        <endEvent id="end" name="Anonymous completed" />
      </process>
      <signal id="Message_1" name="start2" />
    </definitions>`;

    let definition;
    Given('a process with multiple start events, a joining task and an end event', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        extensions: {
          output(element) {
            if (element.type !== 'bpmn:Process') return;

            const { broker, environment } = element;
            broker.subscribeTmp(
              'event',
              'activity.end',
              (_, { content }) => {
                environment.output[content.id] = 1;
              },
              { noAck: true }
            );
          },
        },
      });
    });

    let leave;
    When('process is ran', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    And('first start event is signaled', () => {
      definition.signal();
    });

    Then('the second start event is discarded as an alternative entry point', () => {
      expect(definition.getActivityById('start2').counters).to.include({ taken: 0, discarded: 1 });
    });

    And('the parallel join fires once with the single token', () => {
      expect(definition.getActivityById('join').counters).to.include({ taken: 1 });
    });

    And('the default end event is taken and the process is completed', async () => {
      await leave;
      expect(definition.getActivityById('end').counters).to.include({ taken: 1 });
      expect(definition.getActivityById('named-end').counters).to.include({ taken: 0 });
      expect(definition.counters).to.include({ completed: 1 });
    });

    When('process is ran again and the second start event is signaled first', () => {
      leave = definition.waitFor('leave');
      definition.run();
      definition.signal({ id: 'Message_1' });
    });

    Then('the first start event is now discarded as the alternative', () => {
      expect(definition.getActivityById('start1').counters).to.include({ discarded: 1 });
    });

    And('the named end event is taken and the process is completed', async () => {
      await leave;
      expect(definition.getActivityById('named-end').counters).to.include({ taken: 1 });
      expect(definition.counters).to.include({ completed: 2 });
    });
  });

  Scenario('Two start events joined by a task followed by a parallel fork', () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>
    <definitions id="command-definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
      <process id="multiple-start-process" isExecutable="true">
        <startEvent id="start1">
          <signalEventDefinition />
        </startEvent>
        <startEvent id="start2">
          <signalEventDefinition signalRef="Signal2" />
        </startEvent>
        <sequenceFlow id="from-start1" sourceRef="start1" targetRef="task" />
        <sequenceFlow id="from-start2" sourceRef="start2" targetRef="task" />
        <task id="task" />
        <sequenceFlow id="from-task" sourceRef="task" targetRef="fork" />
        <parallelGateway id="fork" />
        <sequenceFlow id="to-end1" sourceRef="fork" targetRef="end1" />
        <sequenceFlow id="to-end2" sourceRef="fork" targetRef="end2" />
        <endEvent id="end1" />
        <endEvent id="end2" />
      </process>
      <signal id="Signal2" name="start2" />
    </definitions>`;

    let context;
    /** @type {Definition} */
    let definition;
    Given('a process with multiple signal start events, a joining task and a subsequent fork', async () => {
      context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    And('the subsequent fork is a parallel gateway but not a parallel join', () => {
      const fork = definition.getActivityById('fork');
      expect(fork.isParallelGateway, 'isParallelGateway').to.be.true;
      expect(fork.isParallelJoin, 'isParallelJoin').to.be.false;
      expect(fork.inbound).to.have.length(1);
      expect(fork.outbound).to.have.length(2);
    });

    let leave;
    When('process is ran', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    And('the first start event is signaled', () => {
      definition.signal();
    });

    Then('the second start event is discarded as an alternative entry point', () => {
      expect(definition.getActivityById('start2').counters).to.include({ taken: 0, discarded: 1 });
    });

    And('the joining task was taken once', () => {
      expect(definition.getActivityById('task').counters).to.include({ taken: 1 });
    });

    And('the fork fired once and both end events were taken once, completing the process', async () => {
      await leave;
      expect(definition.getActivityById('fork').counters).to.include({ taken: 1 });
      expect(definition.getActivityById('end1').counters).to.include({ taken: 1 });
      expect(definition.getActivityById('end2').counters).to.include({ taken: 1 });
      expect(definition.counters).to.include({ completed: 1 });
    });

    When('process is ran again and the second start event is signaled', () => {
      leave = definition.waitFor('leave');
      definition.run();
      definition.signal({ id: 'Signal2' });
    });

    Then('the first start event is now discarded as the alternative', () => {
      expect(definition.getActivityById('start1').counters).to.include({ discarded: 1 });
    });

    And('the process is completed and the task was taken once more', async () => {
      await leave;
      expect(definition.getActivityById('task').counters).to.include({ taken: 2 });
      expect(definition.getActivityById('fork').counters).to.include({ taken: 2 });
      expect(definition.counters).to.include({ completed: 2 });
    });
  });

  const startAndReceiveSource = `<?xml version="1.0" encoding="UTF-8"?>
    <definitions id="def" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" targetNamespace="http://bpmn.io/schema/bpmn">
      <process id="start-and-receive" isExecutable="true">
        <startEvent id="start1">
          <signalEventDefinition signalRef="Signal1" />
        </startEvent>
        <startEvent id="start2">
          <signalEventDefinition signalRef="Signal2" />
        </startEvent>
        <receiveTask id="receive" messageRef="Message1" />
        <sequenceFlow id="from-start1" sourceRef="start1" targetRef="end1" />
        <sequenceFlow id="from-start2" sourceRef="start2" targetRef="end2" />
        <sequenceFlow id="from-receive" sourceRef="receive" targetRef="end3" />
        <endEvent id="end1" />
        <endEvent id="end2" />
        <endEvent id="end3" />
      </process>
      <signal id="Signal1" name="signal 1" />
      <signal id="Signal2" name="signal 2" />
      <message id="Message1" name="message 1" />
    </definitions>`;

  Scenario('Two signal start events combined with a starting receive task', () => {
    const source = startAndReceiveSource;

    let definition;
    Given('a process with two signal start events and a starting receive task', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let leave;
    When('process is ran', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('both start events and the receive task are armed', () => {
      expect(definition.getPostponed().map(({ id }) => id)).to.have.members(['start1', 'start2', 'receive']);
    });

    When('the first start event is signaled', () => {
      definition.signal({ id: 'Signal1' });
    });

    Then('the first start event ran to its end event', () => {
      expect(definition.getActivityById('start1').counters).to.include({ taken: 1 });
      expect(definition.getActivityById('end1').counters).to.include({ taken: 1 });
    });

    And('the second start event was discarded as an alternative entry point', () => {
      expect(definition.getActivityById('start2').counters).to.include({ taken: 0, discarded: 1 });
    });

    But('the receive task is left armed, since it is a real token that must be signaled', () => {
      expect(definition.getActivityById('receive').counters).to.include({ taken: 0, discarded: 0 });
      expect(definition.getPostponed().map(({ id }) => id)).to.deep.equal(['receive']);
    });

    And('the process is still running', () => {
      expect(definition.isRunning).to.be.true;
    });

    When('the receive task is signaled with its message', () => {
      definition.sendMessage({ id: 'Message1' });
    });

    Then('the receive task ran to its end event', () => {
      expect(definition.getActivityById('receive').counters).to.include({ taken: 1 });
      expect(definition.getActivityById('end3').counters).to.include({ taken: 1 });
    });

    And('the process completed', async () => {
      await leave;
      expect(definition.counters).to.include({ completed: 1 });
    });
  });

  Scenario('Stop and resume while all start events are armed', () => {
    let definition;
    Given('a process with two signal start events and a starting receive task', async () => {
      const context = await testHelpers.context(startAndReceiveSource);
      definition = new Definition(context);
    });

    let leave;
    When('process is ran', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('both start events and the receive task are armed', () => {
      expect(definition.getPostponed().map(({ id }) => id)).to.have.members(['start1', 'start2', 'receive']);
    });

    When('process is stopped', () => {
      definition.stop();
    });

    Then('it is stopped with all entry points still armed', () => {
      expect(definition.stopped).to.be.true;
      expect(definition.getPostponed().map(({ id }) => id)).to.have.members(['start1', 'start2', 'receive']);
    });

    When('process is resumed', () => {
      leave = definition.waitFor('leave');
      definition.resume();
    });

    Then('all entry points are armed again', () => {
      expect(definition.isRunning).to.be.true;
      expect(definition.getPostponed().map(({ id }) => id)).to.have.members(['start1', 'start2', 'receive']);
    });

    When('the first start event is signaled after resume', () => {
      definition.signal({ id: 'Signal1' });
    });

    Then('the second start event is still discarded as an alternative entry point', () => {
      expect(definition.getActivityById('start1').counters).to.include({ taken: 1 });
      expect(definition.getActivityById('start2').counters).to.include({ taken: 0, discarded: 1 });
    });

    And('the receive task is left armed', () => {
      expect(definition.getPostponed().map(({ id }) => id)).to.deep.equal(['receive']);
    });

    When('the receive task is signaled with its message', () => {
      definition.sendMessage({ id: 'Message1' });
    });

    Then('the process completed', async () => {
      await leave;
      expect(definition.counters).to.include({ completed: 1 });
    });
  });

  Scenario('Get state, recover, and resume while all start events are armed', () => {
    let definition;
    Given('a process with two signal start events and a starting receive task', async () => {
      const context = await testHelpers.context(startAndReceiveSource);
      definition = new Definition(context);
    });

    When('process is ran', () => {
      definition.run();
    });

    Then('both start events and the receive task are armed', () => {
      expect(definition.getPostponed().map(({ id }) => id)).to.have.members(['start1', 'start2', 'receive']);
    });

    let state;
    When('process is stopped and state is saved', () => {
      definition.stop();
      state = definition.getState();
    });

    let recovered, leave;
    Given('the state is recovered into a new definition and resumed', async () => {
      const context = await testHelpers.context(startAndReceiveSource);
      recovered = new Definition(context).recover(JSON.parse(JSON.stringify(state)));
      leave = recovered.waitFor('leave');
      recovered.resume();
    });

    Then('all entry points are armed in the recovered definition', () => {
      expect(recovered.isRunning).to.be.true;
      expect(recovered.getPostponed().map(({ id }) => id)).to.have.members(['start1', 'start2', 'receive']);
    });

    When('the second start event is signaled in the recovered definition', () => {
      recovered.signal({ id: 'Signal2' });
    });

    Then('the first start event is discarded as an alternative entry point', () => {
      expect(recovered.getActivityById('start2').counters).to.include({ taken: 1 });
      expect(recovered.getActivityById('start1').counters).to.include({ taken: 0, discarded: 1 });
    });

    And('the receive task is left armed', () => {
      expect(recovered.getPostponed().map(({ id }) => id)).to.deep.equal(['receive']);
    });

    When('the receive task is signaled with its message', () => {
      recovered.sendMessage({ id: 'Message1' });
    });

    Then('the recovered process completed', async () => {
      await leave;
      expect(recovered.counters).to.include({ completed: 1 });
    });
  });

  Scenario('Recover a pre-flag state where the start events are still armed', () => {
    // State saved before the isStartEvent flag existed lacks it on persisted messages.
    function stripStartEventFlag(value) {
      if (Array.isArray(value)) return value.forEach(stripStartEventFlag);
      if (value && typeof value === 'object') {
        delete value.isStartEvent;
        for (const key of Object.keys(value)) stripStartEventFlag(value[key]);
      }
    }

    let state;
    Given('a stopped process state without the isStartEvent flag while all entry points are armed', async () => {
      const definition = new Definition(await testHelpers.context(startAndReceiveSource));
      definition.run();
      definition.stop();
      state = JSON.parse(JSON.stringify(definition.getState()));
      stripStartEventFlag(state);
      delete state.stateVersion;
    });

    let recovered, leave;
    When('the legacy state is recovered and resumed', async () => {
      recovered = new Definition(await testHelpers.context(startAndReceiveSource)).recover(state);
      leave = recovered.waitFor('leave');
      recovered.resume();
    });

    Then('all entry points are armed in the recovered definition', () => {
      expect(recovered.getPostponed().map(({ id }) => id)).to.have.members(['start1', 'start2', 'receive']);
    });

    When('the first start event is signaled after resume', () => {
      recovered.signal({ id: 'Signal1' });
    });

    Then('the first start event ran and the second is discarded as an alternative entry point', () => {
      expect(recovered.getActivityById('start1').counters).to.include({ taken: 1 });
      expect(recovered.getActivityById('start2').counters).to.include({ taken: 0, discarded: 1 });
    });

    And('only the receive task is left armed', () => {
      expect(recovered.getPostponed().map(({ id }) => id)).to.deep.equal(['receive']);
    });

    When('the receive task is signaled with its message', () => {
      recovered.sendMessage({ id: 'Message1' });
    });

    Then('the recovered process completed', async () => {
      await leave;
      expect(recovered.counters).to.include({ completed: 1 });
    });
  });

  Scenario('Recover a state where one entry point already won before recovery', () => {
    let state;
    Given('a stopped process state where the first start event already ran but the second is still armed', async () => {
      // Pre-mutual-exclusion behaviour left alternative entry points concurrently armed.
      // Reconstruct it: the winning start event has left, the losing start event is still armed.
      const armedDefinition = new Definition(await testHelpers.context(startAndReceiveSource));
      armedDefinition.run();
      armedDefinition.stop();
      const armed = JSON.parse(JSON.stringify(armedDefinition.getState()));

      const advancedDefinition = new Definition(await testHelpers.context(startAndReceiveSource));
      advancedDefinition.run();
      advancedDefinition.signal({ id: 'Signal1' });
      advancedDefinition.stop();
      state = JSON.parse(JSON.stringify(advancedDefinition.getState()));

      const armedProc = armed.execution.processes[0];
      const proc = state.execution.processes[0];

      const armedStart2 = armedProc.execution.children.find((c) => c.id === 'start2');
      const children = proc.execution.children;
      children[children.findIndex((c) => c.id === 'start2')] = armedStart2;

      const armedQueue = armedProc.broker.queues.find((q) => /execute-/.test(q.name));
      const queue = proc.broker.queues.find((q) => /execute-/.test(q.name));
      queue.messages = queue.messages.filter((m) => m.content?.id !== 'start2');
      queue.messages.push(armedQueue.messages.find((m) => m.content.id === 'start2'));

      // This shape only arises from a major before start events became mutually exclusive.
      delete state.stateVersion;
    });

    let recovered, leave;
    When('the state is recovered and resumed', async () => {
      recovered = new Definition(await testHelpers.context(startAndReceiveSource)).recover(JSON.parse(JSON.stringify(state)));
      leave = recovered.waitFor('leave');
      recovered.resume();
    });

    Then('the start event that already won is kept', () => {
      expect(recovered.getActivityById('start1').counters).to.include({ taken: 1 });
    });

    And('the start event still armed is discarded as an alternative entry point', () => {
      expect(recovered.getActivityById('start2').counters).to.include({ taken: 0, discarded: 1 });
    });

    And('only the receive task is left armed', () => {
      expect(recovered.getPostponed().map(({ id }) => id)).to.deep.equal(['receive']);
    });

    When('the receive task is signaled with its message', () => {
      recovered.sendMessage({ id: 'Message1' });
    });

    Then('the recovered process completed', async () => {
      await leave;
      expect(recovered.counters).to.include({ completed: 1 });
    });
  });

  Scenario('A timer start event combined with a signal start event', () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>
    <definitions id="def" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
      <process id="timer-and-signal" isExecutable="true">
        <startEvent id="timerStart">
          <timerEventDefinition>
            <timeDuration>PT1H</timeDuration>
          </timerEventDefinition>
        </startEvent>
        <startEvent id="signalStart">
          <signalEventDefinition signalRef="Signal1" />
        </startEvent>
        <sequenceFlow id="from-timer" sourceRef="timerStart" targetRef="timerEnd" />
        <sequenceFlow id="from-signal" sourceRef="signalStart" targetRef="signalEnd" />
        <endEvent id="timerEnd" />
        <endEvent id="signalEnd" />
      </process>
      <signal id="Signal1" name="signal 1" />
    </definitions>`;

    let definition;
    Given('a process with a timer start event and a signal start event', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let leave;
    When('process is ran', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('both start events are armed', () => {
      expect(definition.getPostponed().map(({ id }) => id)).to.have.members(['timerStart', 'signalStart']);
      expect(definition.environment.timers.executing).to.have.length(1);
    });

    When('the timer start event is cancelled', () => {
      definition.cancelActivity({ id: 'timerStart' });
    });

    Then('the timer start event completes', () => {
      expect(definition.getActivityById('timerStart').counters).to.include({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('timerEnd').counters).to.include({ taken: 1 });
    });

    And('the signal start event is discarded as an alternative entry point', () => {
      expect(definition.getActivityById('signalStart').counters).to.include({ taken: 0, discarded: 1 });
    });

    And('the process completed with no timer left executing', async () => {
      await leave;
      expect(definition.counters).to.include({ completed: 1 });
      expect(definition.environment.timers.executing).to.have.length(0);
    });

    When('process is ran again and the signal start event is signaled', () => {
      leave = definition.waitFor('leave');
      definition.run();
      definition.signal({ id: 'Signal1' });
    });

    Then('the signal start event completes', () => {
      expect(definition.getActivityById('signalStart').counters).to.include({ taken: 1 });
      expect(definition.getActivityById('signalEnd').counters).to.include({ taken: 1 });
    });

    And('the timer start event is discarded and its timer torn down', () => {
      expect(definition.getActivityById('timerStart').counters).to.include({ discarded: 1 });
      expect(definition.environment.timers.executing).to.have.length(0);
    });

    And('the process completed again', async () => {
      await leave;
      expect(definition.counters).to.include({ completed: 2 });
    });
  });
});
