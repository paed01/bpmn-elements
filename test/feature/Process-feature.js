import testHelpers from '../helpers/testHelpers';
import factory from '../helpers/factory';

const AssertMessage = testHelpers.AssertMessage;

Feature('Process', () => {
  Scenario('A process with one activity', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" name="Process" isExecutable="true">
        <startEvent id="activity" name="Start" />
      </process>
    </definitions>`;

    let processInstance, assertMessage;
    Given('a process', async () => {
      const context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      assertMessage = AssertMessage(context, messages, true);
    });

    const messages = [];
    And('the process is subscribed to', () => {
      processInstance.broker.subscribeTmp('event', 'process.#', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});

      processInstance.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let completed;
    When('run', () => {
      completed = processInstance.waitFor('leave');
      processInstance.run();
    });

    And('completed', () => {
      return completed;
    });

    Then('the process was entered with with id and name', () => {
      const msg = assertMessage('process.enter', 'theProcess');
      expect(msg.content).to.have.property('id', 'theProcess');
      expect(msg.content).to.have.property('name', 'Process');

      assertMessage('process.start', 'theProcess');
    });

    And('the process has the expected execution sequence', async () => {
      assertMessage('activity.init', 'activity');
      assertMessage('activity.enter', 'activity');
      assertMessage('activity.start', 'activity');
      assertMessage('activity.end', 'activity');
      assertMessage('activity.leave', 'activity');
      assertMessage('process.end', 'theProcess');
      assertMessage('process.leave', 'theProcess');
    });
  });

  Scenario('A process with two succeeding activities', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow" sourceRef="start" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    let processInstance, assertMessage;
    Given('a process', async () => {
      const context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      assertMessage = AssertMessage(context, messages, true);
    });

    const messages = [];
    And('the process is subscribed to', () => {
      processInstance.broker.subscribeTmp('event', 'process.#', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});

      processInstance.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let completed;
    When('run', () => {
      completed = processInstance.waitFor('leave');
      processInstance.run();
    });

    And('completed', () => {
      return completed;
    });

    Then('the process has the expected execution sequence', () => {
      assertMessage('process.enter', 'theProcess');
      assertMessage('process.start', 'theProcess');
      assertMessage('activity.init', 'start');
      assertMessage('activity.enter', 'start');
      assertMessage('activity.start', 'start');
      assertMessage('activity.end', 'start');
      assertMessage('activity.leave', 'start');
      assertMessage('activity.enter', 'end');
      assertMessage('activity.start', 'end');
      assertMessage('activity.end', 'end');
      assertMessage('activity.leave', 'end');
      assertMessage('process.end', 'theProcess');
      assertMessage('process.leave', 'theProcess');
    });
  });

  Scenario('A process with an activity with two inbound', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start1" />
        <startEvent id="start2" />
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start1" targetRef="end" />
        <sequenceFlow id="flow2" sourceRef="start2" targetRef="end" />
      </process>
    </definitions>`;

    const messages = [];
    let processInstance, assertMessage;
    Given('a process', async () => {
      const context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      assertMessage = AssertMessage(context, messages, true);
    });

    And('the process is subscribed to', () => {
      processInstance.broker.subscribeTmp('event', 'process.#', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});

      processInstance.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let completed;
    When('run', () => {
      completed = processInstance.waitFor('leave');
      processInstance.run();
    });

    And('completed', () => {
      return completed;
    });

    Then('the process has the expected start sequence', () => {
      assertMessage('process.enter', 'theProcess');
      assertMessage('process.start', 'theProcess');
      assertMessage('activity.init', 'start1');
      assertMessage('activity.init', 'start2');
      assertMessage('activity.enter', 'start1');
      assertMessage('activity.start', 'start1');
      assertMessage('activity.end', 'start1');
      assertMessage('activity.leave', 'start1');
    });

    And('the activity with two inbound completes twice', () => {
      assertMessage('activity.enter', 'end');
      assertMessage('activity.start', 'end');
      assertMessage('activity.end', 'end');
      assertMessage('activity.leave', 'end');
      assertMessage('activity.enter', 'start2');
      assertMessage('activity.start', 'start2');
      assertMessage('activity.end', 'start2');
      assertMessage('activity.leave', 'start2');
      assertMessage('activity.enter', 'end');
      assertMessage('activity.start', 'end');
      assertMessage('activity.end', 'end');
      assertMessage('activity.leave', 'end');
      assertMessage('process.end', 'theProcess');
      assertMessage('process.leave', 'theProcess');
    });
  });

  Scenario('A process with a decision', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="decision" />
        <exclusiveGateway id="decision" default="flow3" />
        <sequenceFlow id="flow2" sourceRef="decision" targetRef="end1">
          <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition1}</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="flow3" sourceRef="decision" targetRef="end2" />
        <endEvent id="end1" />
        <endEvent id="end2" />
      </process>
    </definitions>`;

    const messages = [];
    let processInstance, assertMessage;
    Given('a process', async () => {
      const context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      assertMessage = AssertMessage(context, messages, true);
    });

    And('the process is subscribed to', () => {
      processInstance.broker.subscribeTmp('event', 'process.#', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});

      processInstance.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let completed;
    When('run', () => {
      completed = processInstance.waitFor('leave');
      processInstance.run();
    });

    And('completed', () => {
      return completed;
    });

    Then('the process has the expected execution sequence', () => {
      assertMessage('process.enter', 'theProcess');
      assertMessage('process.start', 'theProcess');
      assertMessage('activity.init', 'start');
      assertMessage('activity.enter', 'start');
      assertMessage('activity.start', 'start');
      assertMessage('activity.end', 'start');
      assertMessage('activity.leave', 'start');
      assertMessage('activity.enter', 'decision');
      assertMessage('activity.start', 'decision');
      assertMessage('activity.end', 'decision');
      assertMessage('activity.leave', 'decision');
      assertMessage('activity.discard', 'end1');
      assertMessage('activity.leave', 'end1');
      assertMessage('activity.enter', 'end2');
      assertMessage('activity.start', 'end2');
      assertMessage('activity.end', 'end2');
      assertMessage('activity.leave', 'end2');
      assertMessage('process.end', 'theProcess');
      assertMessage('process.leave', 'theProcess');
    });
  });

  Scenario('A process with multiple start activities conforming to the same flow', () => {
    let bp;
    Given('a process with two user tasks both arriving at the same end event', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <userTask id="start1" />
          <userTask id="start2" />
          <sequenceFlow id="flow1" sourceRef="start1" targetRef="end" />
          <sequenceFlow id="flow3" sourceRef="start2" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);
      bp = context.getProcessById('theProcess');
    });

    let completed;
    When('run', () => {
      completed = bp.waitFor('leave');
      bp.run();
    });

    let start1, start2;
    When('second user task is signaled', () => {
      [start1, start2] = bp.getPostponed();
      start2.signal();
    });

    Then('the process completes', () => {
      expect(bp.isRunning).to.be.false;
      return completed;
    });

    And('second user task was taken', () => {
      expect(start2.owner.counters).to.have.property('taken', 1);
      expect(start2.owner.counters).to.have.property('discarded', 0);
    });

    And('first user task was discarded', () => {
      expect(start1.owner.counters).to.have.property('discarded', 1);
      expect(start1.owner.counters).to.have.property('taken', 0);
    });

    Given('a process with two user tasks both arriving at a join', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <userTask id="start1" />
          <userTask id="start2" />
          <sequenceFlow id="flow1" sourceRef="start1" targetRef="join" />
          <sequenceFlow id="flow3" sourceRef="start2" targetRef="join" />
          <parallelGateway id="join" />
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);
      bp = context.getProcessById('theProcess');
    });

    When('run', () => {
      completed = bp.waitFor('leave');
      bp.run();
    });

    When('first user task is signaled', () => {
      [start1, start2] = bp.getPostponed();
      start1.signal();
    });

    Then('the process is still running', () => {
      expect(bp.isRunning).to.be.true;
    });

    When('second user task is signaled', () => {
      start2.signal();
    });

    Then('the process completes', () => {
      return completed;
    });

    And('first user task was taken', () => {
      expect(start1.owner.counters).to.have.property('taken', 1);
      expect(start1.owner.counters).to.have.property('discarded', 0);
    });

    And('second user task was taken', () => {
      expect(start2.owner.counters).to.have.property('taken', 1);
      expect(start2.owner.counters).to.have.property('discarded', 0);
    });

    Given('a process with two tasks conforming to an end activity', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <task id="start1" />
          <task id="start2" />
          <sequenceFlow id="flow1" sourceRef="start1" targetRef="end" />
          <sequenceFlow id="flow2" sourceRef="start2" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);
      bp = context.getProcessById('theProcess');
    });

    When('run', () => {
      completed = bp.waitFor('leave');
      bp.run();
    });

    Then('the process completes', () => {
      return completed;
    });

    And('first task was taken', () => {
      expect(start1.owner.counters).to.have.property('taken', 1);
      expect(start1.owner.counters).to.have.property('discarded', 0);
    });

    And('second task was taken', () => {
      expect(start2.owner.counters).to.have.property('taken', 1);
      expect(start2.owner.counters).to.have.property('discarded', 0);
    });

    And('end activity was taken twice', () => {
      expect(bp.getActivityById('end').counters).to.have.property('taken', 2);
      expect(bp.getActivityById('end').counters).to.have.property('discarded', 0);
    });

    Given('a process with two tasks conforming to separate end activities', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <task id="start1" />
          <task id="start2" />
          <sequenceFlow id="flow1" sourceRef="start1" targetRef="end1" />
          <sequenceFlow id="flow2" sourceRef="start2" targetRef="end2" />
          <endEvent id="end1" />
          <endEvent id="end2" />
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);
      bp = context.getProcessById('theProcess');
    });

    When('run', () => {
      completed = bp.waitFor('leave');
      bp.run();
    });

    Then('the process completes', () => {
      return completed;
    });

    And('first task was taken', () => {
      expect(start1.owner.counters).to.have.property('taken', 1);
      expect(start1.owner.counters).to.have.property('discarded', 0);
    });

    And('second task was taken', () => {
      expect(start2.owner.counters).to.have.property('taken', 1);
      expect(start2.owner.counters).to.have.property('discarded', 0);
    });

    And('first end activity was taken', () => {
      expect(bp.getActivityById('end1').counters).to.have.property('taken', 1);
      expect(bp.getActivityById('end1').counters).to.have.property('discarded', 0);
    });

    And('second end activity was taken', () => {
      expect(bp.getActivityById('end2').counters).to.have.property('taken', 1);
      expect(bp.getActivityById('end2').counters).to.have.property('discarded', 0);
    });
  });

  Scenario('A process with a join', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start1" />
        <startEvent id="start2" />
        <sequenceFlow id="flow1" sourceRef="start1" targetRef="join" />
        <sequenceFlow id="flow2" sourceRef="start2" targetRef="join" />
        <parallelGateway id="join" />
        <sequenceFlow id="flow3" sourceRef="join" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    const messages = [];
    let processInstance, assertMessage;
    Given('a process', async () => {
      const context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      assertMessage = AssertMessage(context, messages, true);
    });

    And('the process is subscribed to', () => {
      processInstance.broker.subscribeTmp('event', 'process.#', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});

      processInstance.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let completed;
    When('run', () => {
      completed = processInstance.waitFor('leave');
      processInstance.run();
    });

    And('completed', () => {
      return completed;
    });

    Then('the process has the expected execution sequence', () => {
      assertMessage('process.enter', 'theProcess');
      assertMessage('process.start', 'theProcess');
      assertMessage('activity.init', 'start1');
      assertMessage('activity.init', 'start2');
      assertMessage('activity.enter', 'start1');
      assertMessage('activity.start', 'start1');
      assertMessage('activity.end', 'start1');
      assertMessage('activity.leave', 'start1');
      assertMessage('activity.init', 'join');
      assertMessage('activity.enter', 'start2');
      assertMessage('activity.start', 'start2');
      assertMessage('activity.end', 'start2');
      assertMessage('activity.leave', 'start2');
      assertMessage('activity.enter', 'join');
      assertMessage('activity.start', 'join');
      assertMessage('activity.end', 'join');
      assertMessage('activity.leave', 'join');
      assertMessage('activity.enter', 'end');
      assertMessage('activity.start', 'end');
      assertMessage('activity.end', 'end');
      assertMessage('activity.leave', 'end');
      assertMessage('process.end', 'theProcess');
      assertMessage('process.leave', 'theProcess');
    });
  });

  Scenario('A process with a decision that is joined', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="decision" />
        <exclusiveGateway id="decision" default="flow3" />
        <sequenceFlow id="flow2" sourceRef="decision" targetRef="join">
          <conditionExpression xsi:type="tFormalExpression">\${variables.condition1}</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="flow3" sourceRef="decision" targetRef="join" />
        <parallelGateway id="join" />
        <sequenceFlow id="flow4" sourceRef="join" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    const messages = [];
    let processInstance, assertMessage;
    Given('a process', async () => {
      const context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      assertMessage = AssertMessage(context, messages, true);
    });

    And('the process is subscribed to', () => {
      processInstance.broker.subscribeTmp('event', 'process.#', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});

      processInstance.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let completed;
    When('run', () => {
      completed = processInstance.waitFor('leave');
      processInstance.run();
    });

    And('completed', () => {
      return completed;
    });

    Then('the process has the expected execution sequence', () => {
      assertMessage('process.enter', 'theProcess');
      assertMessage('process.start', 'theProcess');
      assertMessage('activity.init', 'start');
      assertMessage('activity.enter', 'start');
      assertMessage('activity.start', 'start');
      assertMessage('activity.end', 'start');
      assertMessage('activity.leave', 'start');
      assertMessage('activity.enter', 'decision');
      assertMessage('activity.start', 'decision');
      assertMessage('activity.end', 'decision');
      assertMessage('activity.leave', 'decision');
      assertMessage('activity.init', 'join');
      assertMessage('activity.enter', 'join');
      assertMessage('activity.start', 'join');
      assertMessage('activity.end', 'join');
      assertMessage('activity.leave', 'join');
      assertMessage('activity.enter', 'end');
      assertMessage('activity.start', 'end');
      assertMessage('activity.end', 'end');
      assertMessage('activity.leave', 'end');
      assertMessage('process.end', 'theProcess');
      assertMessage('process.leave', 'theProcess');
    });
  });

  Scenario('A process with a discard loop sequence', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="activity1" />
        <intermediateCatchEvent id="activity1">
          <timerEventDefinition>
            <timeDuration xsi:type="tFormalExpression">PT0.01S</timeDuration>
          </timerEventDefinition>
        </intermediateCatchEvent>
        <sequenceFlow id="flow2" sourceRef="activity1" targetRef="activity2" />
        <task id="activity2" />
        <sequenceFlow id="flow3" sourceRef="activity2" targetRef="decision" />
        <exclusiveGateway id="decision" default="flow4" />
        <sequenceFlow id="flow4" sourceRef="decision" targetRef="activity1">
          <conditionExpression xsi:type="tFormalExpression">\${variables.condition1}</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="flow5" sourceRef="decision" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    const messages = [];
    let processInstance, assertMessage;
    Given('a process', async () => {
      const context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      assertMessage = AssertMessage(context, messages, true);
    });

    let looped = 0;
    And('the process is subscribed to', () => {
      processInstance.broker.subscribeTmp('event', '#', (routingKey, message) => {
        if (message.content.id === 'activity1' && routingKey === 'activity.discard') {
          ++looped;
          if (looped > 2) throw new Error('Inifinty loop');
        }

        messages.push(message);
      }, {noAck: true});
    });

    let completed;
    When('run', () => {
      completed = processInstance.waitFor('leave');
      processInstance.run();
    });

    And('completed', () => {
      return completed;
    });

    Then('the process has the expected execution sequence', () => {
      assertMessage('process.enter');
      assertMessage('process.start');

      assertMessage('activity.init', 'start');
      assertMessage('activity.enter', 'start');
      assertMessage('activity.start', 'start');
      assertMessage('activity.execution.completed', 'start');
      assertMessage('activity.end', 'start');
      assertMessage('flow.pre-flight', 'flow1');
      assertMessage('activity.leave', 'start');

      assertMessage('flow.take', 'flow1');

      assertMessage('activity.enter', 'activity1');
      assertMessage('activity.start', 'activity1');
      assertMessage('activity.timer', 'activity1');
      assertMessage('activity.timeout', 'activity1');
      assertMessage('activity.execution.completed', 'activity1');
      assertMessage('activity.end', 'activity1');
      assertMessage('flow.pre-flight', 'flow2');
      assertMessage('activity.leave', 'activity1');

      assertMessage('flow.take', 'flow2');

      assertMessage('activity.enter', 'activity2');
      assertMessage('activity.start', 'activity2');
      assertMessage('activity.execution.completed', 'activity2');
      assertMessage('activity.end', 'activity2');
      assertMessage('flow.pre-flight', 'flow3');
      assertMessage('activity.leave', 'activity2');

      assertMessage('flow.take', 'flow3');

      assertMessage('activity.enter', 'decision');
      assertMessage('activity.start', 'decision');
      assertMessage('activity.execution.completed', 'decision');
      assertMessage('activity.end', 'decision');
      assertMessage('flow.pre-flight', 'flow4');
      assertMessage('flow.pre-flight', 'flow5');
      assertMessage('activity.leave', 'decision');

      assertMessage('flow.discard', 'flow4');
      assertMessage('flow.take', 'flow5');

      assertMessage('activity.enter', 'end');
      assertMessage('activity.start', 'end');
      assertMessage('activity.execution.completed', 'end');
      assertMessage('activity.end', 'end');
      assertMessage('activity.leave', 'end');

      assertMessage('activity.discard', 'activity1');

      assertMessage('flow.pre-flight', 'flow2');
      assertMessage('activity.leave', 'activity1');

      assertMessage('flow.discard', 'flow2');

      assertMessage('activity.discard', 'activity2');
      assertMessage('flow.pre-flight', 'flow3');
      assertMessage('activity.leave', 'activity2');

      assertMessage('flow.looped', 'flow3');
      assertMessage('process.end');
      assertMessage('process.leave');

      expect(messages.length).to.equal(0);
    });

    And('no more messages are received', async () => {
      await new Promise((resolve) => process.nextTick(resolve));
      expect(messages.length).to.equal(0);
    });
  });

  Scenario('A process with a terminate end event', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="decision" />
        <parallelGateway id="fork" />
        <sequenceFlow id="flow2" sourceRef="fork" targetRef="timer" />
        <sequenceFlow id="flow3" sourceRef="fork" targetRef="end1" />
        <intermediateCatchEvent id="timer">
          <timerEventDefinition>
            <timeDuration xsi:type="tFormalExpression">PT1S</timeDuration>
          </timerEventDefinition>
        </intermediateCatchEvent>
        <sequenceFlow id="flow4" sourceRef="timer" targetRef="end2" />
        <endEvent id="end1">
          <terminateEventDefinition />
        </endEvent>
        <endEvent id="end2" />
      </process>
    </definitions>`;

    const messages = [];
    let processInstance, assertMessage;
    Given('a process', async () => {
      const context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      assertMessage = AssertMessage(context, messages, true);
    });

    And('the process is subscribed to', () => {
      processInstance.broker.subscribeTmp('event', 'process.#', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});

      processInstance.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let completed;
    When('run', () => {
      completed = processInstance.waitFor('leave');
      processInstance.run();
    });

    And('completed', () => {
      return completed;
    });

    Then('the process has the expected execution sequence', () => {
      assertMessage('process.enter', 'theProcess');
      assertMessage('process.start', 'theProcess');
      assertMessage('activity.init', 'start');
      assertMessage('activity.init', 'fork');
      assertMessage('activity.enter', 'start');
      assertMessage('activity.start', 'start');
      assertMessage('activity.end', 'start');
      assertMessage('activity.leave', 'start');
      assertMessage('activity.enter', 'fork');
      assertMessage('activity.start', 'fork');
      assertMessage('activity.end', 'fork');
      assertMessage('activity.leave', 'fork');

      assertMessage('activity.enter', 'timer');
      assertMessage('activity.start', 'timer');
      assertMessage('activity.timer', 'timer');

      assertMessage('activity.enter', 'end1');
      assertMessage('activity.start', 'end1');
      assertMessage('process.terminate', 'end1');
      assertMessage('activity.end', 'end1');
      assertMessage('activity.leave', 'end1');
      assertMessage('activity.stop', 'timer');
      assertMessage('process.end', 'theProcess');
      assertMessage('process.leave', 'theProcess');

      expect(messages.length).to.equal(0);
    });
  });

  Scenario('A process with a timeout event', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="postponed" />
        <sequenceFlow id="flow2" sourceRef="start" targetRef="immediate" />
        <intermediateCatchEvent id="postponed">
          <timerEventDefinition>
            <timeDuration xsi:type="tFormalExpression">PT0.01S</timeDuration>
          </timerEventDefinition>
        </intermediateCatchEvent>
        <task id="immediate" />
        <sequenceFlow id="flow3" sourceRef="postponed" targetRef="join" />
        <sequenceFlow id="flow4" sourceRef="immediate" targetRef="join" />
        <parallelGateway id="join" />
        <sequenceFlow id="flow5" sourceRef="join" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    const messages = [];
    let processInstance, assertMessage;
    Given('a process', async () => {
      const context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      processInstance.environment.variables.condition1 = true;
      assertMessage = AssertMessage(context, messages, true);
    });

    And('the process is subscribed to', () => {
      processInstance.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let completed;
    When('run', () => {
      completed = processInstance.waitFor('leave');
      processInstance.run();
    });

    And('completed', () => {
      return completed;
    });

    Then('the process started the timeout event', () => {
      assertMessage('activity.init', 'start');
      assertMessage('activity.enter', 'start');
      assertMessage('activity.start', 'start');
      assertMessage('activity.end', 'start');
      assertMessage('activity.leave', 'start');
      assertMessage('activity.enter', 'postponed');
      assertMessage('activity.start', 'postponed');
      assertMessage('activity.timer', 'postponed');
    });

    And('completed parallel activities', () => {
      assertMessage('activity.enter', 'immediate');
      assertMessage('activity.start', 'immediate');
      assertMessage('activity.end', 'immediate');
      assertMessage('activity.leave', 'immediate');
      assertMessage('activity.init', 'join');
    });

    And('before the timeout event completes', () => {
      assertMessage('activity.timeout', 'postponed');
      assertMessage('activity.end', 'postponed');
      assertMessage('activity.leave', 'postponed');
      assertMessage('activity.enter', 'join');
      assertMessage('activity.start', 'join');
      assertMessage('activity.end', 'join');
      assertMessage('activity.leave', 'join');
      assertMessage('activity.enter', 'end');
      assertMessage('activity.start', 'end');
      assertMessage('activity.end', 'end');
      assertMessage('activity.leave', 'end');
    });
  });

  Scenario('A process with a catch anonymous message event', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="receive" />
        <intermediateCatchEvent id="receive">
          <messageEventDefinition />
        </intermediateCatchEvent>
        <sequenceFlow id="flow2" sourceRef="receive" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    const messages = [];
    let bp, assertMessage;
    Given('a process', async () => {
      const context = await testHelpers.context(source);
      bp = context.getProcessById('theProcess');
      bp.environment.variables.condition1 = true;
      assertMessage = AssertMessage(context, messages, true);
    });

    And('the activities are subscribed to', () => {
      bp.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let waiting;
    And('waiting for catch message', () => {
      waiting = bp.waitFor('wait');
    });

    let completed;
    When('run', () => {
      completed = bp.waitFor('leave');
      bp.run();
    });

    And('waiting', () => {
      return waiting;
    });

    Then('the process is waiting for the receive message event', () => {
      assertMessage('activity.init', 'start');
      assertMessage('activity.enter', 'start');
      assertMessage('activity.start', 'start');
      assertMessage('activity.end', 'start');
      assertMessage('activity.leave', 'start');
      assertMessage('activity.enter', 'receive');
      assertMessage('activity.start', 'receive');
      assertMessage('activity.wait', 'receive');
    });

    When('a message is received', () => {
      bp.getApi().sendApiMessage('message', {
        target: {
          id: 'receive',
        },
      }, {delegate: true});
    });

    Then('the process continuous execution and completes', async () => {
      await completed;

      assertMessage('activity.consumed', 'receive');
      assertMessage('activity.catch', 'receive');
      assertMessage('activity.end', 'receive');
      assertMessage('activity.leave', 'receive');
      assertMessage('activity.enter', 'end');
      assertMessage('activity.start', 'end');
      assertMessage('activity.end', 'end');
      assertMessage('activity.leave', 'end');
    });
  });

  Scenario('A process with a combined catch message and timeout event', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="postponed" />
        <sequenceFlow id="flow2" sourceRef="start" targetRef="immediate" />
        <intermediateCatchEvent id="postponed">
          <messageEventDefinition />
          <timerEventDefinition>
            <timeDuration xsi:type="tFormalExpression">\${environment.variables.timeout}</timeDuration>
          </timerEventDefinition>
        </intermediateCatchEvent>
        <task id="immediate" />
        <sequenceFlow id="flow3" sourceRef="postponed" targetRef="join" />
        <sequenceFlow id="flow4" sourceRef="immediate" targetRef="join" />
        <parallelGateway id="join" />
        <sequenceFlow id="flow5" sourceRef="join" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    const messages = [];
    let processInstance, assertMessage;
    Given('a process', async () => {
      const context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      processInstance.environment.variables.timeout = 'PT0.01S';
      assertMessage = AssertMessage(context, messages, true);
    });

    And('the activities are subscribed to', () => {
      processInstance.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let completed;
    When('run', () => {
      completed = processInstance.waitFor('leave');
      processInstance.run();
    });

    And('the timeout occurs first', () => {
      return completed;
    });

    Then('the process started the combined event', () => {
      assertMessage('activity.init', 'start');
      assertMessage('activity.enter', 'start');
      assertMessage('activity.start', 'start');
      assertMessage('activity.end', 'start');
      assertMessage('activity.leave', 'start');
      assertMessage('activity.enter', 'postponed');
      assertMessage('activity.start', 'postponed');
      assertMessage('activity.wait', 'postponed');
      assertMessage('activity.timer', 'postponed');
    });

    And('completed parallel activity', () => {
      assertMessage('activity.enter', 'immediate');
      assertMessage('activity.start', 'immediate');
      assertMessage('activity.end', 'immediate');
      assertMessage('activity.leave', 'immediate');
      assertMessage('activity.init', 'join');
    });

    And('before the timeout event completes', () => {
      assertMessage('activity.timeout', 'postponed');
      assertMessage('activity.end', 'postponed');
      assertMessage('activity.leave', 'postponed');
      assertMessage('activity.enter', 'join');
      assertMessage('activity.start', 'join');
      assertMessage('activity.end', 'join');
      assertMessage('activity.leave', 'join');
      assertMessage('activity.enter', 'end');
      assertMessage('activity.start', 'end');
      assertMessage('activity.end', 'end');
      assertMessage('activity.leave', 'end');
      expect(messages.length).to.equal(0);
    });

    let waiting;
    When('run again', () => {
      waiting = processInstance.waitFor('wait');
      completed = processInstance.waitFor('leave');
      processInstance.environment.variables.timeout = 'PT1S';
      processInstance.run();
    });

    And('the combined event is signaled', async () => {
      const api = await waiting;

      assertMessage('activity.init', 'start');
      assertMessage('activity.enter', 'start');
      assertMessage('activity.start', 'start');
      assertMessage('activity.end', 'start');
      assertMessage('activity.leave', 'start');
      assertMessage('activity.enter', 'postponed');
      assertMessage('activity.start', 'postponed');
      assertMessage('activity.wait', 'postponed');
      assertMessage('activity.timer', 'postponed');
      assertMessage('activity.enter', 'immediate');
      assertMessage('activity.start', 'immediate');
      assertMessage('activity.end', 'immediate');
      assertMessage('activity.leave', 'immediate');

      api.signal();
    });

    Then('the combined event completes', () => {
      assertMessage('activity.init', 'join');
      assertMessage('activity.catch', 'postponed');
      assertMessage('activity.end', 'postponed');
      assertMessage('activity.leave', 'postponed');
    });

    And('the timeout is discarded and process completes', async () => {
      await completed;
      assertMessage('activity.enter', 'join');
      assertMessage('activity.start', 'join');
      assertMessage('activity.end', 'join');
      assertMessage('activity.leave', 'join');
      assertMessage('activity.enter', 'end');
      assertMessage('activity.start', 'end');
      assertMessage('activity.end', 'end');
      assertMessage('activity.leave', 'end');
    });
  });

  Scenario('Task execution fails with error', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow0" sourceRef="start" targetRef="service" />
        <serviceTask id="service" implementation="\${environment.services.get}"/>
        <sequenceFlow id="flow1" sourceRef="service" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    const messages = [];
    let processInstance, assertMessage, serviceComplete;
    Given('a process with a service task', async () => {
      const context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      processInstance.environment.addService('get', get);
      assertMessage = AssertMessage(context, messages, false);

      function get(...args) {
        serviceComplete = args.pop();
      }
    });

    And('the process is subscribed to', () => {
      processInstance.broker.subscribeTmp('event', '#', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let failure, stateChange;
    When('run', () => {
      stateChange = processInstance.getActivityById('service').waitFor('start');
      failure = processInstance.waitFor('leave').catch((err) => err);
      processInstance.run();
    });

    Then('the service task is waiting for service completion', async () => {
      await stateChange;

      assertMessage('activity.start', 'service');
    });

    When('service task completes with error', () => {
      serviceComplete(new Error('ENONENT'));
    });

    Then('the process completes with error', async () => {
      await failure;

      assertMessage('activity.error', 'service');
    });
  });

  Scenario('A process that expects a task execution error to be caught', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow0" sourceRef="start" targetRef="service" />
        <serviceTask id="service" implementation="\${environment.services.get}"/>
        <boundaryEvent id="attached" attachedToRef="service">
          <errorEventDefinition />
        </boundaryEvent>
        <sequenceFlow id="flow1" sourceRef="service" targetRef="end1" />
        <sequenceFlow id="flow2" sourceRef="attached" targetRef="end2" />
        <endEvent id="end1" />
        <endEvent id="end2" />
      </process>
    </definitions>`;

    const messages = [];
    let bp, assertMessage, serviceComplete;
    Given('a process', async () => {
      const context = await testHelpers.context(source);
      bp = context.getProcessById('theProcess');
      bp.environment.addService('get', get);
      assertMessage = AssertMessage(context, messages, false);

      function get(...args) {
        serviceComplete = args.pop();
      }
    });

    And('the activities are subscribed to', () => {
      bp.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let completed, stateChange;
    When('run', () => {
      stateChange = bp.getActivityById('service').waitFor('start');
      completed = bp.waitFor('leave');
      bp.run();
    });

    Then('the service task is waiting for service completion', async () => {
      await stateChange;

      assertMessage('activity.init', 'start');
      assertMessage('activity.enter', 'start');
      assertMessage('activity.start', 'start');
      assertMessage('activity.end', 'start');
      assertMessage('activity.leave', 'start');
      assertMessage('activity.enter', 'service');
      assertMessage('activity.enter', 'attached');
      assertMessage('activity.start', 'attached');
      assertMessage('activity.start', 'service');
    });

    When('service task completes', () => {
      serviceComplete();
    });

    Then('the process completes', async () => {
      await completed;
    });

    And('the service task is completed', () => {
      assertMessage('activity.end', 'service');
    });

    And('the boundary event is discarded', () => {
      assertMessage('activity.leave', 'attached');
    });

    And('boundary event flow is discarded', () => {
      assertMessage('activity.discard', 'end2');
      assertMessage('activity.leave', 'end2');
    });

    And('service task flow is taken', () => {
      assertMessage('activity.end', 'end1');
      assertMessage('activity.leave', 'end1');
      expect(messages.length, 'no more messages').to.equal(0);
    });

    When('run again', () => {
      completed = bp.waitFor('leave');

      stateChange = bp.getActivityById('service').waitFor('start');

      bp.run();
    });

    And('service task has started', async () => {
      await stateChange;

      assertMessage('activity.init', 'start');
      assertMessage('activity.enter', 'start');
      assertMessage('activity.start', 'start');
      assertMessage('activity.end', 'start');
      assertMessage('activity.leave', 'start');
      assertMessage('activity.enter', 'service');
      assertMessage('activity.enter', 'attached');
      assertMessage('activity.start', 'attached');
      assertMessage('activity.start', 'service');
      expect(messages.length, 'no more messages').to.equal(0);
    });

    When('service task is erroneous', () => {
      serviceComplete(new Error('Some error'));
    });

    Then('the process completes', async () => {
      await completed;
    });

    And('the boundary event catches the error', () => {
      assertMessage('activity.catch', 'attached');
    });

    And('the boundary event flow is taken', () => {
      assertMessage('activity.end', 'end2');
    });

    And('the service flows is discarded', () => {
      assertMessage('activity.discard', 'end1');
    });
  });

  Scenario('A process that expects a task execution to be completed within duration', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow0" sourceRef="start" targetRef="service" />
        <serviceTask id="service" implementation="\${environment.services.get}"/>
        <boundaryEvent id="attached" attachedToRef="service">
          <timerEventDefinition>
            <timeDuration xsi:type="tFormalExpression">\${environment.variables.timeout}</timeDuration>
          </timerEventDefinition>
        </boundaryEvent>
        <sequenceFlow id="flow1" sourceRef="service" targetRef="end1" />
        <sequenceFlow id="flow2" sourceRef="attached" targetRef="end2" />
        <endEvent id="end1" />
        <endEvent id="end2" />
      </process>
    </definitions>`;

    const messages = [];
    let processInstance, assertMessage, serviceComplete;
    Given('a process', async () => {
      const context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      processInstance.environment.variables.timeout = 'PT1S';
      processInstance.environment.addService('get', get);
      assertMessage = AssertMessage(context, messages, true);

      function get(...args) {
        serviceComplete = args.pop();
      }
    });

    And('the activities are subscribed to', () => {
      processInstance.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let completed, stateChange;
    When('run', () => {
      stateChange = processInstance.getActivityById('service').waitFor('start');
      completed = processInstance.waitFor('leave');
      processInstance.run();
    });

    Then('the service task is waiting for service completion', async () => {
      await stateChange;

      assertMessage('activity.init', 'start');
      assertMessage('activity.enter', 'start');
      assertMessage('activity.start', 'start');
      assertMessage('activity.end', 'start');
      assertMessage('activity.leave', 'start');
      assertMessage('activity.enter', 'service');
      assertMessage('activity.enter', 'attached');
      assertMessage('activity.start', 'attached');
      assertMessage('activity.timer', 'attached');
      assertMessage('activity.start', 'service');
      expect(messages.length, 'no more messages').to.equal(0);
    });

    When('service task completes', () => {
      serviceComplete();
    });

    Then('the process completes', async () => {
      await completed;
    });

    And('the service task is completed', () => {
      assertMessage('activity.end', 'service');
    });

    And('the boundary event is discarded', () => {
      assertMessage('activity.leave', 'attached');
    });

    And('boundary event flow is discarded', () => {
      assertMessage('activity.discard', 'end2');
      assertMessage('activity.leave', 'end2');
    });

    And('service task flow is taken', () => {
      assertMessage('activity.leave', 'service');
      assertMessage('activity.enter', 'end1');
      assertMessage('activity.start', 'end1');
      assertMessage('activity.end', 'end1');
      assertMessage('activity.leave', 'end1');
      expect(messages.length, 'no more messages').to.equal(0);
    });

    When('run again', () => {
      processInstance.environment.variables.timeout = 'PT0.01S';

      completed = processInstance.waitFor('leave');
      stateChange = processInstance.getActivityById('service').waitFor('start');

      processInstance.run();
    });

    And('service is started', async () => {
      await stateChange;

      assertMessage('activity.init', 'start');
      assertMessage('activity.enter', 'start');
      assertMessage('activity.start', 'start');
      assertMessage('activity.end', 'start');
      assertMessage('activity.leave', 'start');
      assertMessage('activity.enter', 'service');
      assertMessage('activity.enter', 'attached');
      assertMessage('activity.start', 'attached');
      assertMessage('activity.timer', 'attached');
      assertMessage('activity.start', 'service');
    });

    When('the service task fails to complete within duration', () => {
      // No-op
    });

    Then('the process completes', async () => {
      await completed;
    });

    And('the boundary event has timed out', () => {
      assertMessage('activity.timeout', 'attached');
    });

    And('the service task was discarded', () => {
      assertMessage('activity.leave', 'service');
    });

    And('the service task flow was discarded', () => {
      assertMessage('activity.discard', 'end1');
      assertMessage('activity.leave', 'end1');
    });

    And('the boundary event flow was taken', () => {
      assertMessage('activity.end', 'attached');
      assertMessage('activity.leave', 'attached');
      assertMessage('activity.enter', 'end2');
      assertMessage('activity.start', 'end2');
      assertMessage('activity.end', 'end2');
      assertMessage('activity.leave', 'end2');
      expect(messages.length, 'no more messages').to.equal(0);
    });
  });

  Scenario('A process that expects to be notified if task execution is not completed within duration', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow0" sourceRef="start" targetRef="service" />
        <serviceTask id="service" implementation="\${environment.services.get}"/>
        <boundaryEvent id="attached" attachedToRef="service" cancelActivity="false">
          <timerEventDefinition>
            <timeDuration xsi:type="tFormalExpression">\${environment.variables.timeout}</timeDuration>
          </timerEventDefinition>
        </boundaryEvent>
        <sequenceFlow id="flow1" sourceRef="service" targetRef="end1" />
        <sequenceFlow id="flow2" sourceRef="attached" targetRef="end2" />
        <endEvent id="end1" />
        <endEvent id="end2" />
      </process>
    </definitions>`;

    const messages = [];
    let processInstance, assertMessage, serviceComplete;
    Given('a process', async () => {
      const context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      processInstance.environment.variables.timeout = 'PT1S';
      processInstance.environment.addService('get', get);
      assertMessage = AssertMessage(context, messages, false);

      function get(...args) {
        serviceComplete = args.pop();
      }
    });

    And('the activities are subscribed to', () => {
      processInstance.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let completed, stateChange;
    When('run', () => {
      stateChange = processInstance.getActivityById('service').waitFor('start');
      completed = processInstance.waitFor('leave');
      processInstance.run();
    });

    Then('the service task is waiting for service completion', async () => {
      await stateChange;

      assertMessage('activity.enter', 'service');
      assertMessage('activity.enter', 'attached');
      assertMessage('activity.start', 'attached');
      assertMessage('activity.timer', 'attached');
      assertMessage('activity.start', 'service');
    });

    When('service task completes', () => {
      serviceComplete();
    });

    And('the process completes', async () => {
      await completed;
    });

    Then('the service completed', () => {
      assertMessage('activity.end', 'service');
    });

    And('boundary event flow was discarded', () => {
      assertMessage('activity.leave', 'attached');
      assertMessage('activity.discard', 'end2');
      assertMessage('activity.leave', 'end2');
    });

    And('the service task completed', () => {
      assertMessage('activity.leave', 'service');
    });

    And('service task flow was taken', () => {
      assertMessage('activity.enter', 'end1');
      assertMessage('activity.start', 'end1');
      assertMessage('activity.end', 'end1');
      assertMessage('activity.leave', 'end1');
    });

    let timeout;
    When('run again', () => {
      stateChange = processInstance.getActivityById('service').waitFor('start');
      completed = processInstance.waitFor('leave');
      timeout = processInstance.getActivityById('attached').waitFor('timeout');

      processInstance.environment.variables.timeout = 'PT0.1S';

      processInstance.run();
    });

    And('service is started', async () => {
      await stateChange;
    });

    Then('boundary timeout event is waiting', () => {
      assertMessage('activity.enter', 'attached');
      assertMessage('activity.start', 'attached');
      assertMessage('activity.timer', 'attached');
    });

    When('the service task fails to complete within duration', async () => {
      await timeout;
    });

    Then('the boundary event times out and completes', () => {
      assertMessage('activity.timeout', 'attached');
      assertMessage('activity.enter', 'end2');
      assertMessage('activity.start', 'end2');
      assertMessage('activity.end', 'end2');
      assertMessage('activity.leave', 'end2');
    });

    When('the service task completes', () => {
      serviceComplete();
    });

    Then('the process completes', async () => {
      await completed;
    });

    And('the service task flow was taken', () => {
      assertMessage('activity.enter', 'end1');
      assertMessage('activity.start', 'end1');
      assertMessage('activity.end', 'end1');
      assertMessage('activity.leave', 'end1');
    });
  });

  Scenario('A process with a waiting user task is resumed', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow-start" sourceRef="start" targetRef="activity" />
        <userTask id="activity" />
        <sequenceFlow id="flow-end" sourceRef="activity" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    const messages = [];
    let context, processInstance, assertMessage;
    Given('a process with a user task', async () => {
      context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      assertMessage = AssertMessage(context, messages, false);
    });

    And('the activities are subscribed to', () => {
      processInstance.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let waiting;
    When('run', () => {
      waiting = processInstance.getActivityById('activity').waitFor('wait');
      processInstance.run();
    });

    Then('the process is waiting for the user task to be signaled', async () => {
      await waiting;
      assertMessage('activity.wait', 'activity');
    });

    let state;
    When('the process is stopped', () => {
      processInstance.stop();
    });

    And('state is saved', () => {
      state = JSON.parse(JSON.stringify(processInstance.getState()));
    });

    When('process is recovered', () => {
      processInstance = context.clone().getProcessById('theProcess').recover(state);
    });

    Then('state is still the same', () => {
      expect(JSON.parse(JSON.stringify(processInstance.getState()))).to.eql(state);
    });

    When('resuming execution', () => {
      waiting = processInstance.getActivityById('activity').waitFor('wait');
      completed = processInstance.waitFor('leave');
      processInstance.resume();
    });

    let completed;
    And('signaling user task', async () => {
      const task = await waiting;
      task.signal();
    });

    Then('the process completes', () => {
      return completed;
    });
  });

  Scenario('A process that expects a task execution to be completed within duration is stopped and resumed', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow0" sourceRef="start" targetRef="userInput" />
        <userTask id="userInput" />
        <boundaryEvent id="attached" attachedToRef="userInput">
          <timerEventDefinition>
            <timeDuration xsi:type="tFormalExpression">\${environment.variables.timeout}</timeDuration>
          </timerEventDefinition>
        </boundaryEvent>
        <sequenceFlow id="flow1" sourceRef="userInput" targetRef="end1" />
        <sequenceFlow id="flow2" sourceRef="attached" targetRef="end2" />
        <endEvent id="end1" />
        <endEvent id="end2" />
      </process>
    </definitions>`;

    const messages = [];
    let context, processInstance, assertMessage;
    Given('a process', async () => {
      context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      processInstance.environment.variables.timeout = 'PT1S';
      assertMessage = AssertMessage(context, messages, false);
    });

    And('the activities are subscribed to', () => {
      processInstance.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let completed, waiting;
    When('run', () => {
      waiting = processInstance.getActivityById('userInput').waitFor('wait');
      processInstance.run();
    });

    Then('the process is waiting for the user task to be signaled', async () => {
      await waiting;
      assertMessage('activity.wait', 'userInput');
    });

    let state;
    When('the process is stopped', () => {
      processInstance.stop();
    });

    And('state is saved', () => {
      state = JSON.parse(JSON.stringify(processInstance.getState(), null, 2));
    });

    When('process is recovered', () => {
      processInstance = context.clone().getProcessById('theProcess').recover(state);
      processInstance.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    And('resuming execution', () => {
      waiting = processInstance.getActivityById('userInput').waitFor('wait');
      completed = processInstance.waitFor('leave');
      processInstance.resume();
    });

    And('the postponed activities were resumed', async () => {
      assertMessage('activity.timer', 'attached');
      assertMessage('activity.wait', 'userInput');
    });

    When('signaling user task', async () => {
      const task = await waiting;
      task.signal();
    });

    Then('the process completes', () => {
      return completed;
    });

    And('the user task completes', () => {
      assertMessage('activity.end', 'userInput');
    });

    And('the boundary event is discarded', () => {
      assertMessage('activity.leave', 'attached');
    });

    And('boundary event flow were discarded', () => {
      assertMessage('activity.discard', 'end2');
      assertMessage('activity.leave', 'end2');
    });

    And('user task flow were taken', () => {
      assertMessage('activity.leave', 'userInput');
      assertMessage('activity.enter', 'end1');
      assertMessage('activity.start', 'end1');
      assertMessage('activity.end', 'end1');
      assertMessage('activity.leave', 'end1');
      expect(messages.length, 'no more messages').to.equal(0);
    });
  });

  Scenario('Stop and resume', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow0" sourceRef="start" targetRef="activity0" />
        <userTask id="activity0" />
        <sequenceFlow id="flow1" sourceRef="activity0" targetRef="activity1" />
        <intermediateCatchEvent id="activity1">
          <timerEventDefinition>
            <timeDuration xsi:type="tFormalExpression">PT0.01S</timeDuration>
          </timerEventDefinition>
        </intermediateCatchEvent>
        <sequenceFlow id="flow2" sourceRef="activity1" targetRef="activity2" />
        <task id="activity2" />
        <sequenceFlow id="flow3" sourceRef="activity2" targetRef="decision" />
        <exclusiveGateway id="decision" default="flow4" />
        <sequenceFlow id="flow4" sourceRef="decision" targetRef="activity0">
          <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition1}</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="flow5" sourceRef="decision" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    const messages = [];
    let processInstance, assertMessage;
    Given('a process with user task and timer', async () => {
      const context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      assertMessage = AssertMessage(context, messages, true);
    });

    let looped = 0;
    And('the process is subscribed to', () => {
      processInstance.broker.subscribeTmp('event', '#', (routingKey, message) => {
        if (message.content.id === 'activity0' && routingKey === 'activity.discard') {
          ++looped;
          if (looped > 2) throw new Error('Inifinty loop');
        }

        messages.push(message);
      }, {noAck: true});
    });

    let stopTrigger;
    When('run', () => {
      stopTrigger = processInstance.waitFor('wait');
      processInstance.run();
    });

    And('stopped when user task awaits signal', async () => {
      await stopTrigger;
      processInstance.stop();
    });

    Then('the process has the expected execution sequence', () => {
      assertMessage('process.enter');
      assertMessage('process.start');

      assertMessage('activity.init', 'start');
      assertMessage('activity.enter', 'start');
      assertMessage('activity.start', 'start');
      assertMessage('activity.execution.completed', 'start');
      assertMessage('activity.end', 'start');
      assertMessage('flow.pre-flight', 'flow0');
      assertMessage('activity.leave', 'start');

      assertMessage('flow.take', 'flow0');

      assertMessage('activity.enter', 'activity0');
      assertMessage('activity.start', 'activity0');
      assertMessage('activity.wait', 'activity0');
      assertMessage('activity.stop', 'activity0');

      assertMessage('process.stop', 'theProcess');

      expect(messages.length).to.equal(0);
    });

    When('resumed', () => {
      processInstance.resume();
    });

    Then('user task is waiting for signal', () => {
      assertMessage('activity.wait', 'activity0');
      expect(messages.length).to.equal(0);
    });

    let timeout;
    When('signaled', () => {
      timeout = processInstance.waitFor('activity.timeout');

      const postponed = processInstance.getPostponed();
      expect(postponed).to.have.length(1);
      expect(postponed[0]).to.have.property('id', 'activity0');
      postponed[0].signal();
    });

    And('timer times out', () => {
      return timeout;
    });

    Then('process execution is completed', () => {
      assertMessage('activity.execution.completed', 'activity0');
      assertMessage('activity.end', 'activity0');
      assertMessage('flow.pre-flight', 'flow1');
      assertMessage('activity.leave', 'activity0');

      assertMessage('flow.take', 'flow1');

      assertMessage('activity.enter', 'activity1');
      assertMessage('activity.start', 'activity1');
      assertMessage('activity.timer', 'activity1');
      assertMessage('activity.timeout', 'activity1');
      assertMessage('activity.execution.completed', 'activity1');
      assertMessage('activity.end', 'activity1');
      assertMessage('flow.pre-flight', 'flow2');
      assertMessage('activity.leave', 'activity1');

      assertMessage('flow.take', 'flow2');

      assertMessage('activity.enter', 'activity2');
      assertMessage('activity.start', 'activity2');
      assertMessage('activity.execution.completed', 'activity2');
      assertMessage('activity.end', 'activity2');
      assertMessage('flow.pre-flight', 'flow3');
      assertMessage('activity.leave', 'activity2');

      assertMessage('flow.take', 'flow3');

      assertMessage('activity.enter', 'decision');
      assertMessage('activity.start', 'decision');
      assertMessage('activity.execution.completed', 'decision');
      assertMessage('activity.end', 'decision');
      assertMessage('flow.pre-flight', 'flow4');
      assertMessage('flow.pre-flight', 'flow5');
      assertMessage('activity.leave', 'decision');

      assertMessage('flow.discard', 'flow4');

      assertMessage('activity.discard', 'activity0');
      assertMessage('flow.pre-flight', 'flow1');
      assertMessage('activity.leave', 'activity0');

      assertMessage('flow.discard', 'flow1');

      assertMessage('flow.take', 'flow5');

      assertMessage('activity.enter', 'end');
      assertMessage('activity.start', 'end');
      assertMessage('activity.execution.completed', 'end');
      assertMessage('activity.end', 'end');
      assertMessage('activity.leave', 'end');

      assertMessage('activity.discard', 'activity1');

      assertMessage('flow.pre-flight', 'flow2');
      assertMessage('activity.leave', 'activity1');

      assertMessage('flow.discard', 'flow2');

      assertMessage('activity.discard', 'activity2');
      assertMessage('flow.pre-flight', 'flow3');
      assertMessage('activity.leave', 'activity2');

      assertMessage('flow.looped', 'flow3');
      assertMessage('process.end');
      assertMessage('process.leave');

      expect(messages.length).to.equal(0);
    });

    And('no more messages are received', async () => {
      await new Promise((resolve) => process.nextTick(resolve));
      expect(messages.length).to.equal(0);
    });
  });

  Scenario('A process with a sub process with a waiting user task stopped recovered and resumed', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow-start" sourceRef="start" targetRef="activity" />
        <subProcess id="activity">
          <userTask id="subActivity" />
        </subProcess>
        <sequenceFlow id="flow-end" sourceRef="activity" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    const messages = [];
    let context, bp, assertMessage;
    Given('a process with a user task', async () => {
      context = await testHelpers.context(source);
      bp = context.getProcessById('theProcess');
      assertMessage = AssertMessage(context, messages, false);
    });

    And('the activities are subscribed to', () => {
      bp.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let waiting;
    When('run', () => {
      waiting = bp.waitFor('wait');
      bp.run();
    });

    let task;
    Then('the process is waiting for the sub user task to be signaled', async () => {
      task = await waiting;
      expect(task).to.have.property('id', 'subActivity');
      assertMessage('activity.wait', 'subActivity');
    });

    let state;
    When('the process is stopped', () => {
      bp.stop();
    });

    And('state is saved', () => {
      state = JSON.parse(JSON.stringify(bp.getState()));
    });

    Then('sub process and activities are stopped', () => {
      expect(bp.getActivityById('activity')).to.have.property('stopped', true);
      expect(task.owner).to.have.property('stopped', true);
    });

    When('process is recovered', () => {
      bp = context.clone().getProcessById('theProcess').recover(state);
    });

    Then('state is still the same', () => {
      expect(JSON.parse(JSON.stringify(bp.getState()))).to.eql(state);
    });

    When('resuming execution', () => {
      waiting = bp.waitFor('wait');
      completed = bp.waitFor('leave');
      bp.resume();
    });

    let completed;
    And('signaling sub user task', async () => {
      task = await waiting;
      expect(task).to.have.property('id', 'subActivity');
      task.signal();
    });

    Then('the process completes', () => {
      return completed;
    });
  });

  Scenario('A process with boundary event waiting for task', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <task id="task" />
        <sequenceFlow id="toEnd" sourceRef="task" targetRef="end" />
        <boundaryEvent id="bound" attachedToRef="task">
          <timerEventDefinition>
            <timeDuration xsi:type="tFormalExpression">PT1S</timeDuration>
          </timerEventDefinition>
        </boundaryEvent>
        <sequenceFlow id="fromBoundaryEvent" sourceRef="bound" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

    const messages = [];
    let context, processInstance, assertMessage;
    Given('a process with a task and bound timer event both leading to end event', async () => {
      context = await testHelpers.context(source);
      processInstance = context.getProcessById('theProcess');
      assertMessage = AssertMessage(context, messages, true);
    });

    And('the activities are subscribed to', () => {
      processInstance.broker.subscribeTmp('event', '#', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    When('run', () => {
      processInstance.run();
    });

    Then('the task is entered', async () => {
      assertMessage('process.enter');
      assertMessage('process.start');
      assertMessage('activity.init', 'task');
      assertMessage('activity.enter', 'task');
    });

    And('timer is started', async () => {
      assertMessage('activity.enter', 'bound');
      assertMessage('activity.start', 'bound');
      assertMessage('activity.timer', 'bound');
    });

    And('task is started', async () => {
      assertMessage('activity.start', 'task');
    });

    When('task completes execution', () => {
      assertMessage('activity.execution.completed', 'task');
    });

    And('task ends', () => {
      assertMessage('activity.end', 'task');
      assertMessage('flow.pre-flight', 'toEnd');
    });

    And('timer is discarded', () => {
      assertMessage('activity.execution.discard', 'bound');
    });

    And('bound flow is discarded', () => {
      assertMessage('flow.pre-flight', 'fromBoundaryEvent');
      assertMessage('activity.leave', 'bound');
      assertMessage('flow.discard', 'fromBoundaryEvent');
    });

    And('end event is discarded', () => {
      assertMessage('activity.discard', 'end');
      assertMessage('activity.leave', 'end');
    });

    When('task leaves takes flow to end', () => {
      assertMessage('activity.leave', 'task');
      assertMessage('flow.take', 'toEnd');
    });

    Then('end event completes execution', () => {
      assertMessage('activity.enter', 'end');
      assertMessage('activity.start', 'end');
      assertMessage('activity.execution.completed', 'end');
      assertMessage('activity.end', 'end');
      assertMessage('activity.leave', 'end');
    });

    And('process completes', () => {
      assertMessage('process.end');
      assertMessage('process.leave');
    });
  });

  Scenario('Mother of all', () => {
    const messages = [];
    let processInstance, assertMessage;
    Given('a mother of all process with user task, timer, and loop', async () => {
      const context = await testHelpers.context(factory.resource('mother-of-all.bpmn'));
      processInstance = context.getProcessById('motherOfAll');
      assertMessage = AssertMessage(context, messages, false);
    });

    let looped = 0;
    And('the process is subscribed to', () => {
      processInstance.broker.subscribeTmp('event', '#', (routingKey, message) => {
        if (message.content.id === 'userTask1' && routingKey === 'activity.discard') {
          ++looped;
          if (looped > 2) throw new Error('Inifinty loop');
        }

        messages.push(message);
      }, {noAck: true});

      processInstance.broker.subscribeTmp('event', 'process.leave', () => {
        throw new Error('Left too early');
      }, {noAck: true, consumerTag: 'too-early'});
    });

    let waiting;
    When('run', () => {
      waiting = processInstance.waitFor('wait');
      processInstance.run();
    });

    Then('the process waits for user input', async () => {
      await waiting;
      assertMessage('activity.wait', 'userTask1');
      expect(messages.length).to.equal(0);
    });

    let timeout;
    When('user task is signaled', () => {
      timeout = processInstance.waitFor('activity.timeout');

      const postponed = processInstance.getPostponed();
      expect(postponed).to.have.length(1);
      expect(postponed[0]).to.have.property('id', 'userTask1');
      postponed[0].signal();
    });

    And('timer times out', () => {
      return timeout;
    });

    Then('end event is discarded', () => {
      assertMessage('activity.discard', 'theEnd');
    });

    And('process execution is looped back to user task', () => {
      assertMessage('activity.wait', 'userTask1');
    });

    When('user task is signaled again', () => {
      timeout = processInstance.waitFor('activity.timeout');

      processInstance.broker.cancel('too-early');

      const postponed = processInstance.getPostponed();
      expect(postponed).to.have.length(1);
      expect(postponed[0]).to.have.property('id', 'userTask1');
      postponed[0].signal();
    });

    And('timer times out', () => {
      return timeout;
    });

    Then('end event completes', () => {
      assertMessage('activity.end', 'theEnd');
    });

    And('looped flow is discarded', () => {
      assertMessage('flow.discard', 'toLoop');
    });

    And('user task is discarded', () => {
      assertMessage('activity.discard', 'userTask1');
    });

    And('flow loop is detected', () => {
      assertMessage('flow.looped', 'toDecision');
    });

    And('process execution is completed', () => {
      assertMessage('process.end', 'motherOfAll');
      assertMessage('process.leave', 'motherOfAll');
    });

    And('no more messages are received', async () => {
      await new Promise((resolve) => process.nextTick(resolve));
      expect(messages.length).to.equal(0);
    });

    const waits = [];
    Given('signaling waiting activities immediately', () => {
      processInstance.on('wait', (api) => {
        waits.push(api.content.id);

        if (api.id === 'userTask1' && waits.includes('userTask1')) processInstance.broker.cancel('too-early');

        api.signal();
      });
    });

    let left;
    When('process is ran again', () => {
      processInstance.broker.subscribeTmp('event', 'process.leave', () => {
        throw new Error('Left too early');
      }, {noAck: true, consumerTag: 'too-early'});

      left = processInstance.waitFor('leave');
      processInstance.run();
    });

    Then('process completes', () => {
      return left;
    });
  });

  Scenario('Stop and resume Mother of all', () => {
    const messages = [];
    let processInstance, assertMessage;
    Given('a mother of all process with user task, timer, and loop', async () => {
      const context = await testHelpers.context(factory.resource('mother-of-all.bpmn'));
      processInstance = context.getProcessById('motherOfAll');
      assertMessage = AssertMessage(context, messages, false);
    });

    let looped = 0;
    And('the process is subscribed to', () => {
      processInstance.broker.subscribeTmp('event', '#', (routingKey, message) => {
        if (message.content.id === 'userTask1' && routingKey === 'activity.discard') {
          ++looped;
          if (looped > 2) throw new Error('Inifinty loop');
        }

        messages.push(message);
      }, {noAck: true});
    });

    let waiting;
    When('run', () => {
      waiting = processInstance.waitFor('wait');
      processInstance.run();
    });

    Then('the process waits for user input', async () => {
      await waiting;
      assertMessage('activity.wait', 'userTask1');
      expect(messages.length).to.equal(0);
    });

    When('stopped', async () => {
      processInstance.stop();
    });

    Then('the processes is stopped', async () => {
      assertMessage('process.stop');
      expect(processInstance).to.have.property('stopped', true);
    });

    And('all running activities are stopped', async () => {
      const runningActivities = processInstance.getActivities().filter((a) => a.status);
      expect(runningActivities.length).to.be.above(0);
      runningActivities.forEach((a) => {
        expect(a, a.id).to.have.property('stopped', true);
      });
    });

    And('no more messages are received', async () => {
      await new Promise((resolve) => process.nextTick(resolve));
      expect(messages.length).to.equal(0);
    });

    When('resumed', () => {
      waiting = processInstance.waitFor('wait');
      processInstance.resume();
    });

    let timeout;
    And('user task is signaled', () => {
      timeout = processInstance.waitFor('activity.timeout');

      const postponed = processInstance.getPostponed();
      expect(postponed).to.have.length(1);
      expect(postponed[0]).to.have.property('id', 'userTask1');
      postponed[0].signal();
    });

    And('timer times out', () => {
      return timeout;
    });

    Then('process execution is looped back to user task', () => {
      assertMessage('activity.wait', 'userTask1');
    });

    When('user task is signaled again', () => {
      timeout = processInstance.waitFor('activity.timeout');

      const postponed = processInstance.getPostponed();
      expect(postponed).to.have.length(1);
      expect(postponed[0]).to.have.property('id', 'userTask1');
      postponed[0].signal();
    });

    And('timer times out', () => {
      return timeout;
    });

    Then('process execution reaches end event', () => {
      assertMessage('activity.end', 'theEnd');
    });

    And('looped flow is discarded', () => {
      assertMessage('flow.discard', 'toLoop');
    });

    And('user task is discarded', () => {
      assertMessage('activity.discard', 'userTask1');
    });

    And('flow loop is detected', () => {
      assertMessage('flow.looped', 'toDecision');
    });

    And('process execution is completed', () => {
      assertMessage('process.end', 'motherOfAll');
      assertMessage('process.leave', 'motherOfAll');
    });

    And('no more messages are received', async () => {
      await new Promise((resolve) => process.nextTick(resolve));
      expect(messages.length).to.equal(0);
    });
  });
});
