import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';
import Definition from '../../src/definition/Definition';
import camundaBpmnModdle from 'camunda-bpmn-moddle/resources/camunda';

const extensions = {
  camunda: {
    moddleOptions: camundaBpmnModdle,
  },
};

const AssertMessage = testHelpers.AssertMessage;

Feature('Definition', () => {
  Scenario('A definition with one process', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="theDefinition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="activity" name="Start" />
      </process>
    </definitions>`;

    let definition, assertMessage;
    Given('a definition', async () => {
      const context = await testHelpers.context(source);
      definition = Definition(context);
      assertMessage = AssertMessage(definition, messages, true);
    });

    const messages = [];
    And('the definition is subscribed to', () => {
      definition.broker.subscribeTmp('event', '#', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let completed;
    When('run', () => {
      completed = definition.waitFor('leave');
      definition.run();
    });

    And('completed', () => {
      return completed;
    });

    Then('the definition has the expected execution sequence', async () => {
      assertMessage('definition.enter', 'theDefinition');
      assertMessage('definition.start', 'theDefinition');
      assertMessage('process.enter', 'theProcess');
      assertMessage('process.start', 'theProcess');
      assertMessage('activity.enter', 'activity');
      assertMessage('activity.start', 'activity');
      assertMessage('activity.execution.completed', 'activity');
      assertMessage('activity.end', 'activity');
      assertMessage('activity.leave', 'activity');
      assertMessage('process.end', 'theProcess');
      assertMessage('process.leave', 'theProcess');
      assertMessage('definition.end', 'theDefinition');
      assertMessage('definition.leave', 'theDefinition');
      expect(messages).to.have.length(0);
    });
  });

  Scenario('A definition with lanes', () => {
    let definition, assertMessage;
    Given('a definition with lanes and extensions', async () => {
      const context = await testHelpers.context(factory.resource('lanes.bpmn'), {extensions});
      definition = Definition(context, {
        Logger: testHelpers.Logger,
      });
      assertMessage = AssertMessage(definition, messages, true);
    });

    const messages = [];
    And('the definition is subscribed to', () => {
      definition.broker.subscribeTmp('event', '#', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});
    });

    let completed;
    When('run', () => {
      completed = definition.waitFor('leave');
      definition.run();
    });

    And('completed', () => {
      return completed;
    });

    Then('the definition has the expected execution sequence', async () => {
      assertMessage('definition.enter', 'Definitions_1');
      assertMessage('definition.start', 'Definitions_1');

      assertMessage('process.enter', 'mainProcess');
      assertMessage('process.start', 'mainProcess');

      assertMessage('activity.enter', 'mainStartEvent');
      assertMessage('activity.start', 'mainStartEvent');
      assertMessage('activity.execution.completed', 'mainStartEvent');
      assertMessage('activity.end', 'mainStartEvent');
      assertMessage('flow.pre-flight', 'flow1');
      assertMessage('activity.leave', 'mainStartEvent');

      assertMessage('flow.take', 'flow1');

      assertMessage('activity.enter', 'task1');
      assertMessage('activity.start', 'task1');
      assertMessage('activity.execution.completed', 'task1');
      assertMessage('activity.end', 'task1');

      assertMessage('process.enter', 'participantProcess');
      assertMessage('process.start', 'participantProcess');

      assertMessage('activity.enter', 'messageStartEvent');
      assertMessage('activity.start', 'messageStartEvent');
      assertMessage('activity.wait', 'messageStartEvent');
      assertMessage('activity.execution.completed', 'messageStartEvent');
      assertMessage('activity.end', 'messageStartEvent');
      assertMessage('flow.pre-flight', 'flow-p-1');
      assertMessage('activity.leave', 'messageStartEvent');

      assertMessage('flow.take', 'flow-p-1');

      assertMessage('activity.enter', 'otherTask');
      assertMessage('activity.start', 'otherTask');
      assertMessage('activity.execution.completed', 'otherTask');
      assertMessage('activity.end', 'otherTask');
      assertMessage('flow.pre-flight', 'flow-p-2');
      assertMessage('activity.leave', 'otherTask');

      assertMessage('flow.take', 'flow-p-2');

      assertMessage('activity.enter', 'completeTask');
      assertMessage('activity.start', 'completeTask');
      assertMessage('activity.execution.completed', 'completeTask');
      assertMessage('activity.end', 'completeTask');
      assertMessage('flow.pre-flight', 'flow-p-3');
      assertMessage('activity.leave', 'completeTask');

      assertMessage('flow.take', 'flow-p-3');

      assertMessage('activity.enter', 'participantEndEvent');
      assertMessage('activity.start', 'participantEndEvent');
      assertMessage('activity.execution.completed', 'participantEndEvent');
      assertMessage('activity.end', 'participantEndEvent');
      assertMessage('activity.leave', 'participantEndEvent');

      assertMessage('process.end', 'participantProcess');
      assertMessage('process.leave', 'participantProcess');

      assertMessage('flow.pre-flight', 'flow2');
      assertMessage('activity.leave', 'task1');

      assertMessage('flow.take', 'flow2');

      assertMessage('activity.enter', 'intermediate');
      assertMessage('activity.start', 'intermediate');
      assertMessage('activity.execution.completed', 'intermediate');
      assertMessage('activity.end', 'intermediate');
      assertMessage('flow.pre-flight', 'flow3');
      assertMessage('activity.leave', 'intermediate');

      assertMessage('flow.take', 'flow3');

      assertMessage('activity.enter', 'mainEndEvent');
      assertMessage('activity.start', 'mainEndEvent');
      assertMessage('activity.execution.completed', 'mainEndEvent');
      assertMessage('activity.end', 'mainEndEvent');
      assertMessage('activity.leave', 'mainEndEvent');

      assertMessage('process.end', 'mainProcess');
      assertMessage('process.leave', 'mainProcess');
      assertMessage('definition.end', 'Definitions_1');
      assertMessage('definition.leave', 'Definitions_1');

      expect(messages).to.have.length(0);
    });
  });

  Scenario('Stop and resume Mother of all definition', () => {
    let definition, assertMessage;
    const messages = [];

    Given('a definition', async () => {
      const context = await testHelpers.context(factory.resource('mother-of-all.bpmn'), {extensions});
      definition = Definition(context, {
        Logger: testHelpers.Logger,
      });
      assertMessage = AssertMessage(context, messages, false);
    });

    let looped = 0;
    And('the definition is subscribed to', () => {
      definition.broker.subscribeTmp('event', '#', (routingKey, message) => {
        if (message.content.id === 'userTask1' && routingKey === 'activity.discard') {
          ++looped;
          if (looped > 2) throw new Error('Inifinty loop');
        }

        messages.push(message);
      }, {noAck: true});
    });

    When('run', () => {
      definition.run();
    });

    Then('the definition waits user input', () => {
      assertMessage('activity.wait', 'userTask1');
      const postponed = definition.getPostponed();
      expect(postponed).to.have.length(1);
      expect(postponed[0].content).to.have.property('state', 'wait');
    });

    When('stopped', async () => {
      definition.stop();
    });

    let processes;
    Then('no processes are running', async () => {
      processes = definition.getProcesses();
      expect(processes).to.have.length(2);
      expect(processes[0]).to.have.property('stopped', true);
      expect(processes[1]).to.have.property('stopped', undefined);
    });

    And('all running activities are stopped', async () => {
      const runningActivities = processes[0].getActivities().filter((a) => a.status);
      expect(runningActivities.length).to.be.above(0);
      runningActivities.forEach((a) => {
        expect(a, a.id).to.have.property('stopped', true);
      });
    });

    And('no more messages are received', async () => {
      assertMessage('definition.stop');
      await new Promise((resolve) => process.nextTick(resolve));
      expect(messages.length).to.equal(0);
    });

    let leave;
    When('resumed', () => {
      leave = definition.waitFor('leave');
      definition.resume();
    });

    Then('processes are resumed', async () => {
      processes = definition.getProcesses();
      expect(processes).to.have.length(2);
      expect(processes[0]).to.have.property('stopped', false);
      expect(processes[1]).to.have.property('stopped', undefined);
    });

    And('all running activities are resumed', async () => {
      const runningActivities = processes[0].getActivities().filter((a) => a.status);
      expect(runningActivities.length).to.be.above(0);
      runningActivities.forEach((a) => {
        expect(a, a.id).to.have.property('stopped', false);
      });
    });

    When('postponed activity receives user input', () => {
      const postponed = definition.getPostponed();
      expect(postponed).to.have.length(1);
      expect(postponed[0].content).to.have.property('state', 'wait');
      postponed[0].signal();

      definition.on('wait', (api) => {
        api.signal();
      });
    });

    Then('definition completes', () => {
      return leave;
    });
  });

  Scenario('Recover definition', () => {
    let definition;
    Given('a definition with user task, timer event, and loop', async () => {
      const context = await testHelpers.context(factory.resource('mother-of-all.bpmn'), {extensions});
      definition = Definition(context, {
        Logger: testHelpers.Logger,
      });
    });

    When('run', () => {
      definition.run();
    });

    Then('the user task awaits user input', () => {
      const postponed = definition.getPostponed();
      expect(postponed).to.have.length(1);
      expect(postponed[0].content).to.have.property('state', 'wait');
    });

    When('stopped', async () => {
      definition.stop();
    });

    let state;
    And('state is saved', async () => {
      state = JSON.parse(JSON.stringify(definition.getState()));
    });

    let recoveredDefinition;
    Then('new definition can be recovered', async () => {
      const newContext = await testHelpers.context(factory.resource('mother-of-all.bpmn'), {extensions});
      recoveredDefinition = Definition(newContext).recover(state);
    });

    let leave;
    let wait;
    When('resumed', () => {
      wait = recoveredDefinition.waitFor('wait');
      leave = recoveredDefinition.waitFor('leave');
      recoveredDefinition.resume();
    });

    let processes;
    Then('processes are resumed', async () => {
      processes = recoveredDefinition.getProcesses();
      expect(processes).to.have.length(2);
      expect(processes[0]).to.have.property('stopped', false);
      expect(processes[1]).to.have.property('stopped', undefined);
    });

    And('all running activities are resumed', async () => {
      const runningActivities = processes[0].getActivities().filter((a) => a.status);
      expect(runningActivities.length).to.be.above(0);
      runningActivities.forEach((a) => {
        expect(a, a.id).to.have.property('stopped', false);
      });
    });

    And('the user task awaits user input', async () => {
      await wait;

      const [userTask] = recoveredDefinition.getPostponed();
      expect(userTask).to.have.property('id', 'userTask1');
    });

    let timeout;
    When('the user task is signaled', () => {
      wait = recoveredDefinition.waitFor('wait');
      timeout = recoveredDefinition.waitFor('activity.timeout');

      const [userTask] = recoveredDefinition.getPostponed();
      expect(userTask).to.have.property('id', 'userTask1');
      userTask.signal();
    });

    Then('execution continues', () => {
      expect(recoveredDefinition.getPostponed().length).to.be.above(0);
    });

    And('timeout', () => {
      return timeout;
    });

    And('the user task awaits user input again', async () => {
      await wait;

      const [userTask] = recoveredDefinition.getPostponed();
      expect(userTask).to.have.property('id', 'userTask1');
    });

    When('the user task is signaled', () => {
      const [userTask] = recoveredDefinition.getPostponed();
      expect(userTask).to.have.property('id', 'userTask1');
      userTask.signal();
    });

    Then('execution completes', () => {
      return leave;
    });
  });

  Scenario('Two executable processes', () => {
    let assertMessage, definition;
    Given('a definition with user task, timer event, and loop', async () => {
      const context = await testHelpers.context(factory.resource('two-executable-processes.bpmn'), {extensions});
      definition = Definition(context);
      assertMessage = AssertMessage(definition, messages, true);
    });

    const messages = [];
    And('the definition is subscribed to', () => {
      definition.broker.subscribeTmp('event', '#', (routingKey, message) => {
        if (routingKey.indexOf('flow') === 0) return;
        messages.push(message);
      }, {noAck: true});
    });

    let completed;
    When('run', () => {
      completed = definition.waitFor('leave');
      definition.run();
    });

    And('completed', () => {
      return completed;
    });

    Then('the definition has the expected execution sequence', async () => {
      assertMessage('definition.enter', 'theDefinition');
      assertMessage('definition.start', 'theDefinition');

      assertMessage('process.enter', 'Process_1');
      assertMessage('process.start', 'Process_1');
      assertMessage('activity.enter', 'StartEvent_1');
      assertMessage('activity.start', 'StartEvent_1');
      assertMessage('activity.execution.completed', 'StartEvent_1');
      assertMessage('activity.end', 'StartEvent_1');
      assertMessage('activity.leave', 'StartEvent_1');
      assertMessage('activity.enter', 'Task_1');
      assertMessage('activity.start', 'Task_1');
      assertMessage('activity.execution.completed', 'Task_1');
      assertMessage('activity.end', 'Task_1');
      assertMessage('activity.leave', 'Task_1');
      assertMessage('activity.enter', 'EndEvent_1');
      assertMessage('activity.start', 'EndEvent_1');
      assertMessage('activity.execution.completed', 'EndEvent_1');
      assertMessage('activity.end', 'EndEvent_1');
      assertMessage('activity.leave', 'EndEvent_1');
      assertMessage('process.end', 'Process_1');
      assertMessage('process.leave', 'Process_1');

      assertMessage('process.enter', 'Process_2');
      assertMessage('process.start', 'Process_2');
      assertMessage('activity.enter', 'StartEvent_2');
      assertMessage('activity.start', 'StartEvent_2');
      assertMessage('activity.execution.completed', 'StartEvent_2');
      assertMessage('activity.end', 'StartEvent_2');
      assertMessage('activity.leave', 'StartEvent_2');
      assertMessage('activity.enter', 'Task_2');
      assertMessage('activity.start', 'Task_2');
      assertMessage('activity.execution.completed', 'Task_2');
      assertMessage('activity.end', 'Task_2');
      assertMessage('activity.leave', 'Task_2');
      assertMessage('activity.enter', 'EndEvent_2');
      assertMessage('activity.start', 'EndEvent_2');
      assertMessage('activity.execution.completed', 'EndEvent_2');
      assertMessage('activity.end', 'EndEvent_2');
      assertMessage('activity.leave', 'EndEvent_2');
      assertMessage('process.end', 'Process_2');
      assertMessage('process.leave', 'Process_2');

      assertMessage('definition.end', 'theDefinition');
      assertMessage('definition.leave', 'theDefinition');
      expect(messages).to.have.length(0);
    });
  });
});
