import Environment from '../../src/Environment';
import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';
import SignalTask from '../../src/tasks/SignalTask';
import { ActivityError } from '../../src/error/Errors';
import { Process } from '../../src/process/Process';

describe('Process', () => {
  describe('requirements', () => {
    it('requires a process definition with id and a context with an environment', () => {
      const bp = Process({id: 'theProcess'}, {
        environment: Environment(),
      });
      expect(bp.run).to.be.a('function');
    });

    it('requires context with getActivities(), and getSequenceFlows() to run', () => {
      const bp = Process({id: 'theProcess'}, {
        environment: Environment( { Logger: testHelpers.Logger }),
        getActivities() {},
        getSequenceFlows() {},
        getDataObjects() {},
        getMessageFlows() {},
      });
      bp.run();
      expect(bp.counters).to.have.property('completed', 1);
    });

    it('maps isExecutable behaviour to process', () => {
      const bp = Process({id: 'theProcess', behaviour: {isExecutable: true} }, {
        environment: Environment( { Logger: testHelpers.Logger }),
        getActivities() {},
        getSequenceFlows() {},
        getDataObjects() {},
        getMessageFlows() {},
      });
      expect(bp.isExecutable).to.be.true;
    });
  });

  describe('errors', () => {
    it('throws error if no-one is listening for errors', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="task" implementation="\${environment.services.shaky}" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      context.environment.addService('shaky', (_, next) => {
        next(Error('unstable'));
      });
      const bp = context.getProcessById('theProcess');

      expect(bp.run).to.throw('unstable');
    });

    it('emits error on activity error', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="task" implementation="\${environment.services.shaky}" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      context.environment.addService('shaky', (_, next) => {
        next(Error('unstable'));
      });
      const bp = context.getProcessById('theProcess');

      const errors = [];
      bp.on('error', (err) => {
        errors.push(err);
      });

      bp.run();

      expect(errors).to.have.length(1);
      expect(errors[0]).to.be.instanceof(ActivityError);
      expect(errors[0].message).to.equal('unstable');
    });

    it('emits error on flow error', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="theStart" />
          <exclusiveGateway id="decision" />
          <endEvent id="end1" />
          <endEvent id="end2" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="end1">
            <conditionExpression xsi:type="tFormalExpression" language="PowerShell"><![CDATA[
            ls | clip
            ]]></conditionExpression>
          </sequenceFlow>
          <sequenceFlow id="flow3" sourceRef="decision" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression" language="PowerShell"><![CDATA[
            ls | clip
            ]]></conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const bp = context.getProcessById('theProcess');

      const errors = [];
      bp.once('error', (err) => {
        errors.push(err);
      });

      bp.run();

      expect(errors).to.have.length(1);
      expect(errors[0]).to.be.instanceof(Error);
      expect(errors[0].message).to.match(/is unsupported/);
    });
  });

  describe('waitFor()', () => {
    it('returns promise that resolves when event occur', async () => {
      const bp = Process({id: 'theProcess'}, {
        environment: Environment( { Logger: testHelpers.Logger }),
        getActivities() {},
        getSequenceFlows() {},
        getDataObjects() {},
        getMessageFlows() {},
      });

      const leave = bp.waitFor('leave');

      bp.run();

      return leave;
    });

    it('rejects if process error is published', (done) => {
      const bp = Process({id: 'theProcess'}, {
        environment: Environment( { Logger: testHelpers.Logger }),
        getActivities() {},
        getSequenceFlows() {},
        getDataObjects() {},
        getMessageFlows() {},
      });

      bp.once('end', () => {
        bp.broker.publish('event', 'process.error', new Error('unstable'), {mandatory: true});
      });

      bp.waitFor('leave').catch((err) => {
        expect(err.message).to.equal('unstable');
        done();
      });

      bp.run();
    });

    it('rejects if execution error occur', (done) => {
      const context = {
        environment: Environment( { Logger: testHelpers.Logger }),
        getActivities() {
          return this.activities || (this.activities = [SignalTask({
            id: 'task',
            type: 'manualtask',
            Behaviour: SignalTask,
            parent: {
              id: 'theProcess',
            },
          }, this)]);
        },
        getSequenceFlows() {},
        getDataObjects() {},
        getMessageFlows() {},
        getInboundSequenceFlows() {},
        getOutboundSequenceFlows() {},
        getActivityById(id) {
          return this.activities.find((a) => a.id === id);
        },
        loadExtensions() {},
      };
      const bp = Process({id: 'theProcess'}, context);

      bp.once('wait', () => {
        bp.broker.publish('execution', 'execution.error', {error: new Error('unstable')}, {mandatory: true, type: 'error'});
      });

      bp.waitFor('leave').catch((err) => {
        expect(err.message).to.equal('unstable');
        done();
      });

      bp.run();
    });
  });

  describe('stop()', () => {
    it('sets stopped flag', () => {
      const bp = Process({id: 'theProcess'}, Context());

      bp.run();
      bp.stop();

      expect(bp.getState()).to.have.property('stopped', true);
    });

    it('ignored if not executing', () => {
      const bp = Process({id: 'theProcess'}, Context());
      bp.stop();
      expect(bp.getState().stopped).to.be.undefined;
    });

    it('stops run queue and leaves run message', () => {
      const bp = Process({id: 'theProcess'}, Context());
      bp.run();
      bp.stop();

      const runQ = bp.broker.getQueue('run-q');
      expect(runQ).to.have.property('consumerCount', 0);
      expect(runQ).to.have.property('messageCount', 1);
      expect(runQ.peek(true)).to.have.property('fields').that.have.property('routingKey', 'run.execute');
    });

    it('stops all child executions', () => {
      const bp = Process({id: 'theProcess'}, Context());
      bp.run();
      bp.stop();

      expect(bp.execution.getActivities()).to.have.length(1);
      expect(bp.execution.getActivities()[0]).to.have.property('stopped', true);
    });
  });

  describe('resume()', () => {
    it('resumes after stopped', async () => {
      const bp = Process({id: 'theProcess'}, Context());

      bp.run();
      bp.stop();

      bp.resume();

      bp.getPostponed()[0].signal();

      expect(bp.counters).to.have.property('completed', 1);
    });
  });

  describe('getState()', () => {
    it('returns expected state when not running', () => {
      const bp = Process({id: 'theProcess'}, Context());

      const state = bp.getState();

      expect(state.status).to.be.undefined;
      expect(state).to.have.property('broker').that.is.ok;
      expect(state).to.have.property('counters');
      expect(state.status).to.be.undefined;
      expect(state.execution).to.be.undefined;
    });

    it('returns expected state when running', () => {
      const bp = Process({id: 'theProcess'}, Context());
      bp.run();

      const state = bp.getState();

      expect(state.status).to.equal('executing');
      expect(state.stopped).to.be.undefined;
      expect(state).to.have.property('broker').that.is.ok;
      expect(state).to.have.property('execution').that.is.ok;
      expect(state).to.have.property('counters');
      expect(state).to.have.property('status', 'executing');
    });

    it('returns expected state when stopped', () => {
      const bp = Process({id: 'theProcess'}, Context());
      bp.run();

      bp.run();
      bp.stop();

      const state = bp.getState();

      expect(state.status).to.equal('executing');
      expect(state).to.have.property('stopped', true);
      expect(state).to.have.property('broker').that.is.ok;
      expect(state).to.have.property('execution').that.is.ok;
      expect(state).to.have.property('counters');
      expect(state).to.have.property('status', 'executing');
    });
  });

  describe('getPostponed()', () => {
    let context;
    beforeEach(async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="task1" />
          <userTask id="task1" />
          <sequenceFlow id="flow2" sourceRef="start" targetRef="task2" />
          <userTask id="task2" />
          <sequenceFlow id="flow3" sourceRef="start" targetRef="subProcess" />
          <subProcess id="subProcess">
            <userTask id="task3" />
          </subProcess>
          <sequenceFlow id="flow4" sourceRef="task1" targetRef="end" />
          <sequenceFlow id="flow5" sourceRef="task2" targetRef="end" />
          <sequenceFlow id="flow6" sourceRef="subProcess" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
    });

    it('returns none if not executing', () => {
      const [bp] = context.getProcesses();
      expect(bp.getPostponed()).to.have.length(0);
    });

    it('returns executing activities', () => {
      const [bp] = context.getProcesses();
      bp.run();

      const activities = bp.getPostponed();
      expect(activities).to.have.length(3);
      expect(activities[0].id).to.equal('task1');
      expect(activities[1].id).to.equal('task2');
      expect(activities[2].id).to.equal('subProcess');
    });

    it('reduced with completed activities', () => {
      const [bp] = context.getProcesses();
      bp.run();

      let postponed = bp.getPostponed();
      postponed[0].signal();

      postponed = bp.getPostponed();
      expect(postponed, postponed.map((a) => a.id)).to.have.length(2);
      expect(postponed[0].id).to.equal('task2');
      expect(postponed[1].id).to.equal('subProcess');

      postponed[0].signal();

      postponed = bp.getPostponed();
      expect(postponed, postponed.map((a) => a.id)).to.have.length(1);
      expect(postponed[0].id).to.equal('subProcess');
      expect(postponed[0].content).to.have.property('isSubProcess', true);
      expect(postponed[0].owner).to.have.property('id', 'subProcess');
      expect(postponed[0].owner.execution).to.be.ok;
      expect(postponed[0].owner.execution.source).to.be.ok;
      expect(postponed[0].owner.execution.source.getPostponed()).to.have.length(1);

      const [subTask] = postponed[0].owner.execution.source.getPostponed();
      subTask.signal();

      expect(bp.counters).to.have.property('completed', 1);
    });

    it('returns executing activities if resumed', () => {
      const [bp] = context.getProcesses();
      bp.run();

      let postponed = bp.getPostponed();
      expect(postponed[0].id).to.equal('task1');
      expect(postponed[1].id).to.equal('task2');
      expect(postponed[2].id).to.equal('subProcess');
      expect(postponed).to.have.length(3);

      bp.stop();
      const state = bp.getState();

      const recovered = context.clone().getProcessById(state.id).recover(JSON.parse(JSON.stringify(state)));
      recovered.resume();

      postponed = recovered.getPostponed();

      expect(postponed[0].id).to.equal('subProcess');
      expect(postponed[1].id).to.equal('task1');
      expect(postponed[2].id).to.equal('task2');
      expect(postponed).to.have.length(3);
    });

    it('looped activity returns one executing', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <userTask id="task">
            <multiInstanceLoopCharacteristics isSequential="false">
              <loopCardinality>3</loopCardinality>
            </multiInstanceLoopCharacteristics>
          </userTask>
        </process>
      </definitions>`;

      const [bp] = (await testHelpers.context(source)).getProcesses();

      bp.run();

      const activities = bp.getPostponed();
      expect(activities).to.have.length(1);
      expect(activities[0].id).to.equal('task');
    });

    it('looped subProcess returns sub process', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <subProcess id="subProcess">
            <userTask id="task" />
            <multiInstanceLoopCharacteristics isSequential="false">
              <loopCardinality>3</loopCardinality>
            </multiInstanceLoopCharacteristics>
          </subProcess>
        </process>
      </definitions>`;

      const [bp] = (await testHelpers.context(source)).getProcesses();

      bp.run();

      const postponed = bp.getPostponed();

      expect(postponed).to.have.length(1);

      const [childApi] = postponed;
      expect(childApi.id).to.equal('subProcess');
      expect(childApi.owner.execution.source).to.have.property('executions').with.length(3);
      expect(childApi.owner.execution.source.getPostponed()).to.have.length(3);
    });
  });

  describe('sub process', () => {
    it('waitFor() activity returns activity api', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <subProcess id="subProcess">
            <userTask id="task" />
          </subProcess>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();

      const wait = bp.waitFor('wait');

      bp.run();

      expect(bp.status).to.equal('executing');

      const api = await wait;

      expect(bp.getActivityById('subProcess').execution).to.be.ok;
      expect(bp.getActivityById('subProcess').execution.source).to.be.ok;

      expect(bp.getActivityById('subProcess').execution.source.getPostponed()).to.have.length(1);
      expect(bp.getActivityById('subProcess').execution.source.getPostponed()[0].owner === api.owner).to.be.true;
    });

    it('completes when sub process without flows completes', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <subProcess id="subProcess">
            <userTask id="task" />
          </subProcess>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();

      const wait = bp.waitFor('wait');
      const leave = bp.waitFor('leave');

      bp.run();

      expect(bp.status).to.equal('executing');

      const api = await wait;
      expect(api.id).to.equal('task');
      expect(api.owner.id).to.equal('task');

      api.signal();

      await leave;

      expect(bp.counters).to.have.property('completed', 1);
    });

    it('completes when sub process with flows completes', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <subProcess id="subProcess">
            <userTask id="task1" />
            <boundaryEvent id="event" attachedToRef="task1" />
            <userTask id="task2" />
            <sequenceFlow id="flow1" sourceRef="task1" targetRef="task2" />
            <sequenceFlow id="flow2" sourceRef="event" targetRef="task2" />
          </subProcess>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();

      let wait = bp.waitFor('wait');
      const leave = bp.waitFor('leave');

      bp.run();

      expect(bp.status).to.equal('executing');

      let api = await wait;
      expect(api.id).to.equal('task1');

      wait = bp.waitFor('wait');
      api.signal();

      api = await wait;
      expect(api.id).to.equal('task2');

      api.signal();

      await leave;

      expect(bp.counters).to.have.property('completed', 1);
    });

    it('completes when succeeding tasks of process when sub process completes', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="subProcess" />
          <subProcess id="subProcess">
            <task id="task1" />
            <sequenceFlow id="flow2" sourceRef="task1" targetRef="innerEnd" />
            <endEvent id="innerEnd" />
          </subProcess>
          <sequenceFlow id="flow3" sourceRef="subProcess" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();

      const leave = bp.waitFor('leave');

      bp.run();

      await leave;

      expect(bp.counters).to.have.property('completed', 1);

      expect(bp.getActivityById('end').counters).to.eql({taken: 1, discarded: 0});
    });

    it('completes when sub process with terminate end event completes', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="subProcess" />
          <subProcess id="subProcess">
            <task id="task1" />
            <sequenceFlow id="flow2" sourceRef="task1" targetRef="terminateEvent" />
            <endEvent id="terminateEvent">
              <terminateEventDefinition />
            </endEvent>
          </subProcess>
          <sequenceFlow id="flow3" sourceRef="subProcess" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();

      const leave = bp.waitFor('leave');

      bp.run();

      await leave;

      expect(bp.counters).to.have.property('completed', 1);

      expect(bp.getActivityById('end').counters).to.eql({taken: 1, discarded: 0});
    });
  });

  describe('events', () => {
    it('emits wait when activity is waiting', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <userTask id="task" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();

      const wait = new Promise((resolve) => {
        bp.on('wait', resolve);
      });

      bp.run();

      const api = await wait;

      expect(api).to.have.property('id', 'task');
      expect(api).to.have.property('executionId');
    });

    it('once only calls callback once', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <userTask id="task1" />
          <sequenceFlow id="flow" sourceRef="task1" targetRef="task2" />
          <userTask id="task2" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();

      let count = 0;
      const wait1 = new Promise((resolve) => {
        bp.once('wait', (...args) => {
          count++;
          resolve(...args);
        });
      });

      bp.run();

      let api = await wait1;

      const wait2 = new Promise((resolve) => {
        bp.once('wait', resolve);
      });

      api.signal();

      api = await wait2;
      expect(count).to.equal(1);
    });
  });

  describe('sendMessage(content)', () => {
    let bp;
    beforeEach('setup proc', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
          <receiveTask id="task" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      [bp] = context.getProcesses();
    });

    it('publishes message to activity queue', () => {
      const activity = bp.getActivityById('task');

      expect(bp.sendMessage({
        target: {id: 'task'},
      }));

      expect(activity.broker.getQueue('messages').messageCount).to.equal(1);
    });

    it('is ignored if activity is not found', () => {
      expect(bp.sendMessage({
        target: {id: 'notask'},
      }));
    });
  });

  describe('data objects', () => {
    let bp;
    beforeEach('setup proc', async () => {
      const context = await testHelpers.context(factory.userTask());
      [bp] = context.getProcesses();
    });

    it('are saved to variables', () => {
      bp.run();

      expect(bp.getPostponed()).to.have.length(1);
      const [taskApi] = bp.getPostponed();

      taskApi.signal({
        ioSpecification: {
          dataOutputs: [{
            id: 'userInput',
            value: 'von Rosen',
          }],
        },
      });

      expect(bp.environment.variables).to.have.property('_data').that.eql({
        inputFromUser: 'von Rosen'
      });
    });
  });
});

function Context() {
  return {
    environment: Environment( { Logger: testHelpers.Logger }),
    getActivities() {
      return this.activities || (this.activities = [SignalTask({
        id: 'task',
        type: 'bpmn:ManualTask',
        Behaviour: SignalTask,
        parent: {
          id: 'theProcess',
        },
      }, this)]);
    },
    getSequenceFlows() {},
    getInboundSequenceFlows() {},
    getOutboundSequenceFlows() {},
    getDataObjects() {},
    getMessageFlows() {},
    getActivityById(id) {
      return this.activities.find((a) => a.id === id);
    },
    loadExtensions() {},
  };
}
