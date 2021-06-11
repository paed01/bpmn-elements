import factory from '../helpers/factory';
import JsExtension from '../resources/extensions/JsExtension';
import SignalTask from '../../src/tasks/SignalTask';
import SubProcess from '../../src/tasks/SubProcess';
import testHelpers from '../helpers/testHelpers';
import {BpmnError} from '../../src/error/Errors';

const subProcessSource = factory.resource('sub-process.bpmn');

describe('SubProcess', () => {
  it('decorates activity with isSubProcess', () => {
    const subProcess = SubProcess({id: 'sub-process', parent: {id: 'process1'}}, testHelpers.emptyContext());
    expect(subProcess).to.have.property('isSubProcess', true);
  });

  it('runs process execution on separate exchange', () => {
    const subProcess = SubProcess({id: 'sub-process', parent: {id: 'process1'}}, testHelpers.emptyContext());
    subProcess.run();
    expect(subProcess.broker.getExchange('subprocess-execution')).to.be.ok;
  });

  describe('run()', () => {
    let context;
    beforeEach(async () => {
      context = await testHelpers.context(subProcessSource);
    });

    it('initiates process execution with a cloned environment', async () => {
      const subProcess = context.getActivityById('subProcess');
      context.environment.variables.root = 1;

      const wait = subProcess.waitFor('wait');
      subProcess.run();

      await wait;

      const environment = subProcess.execution.source.execution.environment;
      expect(environment).to.be.ok;
      expect(environment).to.have.property('variables');
      expect(context.environment === environment, 'cloned env').to.be.false;
    });

    it('sub process children are initiated with process execution environment', async () => {
      const subProcess = context.getActivityById('subProcess');
      context.environment.variables.root = 1;

      const wait = subProcess.waitFor('wait');
      subProcess.run();

      await wait;

      const executionEnvironment = subProcess.execution.source.execution.environment;
      const child = subProcess.execution.source.execution.getActivityById('subUserTask');

      expect(child.environment === executionEnvironment).to.be.true;
    });

    it('sub process execution assigns execute message to environment variables', async () => {
      const subProcess = context.getActivityById('subProcess');
      context.environment.variables.root = 1;

      const wait = subProcess.waitFor('wait');
      subProcess.run();

      await wait;

      const environment = subProcess.execution.source.execution.environment;
      expect(environment).to.have.property('variables');
      expect(environment.variables).to.have.property('fields').with.property('routingKey', 'execute.start');
      expect(environment.variables).to.have.property('content').with.property('id', 'subProcess');
      expect(environment.variables).to.have.property('properties').with.property('messageId');
    });

    it('publishes child activities events', async () => {
      const subProcess = context.getActivityById('subProcess');
      subProcess.activate();

      const messages = [];
      const assertMessage = AssertMessage(subProcess, messages);
      subProcess.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});

      const completed = subProcess.waitFor('leave', (_, a) => a.content.id === 'subProcess');

      subProcess.once('wait', (activityApi) => {
        expect(activityApi.type).to.equal('bpmn:UserTask');
        activityApi.signal();
      });

      subProcess.run();

      await completed;

      assertMessage('activity.enter', 'subProcess');
      assertMessage('activity.start', 'subProcess');

      assertMessage('activity.init', 'subUserTask');
      assertMessage('activity.enter', 'subUserTask');
      assertMessage('activity.start', 'subUserTask');
      assertMessage('activity.wait', 'subUserTask');
      assertMessage('activity.end', 'subUserTask');
      assertMessage('activity.enter', 'subScriptTask');
      assertMessage('activity.start', 'subScriptTask');
      assertMessage('activity.end', 'subScriptTask');
      assertMessage('activity.leave', 'subScriptTask');
      assertMessage('activity.leave', 'subUserTask');

      assertMessage('activity.end', 'subProcess');
      assertMessage('activity.leave', 'subProcess');

      expect(messages.length).to.equal(0);
    });

    it('discarded child activity still completes sub process', async () => {
      const subProcess = context.getActivityById('subProcess');
      subProcess.activate();

      const messages = [];
      const assertMessage = AssertMessage(subProcess, messages);
      subProcess.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});

      const completed = subProcess.waitFor('leave', (_, a) => a.content.id === 'subProcess');
      subProcess.once('wait', (activityApi) => {
        activityApi.discard();
      });

      subProcess.run();

      await completed;

      assertMessage('activity.enter', 'subProcess');
      assertMessage('activity.start', 'subProcess');
      assertMessage('activity.init', 'subUserTask');
      assertMessage('activity.enter', 'subUserTask');
      assertMessage('activity.start', 'subUserTask');
      assertMessage('activity.wait', 'subUserTask');
      assertMessage('activity.discard', 'subScriptTask');
      assertMessage('activity.leave', 'subScriptTask');
      assertMessage('activity.leave', 'subUserTask');
      assertMessage('activity.end', 'subProcess');
      assertMessage('activity.leave', 'subProcess');
    });

    it('publishes leave message when completed', async () => {
      const subProcess = context.getActivityById('subProcess');
      const leave = subProcess.waitFor('leave', (_, a) => a.content.id === 'subProcess');

      subProcess.once('wait', (api) => {
        api.signal();
      });

      subProcess.run();

      const left = await leave;

      expect(left.content).to.have.property('id', 'subProcess');
      expect(left.content).to.have.property('parent').with.property('id', 'mainProcess');
    });

    it('sub process execution output is added to output', async () => {
      const subProcess = context.getActivityById('subProcess');

      const leave = subProcess.waitFor('leave', (_, a) => a.content.id === 'subProcess');
      subProcess.once('wait', (api) => {
        api.owner.environment.output.child = 1;
        api.signal();
      });

      subProcess.run();

      const api = await leave;

      expect(api.content.output).to.eql({
        child: 1,
      });
    });

    it('adds parent to child', async () => {
      const subProcess = context.getActivityById('subProcess');
      const leave = subProcess.waitFor('leave', (_, a) => a.content.id === 'subProcess');

      const wait = subProcess.waitFor('wait');

      subProcess.run();

      const childApi = await wait;

      expect(childApi.content.type).to.equal('bpmn:UserTask');
      expect(childApi.content.parent).to.have.property('id', 'subProcess');
      expect(childApi.content.parent).to.have.property('executionId').that.match(/^subProcess_.+/);

      childApi.signal();
      return leave;
    });
  });

  describe('stop()', () => {
    it('stops process execution and closes broker', () => {
      const subProcess = SubProcess({id: 'sub-process', parent: {id: 'process1'}}, testHelpers.emptyContext({
        getActivities() {
          return [{id: 'subTask', Behaviour: SignalTask}];
        }
      }));

      subProcess.run();
      subProcess.stop();

      const executionExchange = subProcess.broker.getExchange('subprocess-execution');
      expect(executionExchange).to.be.ok;
      expect(executionExchange).to.have.property('bindingCount', 0);

      const apiExchange = subProcess.broker.getExchange('api');
      expect(apiExchange).to.be.ok;
      expect(apiExchange).to.have.property('bindingCount', 1);

      const executeQ = subProcess.broker.getQueue('execute-q');
      expect(executeQ).to.have.property('messageCount', 1);
      expect(executeQ).to.have.property('consumerCount', 0);

      const runQ = subProcess.broker.getQueue('run-q');
      expect(runQ).to.have.property('consumerCount', 0);
      expect(runQ).to.have.property('messageCount', 1);

      const executionQ = subProcess.broker.getQueue('execution-q');
      expect(executionQ).to.have.property('consumerCount', 0);
      expect(executionQ).to.have.property('messageCount', 0);

      expect(subProcess.broker).to.have.property('consumerCount', 1);
      expect(subProcess.broker.getConsumers()[0]).to.have.property('consumerTag', '_api-shake');
    });
  });

  describe('discard', () => {
    let context;
    beforeEach(async () => {
      context = await testHelpers.context(subProcessSource);
    });

    it('discards children', async () => {
      const subProcess = context.getActivityById('subProcess');

      const wait = subProcess.waitFor('wait');
      subProcess.run();
      await wait;

      const leave = subProcess.waitFor('leave', (_, a) => a.content.id === 'subProcess');

      subProcess.discard();

      await leave;

      expect(subProcess.execution.source.execution).to.be.ok;

      const children = subProcess.execution.source.execution.getActivities();
      expect(children).to.have.length(2);
      expect(children[0]).to.have.property('counters').with.property('discarded', 1);
      expect(children[1]).to.have.property('counters').with.property('taken', 0);
    });

    it('discard by api discards children', async () => {
      const subProcess = context.getActivityById('subProcess');

      const wait = subProcess.waitFor('wait');
      subProcess.run();
      await wait;

      const leave = subProcess.waitFor('leave', (_, a) => a.content.id === 'subProcess');

      subProcess.getApi().discard();

      await leave;

      expect(subProcess.execution.source.execution).to.be.ok;

      const children = subProcess.execution.source.execution.getActivities();
      expect(children).to.have.length(2);
      expect(children[0]).to.have.property('counters').with.property('discarded', 1);
      expect(children[1]).to.have.property('counters').with.property('taken', 0);
    });
  });

  describe('resume', () => {
    let context;
    beforeEach(async () => {
      context = await testHelpers.context(subProcessSource);
    });

    it('state includes child states', async () => {
      const subProcess = context.getActivityById('subProcess');

      const wait = subProcess.waitFor('wait');
      subProcess.run();
      await wait;

      const state = subProcess.getState();

      expect(state).to.have.property('execution');
      expect(state.execution).to.have.property('children').with.length(2);
      expect(state.execution.children[0]).to.have.property('broker');
    });

    it('stop and resume continues execution', async () => {
      const subProcess = context.getActivityById('subProcess');
      let wait = subProcess.waitFor('wait');

      subProcess.run();

      await wait;

      subProcess.stop();

      const executeQ = subProcess.broker.getQueue('execute-q');
      expect(executeQ.consumerCount).to.equal(0);

      wait = subProcess.waitFor('wait');
      const leave = subProcess.waitFor('leave', (_, a) => a.content.id === 'subProcess');
      subProcess.resume();

      (await wait).signal();

      const leaveApi = await leave;
      expect(leaveApi).to.have.property('id', 'subProcess');
      expect(leaveApi.content.parent).to.have.property('id', 'mainProcess');
    });

    it('recover and resume with state continues execution', async () => {
      const subProcess = context.getActivityById('subProcess');
      let wait = subProcess.waitFor('wait');

      subProcess.run();

      await wait;

      subProcess.stop();
      const state = subProcess.getState();

      const subProcess2 = context.clone().getActivityById('subProcess');
      subProcess2.recover(state);

      wait = subProcess2.waitFor('wait');
      const leave = subProcess2.waitFor('leave', (_, a) => a.content.id === 'subProcess');
      subProcess2.resume();

      (await wait).signal();

      return leave;
    });
  });

  describe('sequence flows', () => {
    it('taken sequence flow emits on events', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <subProcess id="subProcess">
            <startEvent id="start" />
            <task id="task" />
            <endEvent id="end" />
            <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
            <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
          </subProcess>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const activity = context.getActivityById('subProcess');

      const messages = [];
      activity.broker.subscribeTmp('event', 'flow.*', (_, message) => {
        messages.push(message);
      }, {noAck: true});

      activity.run();

      expect(messages).to.have.length(2);
      expect(messages[0].fields).to.have.property('routingKey', 'flow.take');
      expect(messages[1].fields).to.have.property('routingKey', 'flow.take');
    });
  });

  describe('getApi()', () => {
    it('returns child api', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <subProcess id="subProcess">
            <userTask id="task" />
          </subProcess>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const subProcess = context.getActivityById('subProcess');

      let message;
      subProcess.broker.subscribeOnce('event', 'activity.wait', (_, msg) => {
        message = msg;
      });

      subProcess.run();

      expect(message).to.be.ok;
      expect(message.content).to.have.property('id', 'task');

      const api = subProcess.execution.source.getApi(message);

      expect(api.content).to.have.property('id', 'task');
    });

    it('child api resolves expression from process execution environment', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <subProcess id="subProcess">
            <userTask id="task" />
          </subProcess>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      context.environment.variables.input = 1;
      const subProcess = context.getActivityById('subProcess');

      let message;
      subProcess.broker.subscribeOnce('event', 'activity.wait', (_, msg) => {
        message = msg;
      });

      subProcess.run();

      const api = subProcess.execution.source.getApi(message);
      expect(api.resolveExpression('${environment.variables.content.id}')).to.equal('subProcess');
    });
  });

  describe('getPostponed()', () => {
    it('returns child apis', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <subProcess id="subProcess">
            <userTask id="task1" />
            <userTask id="task2" />
          </subProcess>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const subProcess = context.getActivityById('subProcess');

      subProcess.run();

      const postponed = subProcess.execution.source.getPostponed();
      expect(postponed).to.have.length(2);
      expect(postponed[0]).to.have.property('id', 'task1');
      expect(postponed[1]).to.have.property('id', 'task2');

      expect(postponed[0].content).to.have.property('parent').with.property('id', 'subProcess');
      expect(postponed[1].content).to.have.property('parent').with.property('id', 'subProcess');
    });
  });

  describe('error', () => {
    it('publishes error if child fails', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="Definitions_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="mainProcess" isExecutable="true">
          <subProcess id="subProcess" name="Wrapped">
            <serviceTask id="subServiceTask" name="Put" implementation="\${environment.services.throw}" />
          </subProcess>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      context.environment.addService('throw', (_, next) => {
        next(new Error('Expected'));
      });

      const subProcess = context.getActivityById('subProcess');
      subProcess.activate();

      const messages = [];
      const assertMessage = AssertMessage(subProcess, messages, false);
      subProcess.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});

      const completed = subProcess.waitFor('leave').catch(() => {});

      subProcess.run();

      await completed;

      assertMessage('activity.error', 'subServiceTask');
      assertMessage('activity.error', 'subProcess');
    });

    it('catches child error if bound error event is attached to failing child', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="Definitions_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="mainProcess" isExecutable="true">
          <subProcess id="subProcess" name="Wrapped">
            <serviceTask id="subServiceTask" name="Put" implementation="\${environment.services.throw}" />
            <boundaryEvent id="errorEvent" attachedToRef="subServiceTask">
              <errorEventDefinition />
            </boundaryEvent>
          </subProcess>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      context.environment.addService('throw', (_, next) => {
        next(new BpmnError('Expected', {errorCode: '503'}));
      });

      const subProcess = context.getActivityById('subProcess');
      subProcess.activate();

      const messages = [];
      const assertMessage = AssertMessage(subProcess, messages, false);
      subProcess.broker.subscribeTmp('event', 'activity.#', (routingKey, message) => {
        messages.push(message);
      }, {noAck: true});

      const completed = subProcess.waitFor('leave');

      subProcess.run();

      await completed;

      assertMessage('activity.catch', 'errorEvent');
      assertMessage('activity.end', 'subProcess');
    });
  });

  describe('loop', () => {
    describe('sequential', () => {
      let context;
      beforeEach(async () => {
        context = await getLoopContext(true);
      });

      it('executes in sequence', async () => {
        const task = context.getActivityById('sub-process-task');

        let waiting = task.waitFor('wait');
        const left = task.waitFor('leave');

        task.run();

        let taskApi = await waiting;

        waiting = task.waitFor('wait');
        taskApi.signal();

        taskApi = await waiting;

        waiting = task.waitFor('wait');
        taskApi.signal();

        taskApi = await waiting;

        taskApi.signal();

        await left;
      });

      it('getState() returns iteration child states', async () => {
        const task = context.getActivityById('sub-process-task');
        let waiting = task.waitFor('wait');
        const left = task.waitFor('leave');

        task.run({data: 1});

        let taskApi = await waiting;

        let state = task.getState();

        expect(state).to.have.property('execution');
        expect(state.execution).to.have.property('executions').with.length(1);
        const iteration = state.execution.executions[0];

        expect(iteration).to.have.property('children').with.length(1);
        expect(iteration.children[0]).to.have.property('broker').that.is.ok;

        waiting = task.waitFor('wait');
        taskApi.signal(1);

        state = task.getState();

        expect(state.execution.executions[0]).to.have.property('environment').with.property('output').that.eql({labour: 1});

        taskApi = await waiting;

        waiting = task.waitFor('wait');
        taskApi.signal(2);

        state = task.getState();
        expect(state.execution.executions[1]).to.have.property('environment').with.property('output').that.eql({archiving: 2});

        taskApi = await waiting;

        taskApi.signal(3);

        state = task.getState();
        expect(state.execution.executions[2]).to.have.property('environment').with.property('output').that.eql({shopping: 3});

        await left;
      });

      it('keeps sub process children in the dark that they are looped', async () => {
        const task = context.getActivityById('sub-process-task');
        const leave = task.waitFor('leave', (_, msg) => {
          if (msg.content.id === task.id) return true;
        });

        let count = 0;
        const waitConsumer = task.on('wait', (api) => {
          expect(api.type).to.equal('bpmn:UserTask');

          expect(api.content.isMultiInstance, 'content.isMultiInstance').to.not.be.ok;
          expect(api.content.isRootScope, 'content.isRootScope').to.be.ok;

          count++;
          api.signal(count);
        });

        task.run();

        await leave;

        waitConsumer.cancel();

        expect(count).to.equal(3);
      });

      it('returns output from sub process execution environment output', async () => {
        const task = context.getActivityById('sub-process-task');
        const leave = task.waitFor('leave', (_, msg) => msg.content.id === task.id);

        let count = 0;
        const waitConsumer = task.on('wait', (api) => {
          count++;
          api.signal(count);
        });

        task.run();

        const left = await leave;

        waitConsumer.cancel();

        expect(left.content).to.have.property('output').that.eql([{
          labour: 1,
        }, {
          archiving: 2,
        }, {
          shopping: 3,
        }]);
      });

      it('stop closes all consumers except shake', async () => {
        const task = context.getActivityById('sub-process-task');

        const stop = task.waitFor('stop', (_, msg) => {
          if (msg.content.id === task.id) return true;
        });

        task.once('wait', (api) => {
          api.signal(1);
          task.stop();
        });

        task.run();

        await stop;

        expect(task.broker).to.have.property('consumerCount', 1);
        expect(task.broker.getConsumers()[0]).to.have.property('consumerTag', '_api-shake');
      });

      it('resumes from last completed', async () => {
        const task = context.getActivityById('sub-process-task');

        const stop = task.waitFor('stop', (_, msg) => {
          if (msg.content.id === task.id) return true;
        });

        task.once('wait', (api) => {
          api.signal(1);
          task.stop();
        });

        task.run();

        await stop;

        const leave = task.waitFor('leave', (_, msg) => {
          if (msg.content.id === task.id) return true;
        });

        const waitConsumer = task.on('wait', (api) => {
          api.signal(1);
        });

        task.resume();

        const left = await leave;
        waitConsumer.cancel();

        expect(left.content.output).to.eql([{
          labour: 1,
        }, {
          archiving: 1,
        }, {
          shopping: 1,
        }]);
      });

      it('recoveres iteration', async () => {
        const task = context.getActivityById('sub-process-task');

        const stop = task.waitFor('stop');

        task.once('wait', (api) => {
          api.signal(1);
          task.stop();
        });

        task.run();

        await stop;

        const state = task.getState();

        const recoverContext = context.clone();
        const recoveredTask = recoverContext.getActivityById('sub-process-task');
        recoveredTask.recover(state);


        const leave = task.waitFor('leave', (_, msg) => {
          if (msg.content.id === task.id) return true;
        });

        const waitConsumer = task.on('wait', (api) => {
          api.signal(1);
        });

        task.resume();

        const left = await leave;
        waitConsumer.cancel();

        expect(left.content.output).to.eql([{
          labour: 1,
        }, {
          archiving: 1,
        }, {
          shopping: 1,
        }]);
      });
    });

    describe('parallel', () => {
      let context;
      beforeEach(async () => {
        context = await getLoopContext(false);
      });

      it('starts all process executions at once with cloned context and environment', async () => {
        const task = context.getActivityById('sub-process-task');

        task.run();

        const executions = task.execution.source.executions;
        expect(task.execution.source.executions).to.have.length(3);

        expect(executions[0].environment).to.be.ok.and.not.equal(task.environment);
        expect(executions[0].environment.variables).to.have.property('content').with.property('item', 'labour');

        expect(executions[1].environment).to.be.ok.and.not.equal(task.environment);
        expect(executions[1].environment.variables).to.have.property('content').with.property('item', 'archiving');

        expect(executions[2].environment).to.be.ok.and.not.equal(task.environment);
        expect(executions[2].environment.variables).to.have.property('content').with.property('item', 'shopping');
      });

      it('getPostponed() returns all process child executions', async () => {
        const task = context.getActivityById('sub-process-task');

        task.run();

        const postponed = task.execution.source.getPostponed();
        expect(postponed).to.have.length(3);

        expect(postponed[0]).to.have.property('id', 'userTask');
        expect(postponed[1]).to.have.property('id', 'userTask');
        expect(postponed[2]).to.have.property('id', 'userTask');
      });

      it('executes in parallel', async () => {
        const task = context.getActivityById('sub-process-task');

        const waiting = [];
        const waitConsumer = task.on('wait', (api) => {
          waiting.push(api);
        });

        const wait = task.waitFor('wait');
        task.run();

        const executeQ = task.broker.getQueue('execute-q');
        await wait;

        expect(task.execution.source.executions).to.have.length(3);

        expect(task.broker.getQueue('run-q').messageCount, 'run queue').to.equal(1);
        expect(executeQ.messageCount, 'execute queue').to.equal(4);

        waiting.pop().signal(3);

        expect(executeQ.messageCount, 'execute queue').to.equal(3);

        waiting.shift().signal(1);

        expect(executeQ.messageCount, 'execute queue').to.equal(2);

        const leave = task.waitFor('leave', (_, msg) => msg.content.id === task.id);

        waiting.pop().signal(2);

        const left = await leave;

        expect(task.broker.getQueue('run-q').messageCount, 'run queue').to.equal(0);
        expect(executeQ.messageCount, 'execute queue').to.equal(0);

        waitConsumer.cancel();

        expect(left.content.output).to.eql([{labour: 1}, {archiving: 2}, {shopping: 3}]);
      });

      it('completes when last iteration completes', async () => {
        const task = context.getActivityById('sub-process-task');
        const leave = task.waitFor('leave', (_, msg) => msg.content.id === task.id);

        const waiting = [];
        task.broker.subscribeTmp('event', 'activity.wait', (_, msg) => {
          waiting.push(msg);
        }, {noAck: true});

        task.run();

        expect(waiting).to.have.length(3);

        task.getApi(waiting[2]).signal();
        expect(task.execution).to.have.property('completed', false);

        task.getApi(waiting[0]).signal();
        expect(task.execution).to.have.property('completed', false);

        task.getApi(waiting[1]).signal();
        expect(task.execution).to.have.property('completed', true);

        await leave;
      });

      it('stop in the middle of parallel loop start keeps start messages', async () => {
        const task = context.getActivityById('sub-process-task');
        const stop = task.waitFor('stop', (_, msg) => msg.content.id === task.id);

        task.once('wait', (api) => {
          api.signal();
          task.stop();
        });

        task.run();

        await stop;

        const executeQ = task.broker.getQueue('execute-q');
        expect(executeQ.messages[0].fields).to.have.property('routingKey', 'execute.iteration.batch');
        expect(executeQ.messages[0].content).to.contain({
          isRootScope: true,
          running: 3,
          index: 3,
        });
        expect(executeQ.messages[1].content.isRootScope).to.be.undefined;
        expect(executeQ.messages[2].content.isRootScope).to.be.undefined;
        expect(executeQ.messages[3].content.isRootScope).to.be.undefined;

        expect(task.broker.getQueue('execute-q')).to.have.property('messageCount', 4);
      });

      it('getState() returns iteration states', async () => {
        const task = context.getActivityById('sub-process-task');
        const leave = task.waitFor('leave', (_, msg) => msg.content.id === task.id);

        task.run({data: 1});

        let state = task.getState();

        expect(state).to.have.property('execution');
        expect(state.execution).to.have.property('executions').with.length(3);

        const executionsState = state.execution.executions;
        expect(executionsState[0]).to.have.property('children').with.length(1);
        expect(executionsState[0].children[0]).to.have.property('broker').that.is.ok;
        expect(executionsState[1]).to.have.property('children').with.length(1);
        expect(executionsState[1].children[0]).to.have.property('broker').that.is.ok;
        expect(executionsState[2]).to.have.property('children').with.length(1);
        expect(executionsState[2].children[0]).to.have.property('broker').that.is.ok;

        task.execution.source.executions[0].getPostponed()[0].signal(1);
        state = task.getState();

        expect(state).to.have.property('execution');
        expect(state.execution).to.have.property('executions').with.length(3);
        expect(state.execution.executions[0]).to.have.property('environment').with.property('output').that.eql({labour: 1});
        expect(state.execution.executions[0]).to.have.property('environment').with.property('variables');
        expect(state.execution.executions[0].environment.variables).to.have.property('content').with.property('executionId');
        expect(state.execution.executions[0].environment.variables).to.have.property('fields').with.property('routingKey');

        task.execution.source.executions[2].getPostponed()[0].signal(3);
        state = task.getState();

        expect(state).to.have.property('execution');
        expect(state.execution).to.have.property('executions').with.length(3);
        expect(state.execution.executions[2]).to.have.property('environment').with.property('output').that.eql({shopping: 3});

        task.execution.source.executions[1].getPostponed()[0].signal(2);
        state = task.getState();

        expect(state).to.have.property('execution');
        expect(state.execution).to.have.property('executions').with.length(3);
        expect(state.execution.executions[1]).to.have.property('environment').with.property('output').that.eql({archiving: 2});

        await leave;
      });

      it('resumes from last completed', async () => {
        const task = context.getActivityById('sub-process-task');

        const stop = task.waitFor('stop');

        task.once('wait', (api) => {
          api.signal(1);
          task.stop();
        });

        task.run();

        await stop;

        const leave = task.waitFor('leave', (_, msg) => msg.content.id === task.id);

        const waitConsumer = task.on('wait', (api) => {
          api.signal(1);
        });

        task.resume();

        const left = await leave;
        waitConsumer.cancel();

        expect(left.content.output).to.eql([{
          labour: 1,
        }, {
          archiving: 1,
        }, {
          shopping: 1,
        }]);
      });

      it('recover initiates executions with children', async () => {
        const task = context.getActivityById('sub-process-task');

        const stop = task.waitFor('stop', (_, msg) => msg.content.id === task.id);

        task.once('wait', (api) => {
          api.signal(api.resolveExpression(
            '${environment.variables.prefix} ${environment.variables.content.item}'
          ));
          task.stop();
        });

        task.run();

        await stop;

        const state = task.getState();

        const recoverContext = context.clone();
        const recoveredTask = recoverContext.getActivityById('sub-process-task');
        recoveredTask.recover(JSON.parse(JSON.stringify(state)));

        const executions = recoveredTask.execution.source.executions;
        expect(executions).to.have.length(1);

        expect(executions[0]).to.have.property('environment').with.property('variables');
        expect(executions[0].environment.variables).to.have.property('content').with.property('id', 'sub-process-task');
        expect(executions[0].environment.variables).to.have.property('content').with.property('executionId');
        expect(executions[0].environment.variables).to.have.property('fields').with.property('routingKey');
        expect(executions[0].environment.variables.content).to.have.property('item', 'labour');
        expect(executions[0]).to.have.property('environment').with.property('output').that.eql({labour: 'sub labour'});

        expect(executions[0].getActivities()).to.have.length(1);
        expect(executions[0].getActivities()[0].environment === executions[0].environment, 'child environment').to.be.true;
      });

      it('resumes recovered', async () => {
        const task = context.getActivityById('sub-process-task');

        const stop = task.waitFor('stop', (_, msg) => msg.content.id === task.id);

        task.once('wait', (api) => {
          api.signal(api.resolveExpression(
            '${environment.variables.prefix} ${environment.variables.content.index}'
          ));
          task.stop();
        });

        task.run();

        await stop;

        const state = task.getState();

        const recoverContext = context.clone();
        recoverContext.environment.variables.prefix = 'recovered';
        const recoveredTask = recoverContext.getActivityById('sub-process-task');

        recoveredTask.recover(JSON.parse(JSON.stringify(state)));

        const leave = recoveredTask.waitFor('leave', (_, msg) => msg.content.id === task.id);

        const waitConsumer = recoveredTask.on('wait', (api) => {
          api.signal(api.resolveExpression(
            '${environment.variables.prefix} ${environment.variables.content.index}'
          ));
        });

        recoveredTask.resume();

        const left = await leave;

        waitConsumer.cancel();

        expect(left.content.output).to.eql([{
          labour: 'sub 0',
        }, {
          archiving: 'recovered 1',
        }, {
          shopping: 'recovered 2',
        }]);
      });
    });
  });
});

async function getLoopContext(sequential) {
  const source = `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="LoopProcess" isExecutable="true">
    <subProcess id="sub-process-task" name="Wrapped">
      <multiInstanceLoopCharacteristics isSequential="${sequential}" js:collection="\${environment.variables.inputList}">
        <loopCardinality>\${environment.variables.inputList.length}</loopCardinality>
      </multiInstanceLoopCharacteristics>
      <userTask id="userTask" js:result="\${environment.variables.content.item}" />
    </subProcess>
    </process>
  </definitions>`;
  const context = await testHelpers.context(source, {
    extensions: {
      js: JsExtension,
    },
  });

  context.environment.variables.prefix = 'sub';
  context.environment.variables.inputList = ['labour', 'archiving', 'shopping'];

  return context;
}

function AssertMessage(processContext, messages, inSequence = true) {
  return function assertMessage(routingKey, activityId, compareState) {
    if (!messages.length) {
      if (activityId) throw new Error(`${routingKey} <${activityId}> not found`);
      throw new Error(`${routingKey} not found`);
    }

    const message = messages.shift();

    if (!inSequence) {
      if (message.fields.routingKey !== routingKey) return assertMessage(routingKey, activityId);
      if (activityId && message.content.id !== activityId) return assertMessage(routingKey, activityId);
    }

    expect(message.fields, `${message.routingKey} <${message.content.id}>`).to.have.property('routingKey', routingKey);
    if (activityId) expect(message.content).to.have.property('id', activityId);

    if (!compareState) return message;

    const activity = processContext.getActivityById(id);
    const {source, context, id} = message.content;
    const activityApi = activity.getApi(source, context);

    expect(activityApi.getState(), `${routingKey} ${activityId} state`).to.deep.include(compareState);

    return message;
  };
}
