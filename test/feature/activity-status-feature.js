import ck from 'chronokinesis';
import Definition from '../../src/definition/Definition.js';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';
import camunda from '../resources/extensions/CamundaExtension.js';
import { BpmnError } from '../../src/error/Errors.js';

const waitingSource = factory.resource('wait-activities.bpmn');
const escalationSource = factory.resource('escalation.bpmn');
const transactionSource = factory.resource('transaction.bpmn');

Feature('Activity status', () => {
  after(ck.reset);

  Scenario('A source with waiting activities', () => {
    let definition, end;
    const serviceCalls = [];
    const options = {
      settings: {
        enableDummyService: false,
      },
      services: {
        longRunning(...args) {
          serviceCalls.push(args);
        },
      },
      extensions: {
        camunda: camunda.extension,
      },
    };

    Given('a source with activities waiting for input', async () => {
      const context = await testHelpers.context(waitingSource, { extensions: { camunda } });
      definition = new Definition(context, options);
    });

    And('definition and process status is idle before run', () => {
      expect(definition.activityStatus).to.equal('idle');
      expect(definition.getProcesses()[0].activityStatus).to.equal('idle');
    });

    When('definition is ran', () => {
      definition.run();
    });

    let postponed;
    Then('definition is running user task with attached boundary event', () => {
      postponed = definition.getPostponed();
      expect(postponed[0].content).to.have.property('id', 'utask1error');
      expect(postponed[1].content).to.have.property('id', 'utask1');
    });

    And('definition and process activity status is wait', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    When('user task is signaled', () => {
      postponed[1].signal('Yes');
    });

    Then('definition is running service task', () => {
      expect(serviceCalls).to.have.length(1);
    });

    And('definition and process activity status is executing', () => {
      expect(definition.activityStatus).to.equal('executing');
      expect(definition.execution.processes[0].activityStatus).to.equal('executing');
    });

    When('service task completes', () => {
      serviceCalls.pop().pop()();
    });

    Then('definition is running parallel multi-instance user task with attached boundary event', () => {
      postponed = definition.getPostponed();
      expect(postponed).to.have.length(2);
      expect(postponed[0].content).to.have.property('id', 'utask2cond');
      expect(postponed[1].content).to.have.property('id', 'utask2');
    });

    And('definition and process activity status is waiting', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    When('user task iteration is signaled', () => {
      postponed[1].owner.execution.getPostponed()[0].signal('Yes');
    });

    Then('definition is still running parallel multi-instance user task with attached boundary event', () => {
      postponed = definition.getPostponed();
      expect(postponed).to.have.length(2);
      expect(postponed[0].content).to.have.property('id', 'utask2cond');
      expect(postponed[1].content).to.have.property('id', 'utask2');
    });

    And('definition and process activity status is waiting', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    When('parallel user task iterations are signaled', () => {
      const iterations = postponed[1].owner.execution.getPostponed();
      for (const iter of iterations) iter.signal('Yes');
    });

    Then('definition is running sequential multi-instance user task', () => {
      postponed = definition.getPostponed();
      expect(postponed).to.have.length(1);
      expect(postponed[0].content).to.have.property('id', 'utask3');
    });

    And('definition and process activity status is waiting', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    When('user task iteration is signaled', () => {
      postponed[0].getExecuting()[0].signal('Yes');
    });

    Then('definition is still running sequential multi-instance user task', () => {
      postponed = definition.getPostponed();
      expect(postponed).to.have.length(1);
      expect(postponed[0].content).to.have.property('id', 'utask3');
    });

    And('definition and process activity status is waiting', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    When('sequential user task iterations are signaled', () => {
      postponed[0].getExecuting()[0].signal('Yes');
      postponed[0].getExecuting()[0].signal('Yes');
    });

    Then('definition is running receive task with non-interrupting attached timer event', () => {
      postponed = definition.getPostponed();
      expect(postponed).to.have.length(2);
      expect(postponed[0].content).to.have.property('id', 'rtasktimer');
      expect(postponed[1].content).to.have.property('id', 'rtask');
    });

    And('definition and process activity status is timer', () => {
      expect(definition.activityStatus).to.equal('timer');
      expect(definition.execution.processes[0].activityStatus).to.equal('timer');
    });

    When('non-interrupting timer times out', () => {
      const [timer] = definition.environment.timers.executing;
      timer.callback();
    });

    Then('definition is still running receive task', () => {
      postponed = definition.getPostponed();
      expect(postponed).to.have.length(1);
      expect(postponed[0].content).to.have.property('id', 'rtask');
    });

    And('definition and process activity status is waiting', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    When('receive task is signaled', () => {
      postponed[0].signal('Yes');
    });

    Then('definition is running message catch event', () => {
      postponed = definition.getPostponed();
      expect(postponed).to.have.length(1);
      expect(postponed[0].content).to.have.property('id', 'mevent');
    });

    And('definition and process activity status is waiting', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    When('message event is signaled', () => {
      postponed[0].signal('Yes');
    });

    Then('definition is running event based gateway and subsequent timer and signal event', () => {
      postponed = definition.getPostponed();
      expect(
        postponed,
        postponed.map(({ id }) => id)
      ).to.have.length(3);
      expect(postponed[0].content).to.have.property('id', 'eventgateway');
      expect(postponed[1].content).to.have.property('id', 'tevent');
      expect(postponed[2].content).to.have.property('id', 'sevent');
    });

    And('definition and process activity status is timer', () => {
      expect(definition.activityStatus).to.equal('timer');
      expect(definition.execution.processes[0].activityStatus).to.equal('timer');
    });

    When('signal event is signaled', () => {
      postponed[2].signal('Yes');
    });

    Then('definition is running parallel user tasks', () => {
      postponed = definition.getPostponed();
      expect(
        postponed.length,
        postponed.map(({ id }) => id)
      ).to.be.above(1);
      expect(postponed[0].content).to.have.property('id', 'utask4');
      expect(postponed[1].content).to.have.property('id', 'utask5');
    });

    And('definition and process activity status is idle', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    When('first user task is signaled', () => {
      postponed[1].signal('Yes');
    });

    Then('definition is running second user task and parallel join', () => {
      postponed = definition.getPostponed();
      expect(
        postponed.length,
        postponed.map(({ id }) => id)
      ).to.be.above(0);
      expect(postponed[0].content).to.have.property('id', 'utask4');
    });

    And('definition and process activity status is wait', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    When('second user task is signaled', () => {
      postponed[0].signal('Yes');
    });

    Then('definition is running sub process with monitor escalation and subsequent manual task', () => {
      postponed = definition.getPostponed();
      expect(
        postponed.length,
        postponed.map(({ id }) => id)
      ).to.be.above(0);
      expect(postponed[0].content).to.have.property('id', 'tell');
      expect(postponed[1].content).to.have.property('id', 'sub');

      postponed = postponed[1].getPostponed();
      expect(
        postponed.length,
        postponed.map(({ id }) => id)
      ).to.be.above(0);
      expect(postponed[1].content).to.have.property('id', 'mtask');
    });

    And('definition and process activity status is wait', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    When('second user task is signaled', () => {
      end = definition.waitFor('end');
      postponed[1].signal('Yes');
    });

    Then('definition completes', () => {
      return end;
    });

    And('definition and process activity status is idle', () => {
      expect(definition.activityStatus).to.equal('idle');
      expect(definition.execution.processes[0].activityStatus).to.equal('idle');
    });
  });

  Scenario('two executing processes', () => {
    let context, definition, end;
    const serviceCalls = [];
    const options = {
      settings: {
        enableDummyService: false,
      },
      services: {
        longRunning(...args) {
          serviceCalls.push(args);
        },
      },
    };

    When('definition with two executing processes', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="theDefinition" name="Definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp1" isExecutable="true">
          <serviceTask id="service1" implementation="\${environment.services.longRunning}" />
          <sequenceFlow id="to-timer" sourceRef="service1" targetRef="timer" />
          <intermediateThrowEvent id="timer">
            <timerEventDefinition>
              <timeCycle xsi:type="tFormalExpression">PT5S</timeCycle>
            </timerEventDefinition>
          </intermediateThrowEvent>
        </process>
        <process id="bp2" isExecutable="true">
          <userTask id="utask1" />
          <sequenceFlow id="to-service1" sourceRef="utask1" targetRef="service2" />
          <serviceTask id="service2" implementation="\${environment.services.longRunning}" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source, { extensions: { camunda } });
      definition = new Definition(context, options);
    });

    When('definition is ran', () => {
      definition.run();
    });

    let postponed;
    Then('definition is executing', () => {
      expect(definition.activityStatus).to.equal('executing');

      postponed = definition.getPostponed();
      expect(
        postponed.length,
        postponed.map(({ id }) => id)
      ).to.equal(2);
      expect(postponed[0].content).to.have.property('id', 'service1');
      expect(postponed[1].content).to.have.property('id', 'utask1');
    });

    And('first process activity status is executing and second is wait', () => {
      expect(definition.execution.processes[0].activityStatus).to.equal('executing');
      expect(definition.execution.processes[1].activityStatus).to.equal('wait');
    });

    When('service task completes', () => {
      serviceCalls.pop().pop()();
    });

    Then('definition is timer', () => {
      expect(definition.activityStatus).to.equal('timer');

      postponed = definition.getPostponed();
      expect(
        postponed.length,
        postponed.map(({ id }) => id)
      ).to.equal(2);
      expect(postponed[0].content).to.have.property('id', 'timer');
      expect(postponed[1].content).to.have.property('id', 'utask1');
    });

    And('first process activity status is wait and second is timer', () => {
      expect(definition.execution.processes[0].activityStatus).to.equal('timer');
      expect(definition.execution.processes[1].activityStatus).to.equal('wait');
    });

    When('user task is signaled', () => {
      postponed[1].signal();
    });

    Then('definition is executing since service task is running', () => {
      expect(definition.activityStatus).to.equal('executing');

      postponed = definition.getPostponed();
      expect(
        postponed.length,
        postponed.map(({ id }) => id)
      ).to.equal(2);
      expect(postponed[0].content).to.have.property('id', 'timer');
      expect(postponed[1].content).to.have.property('id', 'service2');
    });

    And('first process activity status is executing and second is still timer', () => {
      expect(definition.execution.processes[0].activityStatus).to.equal('timer');
      expect(definition.execution.processes[1].activityStatus).to.equal('executing');
    });

    When('service task completes', () => {
      serviceCalls.pop().pop()();
    });

    Then('definition is timer', () => {
      expect(definition.activityStatus).to.equal('timer');

      postponed = definition.getPostponed();
      expect(
        postponed.length,
        postponed.map(({ id }) => id)
      ).to.equal(1);
      expect(postponed[0].content).to.have.property('id', 'timer');
    });

    And('first process activity status is still timer and second idle', () => {
      expect(definition.execution.processes[0].activityStatus).to.equal('timer');
      expect(definition.execution.processes[1].activityStatus).to.equal('idle');
    });

    When('timer times out', () => {
      end = definition.waitFor('end');
      const [timer] = definition.environment.timers.executing;
      timer.callback();
      return end;
    });

    Then('definition completes and is idle', () => {
      expect(definition.activityStatus).to.equal('idle');
    });

    And('first and second process activity status is idle', () => {
      expect(definition.execution.processes[0].activityStatus).to.equal('idle');
      expect(definition.execution.processes[1].activityStatus).to.equal('idle');
    });

    When('definition is ran again', () => {
      definition = new Definition(context.clone(), options);
      definition.run();
    });

    Then('definition is executing', () => {
      expect(definition.activityStatus).to.equal('executing');
    });

    And('first process is executing and second wait', () => {
      expect(definition.execution.processes[0].activityStatus).to.equal('executing');
      expect(definition.execution.processes[1].activityStatus).to.equal('wait');
    });

    let state;
    When('definition is stopped', () => {
      state = definition.getState();
      definition.stop();
    });

    Then('definition is still executing', () => {
      expect(definition.activityStatus).to.equal('executing');
    });

    And('stopped processes keep activity status', () => {
      expect(definition.execution.processes[0].activityStatus).to.equal('executing');
      expect(definition.execution.processes[1].activityStatus).to.equal('wait');
    });

    When('definition is resumed', () => {
      definition.resume();
    });

    Then('definition is still executing', () => {
      expect(definition.activityStatus).to.equal('executing');
    });

    And('resumed processes keep activity status', () => {
      expect(definition.execution.processes[0].activityStatus).to.equal('executing');
      expect(definition.execution.processes[1].activityStatus).to.equal('wait');
    });

    When('definition is recovered and resumed', () => {
      definition.stop();
      definition = new Definition(context.clone(), options);
      definition.recover(state);
      definition.resume();
    });

    Then('definition is still executing', () => {
      expect(definition.activityStatus).to.equal('executing');
    });

    And('resumed processes keep activity status', () => {
      expect(definition.execution.processes[0].activityStatus).to.equal('executing');
      expect(definition.execution.processes[1].activityStatus).to.equal('wait');
    });

    When('first process service completes', () => {
      serviceCalls.pop().pop()();
    });

    Then('definition activty status is timer', () => {
      expect(definition.activityStatus).to.equal('timer');
    });

    When('definition is recovered and resumed again', () => {
      definition.stop();
      state = definition.getState();

      definition = new Definition(context.clone(), options);
      definition.recover(state);
      definition.resume();
    });

    Then('definition activity status is still timer', () => {
      expect(definition.activityStatus).to.equal('timer');
    });

    And('first process is still timer and second is wait', () => {
      expect(definition.execution.processes[0].activityStatus).to.equal('timer');
      expect(definition.execution.processes[1].activityStatus).to.equal('wait');
    });

    When('timer times out', () => {
      const [timer] = definition.environment.timers.executing;
      timer.callback();
    });

    Then('definition activity status changes to wait', () => {
      expect(definition.activityStatus).to.equal('wait');
    });

    And('first process activity status is still idle and second is wait', () => {
      expect(definition.execution.processes[0].activityStatus).to.equal('idle');
      expect(definition.execution.processes[1].activityStatus).to.equal('wait');
    });

    When('definition is recovered and resumed again', () => {
      definition.stop();
      state = definition.getState();

      definition = new Definition(context.clone(), options);
      definition.recover(state);
      definition.resume();
    });

    Then('definition activity status stays wait', () => {
      expect(definition.activityStatus).to.equal('wait');
    });

    And('first process activity status is still idle and second is wait', () => {
      expect(definition.execution.processes[0].activityStatus).to.equal('idle');
      expect(definition.execution.processes[1].activityStatus).to.equal('wait');
    });

    When('user task is signaled', () => {
      definition.signal({ id: 'utask1' });
    });

    And('succeeding service task completes', () => {
      end = definition.waitFor('end');
      serviceCalls.pop().pop()();
    });

    Then('run completes and definition activity status is idle', async () => {
      await end;
      expect(definition.activityStatus).to.equal('idle');
    });

    And('processes activity status is idle', () => {
      expect(definition.execution.processes[0].activityStatus).to.equal('idle');
      expect(definition.execution.processes[1].activityStatus).to.equal('idle');
    });
  });

  Scenario('Sub processes', () => {
    let context, definition;
    const serviceCalls = [];
    const options = {
      settings: {
        enableDummyService: false,
      },
      services: {
        longRunning(...args) {
          serviceCalls.push(args);
        },
      },
    };

    When('definition with three sub processes, second is sequential multi-instance, third is parallel multi-instance', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="theDefinition" name="Definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <subProcess id="sub1">
            <intermediateThrowEvent id="timer">
              <timerEventDefinition>
                <timeCycle xsi:type="tFormalExpression">PT5S</timeCycle>
              </timerEventDefinition>
            </intermediateThrowEvent>
          </subProcess>
          <sequenceFlow id="to-sub2" sourceRef="sub1" targetRef="sub2" />
          <subProcess id="sub2">
            <bpmn:multiInstanceLoopCharacteristics isSequential="true">
              <bpmn:loopCardinality xsi:type="bpmn:tFormalExpression">3</bpmn:loopCardinality>
            </bpmn:multiInstanceLoopCharacteristics>
            <userTask id="utask1" />
          </subProcess>
          <sequenceFlow id="to-sub3" sourceRef="sub2" targetRef="sub3" />
          <subProcess id="sub3">
            <bpmn:multiInstanceLoopCharacteristics isSequential="false">
              <bpmn:loopCardinality xsi:type="bpmn:tFormalExpression">3</bpmn:loopCardinality>
            </bpmn:multiInstanceLoopCharacteristics>
            <serviceTask id="service1" implementation="\${environment.services.longRunning}" />
            <sequenceFlow id="to-utask2" sourceRef="service1" targetRef="utask2" />
            <userTask id="utask2" />
          </subProcess>
        </process>
      </definitions>`;

      context = await testHelpers.context(source, { extensions: { camunda } });
      definition = new Definition(context, options);
    });

    When('definition is ran', () => {
      definition.run();
    });

    Then('definition and process activity status is timer', () => {
      expect(definition.activityStatus).to.equal('timer');
      expect(definition.execution.processes[0].activityStatus).to.equal('timer');
    });

    When('service task completes', () => {
      const [timer] = definition.environment.timers.executing;
      timer.callback();
    });

    Then('second sequential multi-instance process is waiting for user task', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    When('first multi-instance user task is signaled', () => {
      definition.signal({ id: 'utask1' });
    });

    Then('second sequential multi-instance process is still waiting for user task', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    When('second multi-instance user task is signaled', () => {
      definition.signal({ id: 'utask1' });
    });

    Then('second sequential multi-instance process is still waiting for user task', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    When('third and last multi-instance user task is signaled', () => {
      definition.signal({ id: 'utask1' });
    });

    let postponed;
    Then('parallel multi-instance process is executing service task', () => {
      postponed = definition.getPostponed();
      expect(postponed[0]).to.have.property('id', 'sub3');

      expect(definition.activityStatus).to.equal('executing');
      expect(definition.execution.processes[0].activityStatus).to.equal('executing');
    });

    When('first iteration service task completes', () => {
      serviceCalls.shift().pop()();
    });

    Then('activity status is still executing', () => {
      expect(definition.activityStatus).to.equal('executing');
      expect(definition.execution.processes[0].activityStatus).to.equal('executing');
    });
  });

  Scenario('a process with escalation events', () => {
    let context, definition;
    Given('a subprocess that escalates with signal if order amount is greater than treshold', async () => {
      context = await testHelpers.context(escalationSource, {
        extensions: { camunda },
      });
      definition = new Definition(context, {
        services: {
          isAbove(treshold, value) {
            return parseInt(treshold) < parseInt(value);
          },
        },
      });
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('activity status is wait', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    When('definition is signaled to complete process', () => {
      definition.signal({
        id: 'order',
        form: {
          amount: 11,
        },
      });
    });

    Then('run completes and activity status is idle', async () => {
      await end;
      expect(definition.activityStatus).to.equal('idle');
      expect(definition.execution.processes[0].activityStatus).to.equal('idle');
    });
  });

  Scenario('a process with transaction', () => {
    let context, definition;
    const undoService = [];
    Given('a transaction with compensation and a cancel boundary event', async () => {
      context = await testHelpers.context(transactionSource);
      definition = new Definition(context, {
        settings: { enableDummyService: false },
        services: {
          compare(answer, str) {
            return answer.message === str;
          },
          compensate(...args) {
            undoService.push(args);
          },
        },
        extensions: {
          me({ broker, environment }) {
            broker.subscribeTmp(
              'event',
              'activity.end',
              (_, { content }) => {
                if ('output' in content) environment.output[content.id] = content.output;
              },
              { noAck: true, consumerTag: 'save-output-tag' }
            );
          },
        },
      });
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('activity status is wait', () => {
      expect(definition.activityStatus).to.equal('wait');
    });

    When('user decides to cancel', async () => {
      const transaction = definition.getPostponed((e) => e.id === 'atomic')[0];
      expect(transaction).to.have.property('id', 'atomic');

      const userTask = transaction.getPostponed().pop();

      expect(transaction.content).to.have.property('isTransaction', true);

      expect(userTask).to.have.property('id', 'areUSure');
      userTask.signal({ message: 'No' });

      await new Promise((resolve) => process.nextTick(resolve));
      definition.signal({ id: 'areUSure', message: 'No' });
    });

    Then('compensation service is waiting for callback', () => {
      expect(undoService).to.have.length(1);
    });

    And('activity status is executing', () => {
      expect(definition.activityStatus).to.equal('executing');
    });

    When('compensation service completes', () => {
      undoService.pop().pop()();
    });

    Then('run completes', () => {
      return end;
    });
  });

  Scenario('a process with two shaken start events', () => {
    let definition;
    Given('two start events, both waiting for a message and both ending with the same end event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="messageProcess" isExecutable="true">
          <startEvent id="start1">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <startEvent id="start2">
            <messageEventDefinition messageRef="Message2" />
          </startEvent>
          <sequenceFlow id="from12end" sourceRef="start1" targetRef="end" />
          <sequenceFlow id="from22end" sourceRef="start2" targetRef="end" />
          <endEvent id="end" />
        </process>
        <message id="Message1" name="Start by name" />
        <message id="Message2" name="Start by me" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran', () => {
      definition.run();
    });

    Then('both definition and process are waiting', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    When('definition is shook while running', () => {
      definition.shake();
    });

    Then('both definition and process are still waiting', () => {
      expect(definition.activityStatus).to.equal('wait');
      expect(definition.execution.processes[0].activityStatus).to.equal('wait');
    });

    let end;
    When('first start event is messaged', () => {
      end = definition.waitFor('end');
      definition.signal({ id: 'Message1' });
    });

    Then('run completes and activity status is idle', async () => {
      await end;
      expect(definition.activityStatus).to.equal('idle');
      expect(definition.execution.processes[0].activityStatus).to.equal('idle');
    });
  });

  Scenario('a process with three timer events', () => {
    after(ck.reset);

    let definition;
    Given('three timers', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="timerProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-timer1" sourceRef="start" targetRef="timer1" />
          <sequenceFlow id="to-timer2" sourceRef="start" targetRef="timer2" />
          <sequenceFlow id="to-timer3" sourceRef="start" targetRef="timer3" />
          <intermediateThrowEvent id="timer1">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT1M</timeDuration>
            </timerEventDefinition>
          </intermediateThrowEvent>
          <intermediateThrowEvent id="timer2">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT1M</timeDuration>
            </timerEventDefinition>
          </intermediateThrowEvent>
          <intermediateThrowEvent id="timer3">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT2M</timeDuration>
            </timerEventDefinition>
          </intermediateThrowEvent>
          <sequenceFlow id="from-timer1" sourceRef="timer1" targetRef="end" />
          <sequenceFlow id="from-timer2" sourceRef="timer2" targetRef="end" />
          <sequenceFlow id="from-timer3" sourceRef="timer3" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran', () => {
      ck.freeze();
      definition.run();
    });

    Then('both definition and process are timer', () => {
      expect(definition.activityStatus).to.equal('timer');
      expect(definition.execution.processes[0].activityStatus).to.equal('timer');
    });

    When('first timer expires', () => {
      const [timer] = definition.environment.timers.executing;
      timer.callback();
    });

    Then('both definition and process are still timer', () => {
      expect(definition.activityStatus).to.equal('timer');
      expect(definition.execution.processes[0].activityStatus).to.equal('timer');
    });

    When('second timer expires', () => {
      const [timer] = definition.environment.timers.executing;
      timer.callback();
    });

    Then('both definition and process are still timer', () => {
      expect(definition.activityStatus).to.equal('timer');
      expect(definition.execution.processes[0].activityStatus).to.equal('timer');
    });

    let end;
    When('second timer expires', () => {
      end = definition.waitFor('end');
      const [timer] = definition.environment.timers.executing;
      timer.callback();
    });

    Then('run completes and activity status is idle', async () => {
      await end;
      expect(definition.activityStatus).to.equal('idle');
      expect(definition.execution.processes[0].activityStatus).to.equal('idle');
    });
  });

  Scenario('error is thrown', () => {
    let context, definition;
    Given('a source with a service task', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="messageProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-service" sourceRef="start" targetRef="service" />
          <serviceTask id="service" implementation="\${environment.services.tjanst}" />
          <boundaryEvent id="catchError" attachedToRef="service">
            <errorEventDefinition errorRef="Error_0" />
          </boundaryEvent>
          <sequenceFlow id="to-end" sourceRef="service" targetRef="end" />
          <endEvent id="end" />
        </process>
        <error id="Error_0" errorCode="404" />
      </definitions>`;

      context = await testHelpers.context(source);
    });

    let errored;
    When('definition is ran without service function', () => {
      definition = new Definition(context.clone(), { settings: { enableDummyService: false } });
      errored = definition.waitFor('error');
      definition.run();
    });

    Then('definition is errored and activity status is idle', async () => {
      await errored;
      expect(definition.activityStatus).to.equal('idle');
    });

    const serviceCalls = [];
    When('definition is ran strict with service function', () => {
      definition = new Definition(context.clone(), {
        settings: { strict: true },
        services: {
          tjanst(...args) {
            serviceCalls.push(args);
          },
        },
      });
      definition.run();
    });

    Then('activity status is executing', () => {
      expect(definition.activityStatus).to.equal('executing');
    });

    When('service calls callback with error', () => {
      errored = definition.waitFor('error');
      serviceCalls.pop().pop()(new Error('No service'));
    });

    Then('definition is errored and activity status is still executing since error was not caught', async () => {
      await errored;
      expect(definition.activityStatus).to.equal('executing');
    });

    When('definition is ran non-strict', () => {
      definition = new Definition(context.clone(), {
        settings: { strict: false },
        services: {
          tjanst(...args) {
            serviceCalls.push(args);
          },
        },
      });
      definition.run();
    });

    Then('activity status is executing', () => {
      expect(definition.activityStatus).to.equal('executing');
    });

    let end;
    When('service calls callback with error', () => {
      end = definition.waitFor('end');
      serviceCalls.pop().pop()(
        new BpmnError('Not found', {
          errorCode: 404,
        })
      );
    });

    Then('definition completes since error was caught', async () => {
      await end;
      expect(definition.activityStatus).to.equal('idle');
    });
  });
});
