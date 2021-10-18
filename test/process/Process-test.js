import factory from '../helpers/factory';
import JsExtension from '../resources/extensions/JsExtension';
import SignalTask from '../../src/tasks/SignalTask';
import testHelpers from '../helpers/testHelpers';
import { ActivityError } from '../../src/error/Errors';
import { Process } from '../../src/process/Process';

describe('Process', () => {
  describe('requirements', () => {
    it('requires a process definition with id and a context with an environment', () => {
      const bp = Process({id: 'theProcess'}, testHelpers.emptyContext());
      expect(bp.run).to.be.a('function');
    });

    it('requires context with getActivities(), and getSequenceFlows() to run', () => {
      const bp = Process({id: 'theProcess'}, testHelpers.emptyContext());
      bp.run();
      expect(bp.counters).to.have.property('completed', 1);
    });

    it('maps isExecutable behaviour to process', () => {
      const bp = Process({id: 'theProcess', behaviour: {isExecutable: true} }, testHelpers.emptyContext());
      expect(bp.isExecutable).to.be.true;
    });
  });

  describe('run()', () => {
    it('assigns run message to environment variables', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
        <definitions id="def" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <task id="task" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const bp = context.getProcessById('theProcess');

      bp.run();

      expect(bp.environment.variables).to.have.property('fields').with.property('routingKey', 'run.execute');
      expect(bp.environment.variables).to.have.property('content').with.property('id', 'theProcess');
      expect(bp.environment.variables).to.have.property('properties').with.property('messageId');
      expect(bp.environment.variables).to.not.have.property('ack');
    });

    it('throws if called while process is running', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
        <definitions id="Definition_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <userTask id="task" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const bp = context.getProcessById('theProcess');

      bp.run();

      expect(() => {
        bp.run();
      }).to.throw(/process .+? is already running/);
    });

    it('exposes current executionId and extensions when running', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="Definition_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:js="http://paed01.github.io/bpmn-engine/schema/2017/08/bpmn">
        <process id="theProcess" isExecutable="true" js:versionTag="0.0.1" js:candidateStarterUsers="me">
          <userTask id="task" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, {
        extensions: {
          js: JsExtension
        },
      });
      const bp = context.getProcessById('theProcess');
      expect(bp.behaviour).to.contain({
        versionTag: '0.0.1',
        candidateStarterUsers: 'me',
      });

      expect(bp.executionId).to.be.undefined;
      expect(bp.extensions).to.not.be.empty;

      bp.run();

      expect(bp.executionId).to.be.ok;
      expect(bp.extensions).to.not.be.empty;
    });
  });

  describe('stop()', () => {
    it('when executing sets stopped flag and cancels process broker consumers', () => {
      const bp = Process({id: 'theProcess'}, Context());

      bp.run();
      bp.stop();

      expect(bp).to.have.property('stopped', true);

      expect(bp.broker.getQueue('run-q')).to.have.property('consumerCount', 0);
      expect(bp.broker.getQueue('execution-q')).to.have.property('consumerCount', 0);
      expect(bp.broker.getQueue('format-run-q')).to.have.property('consumerCount', 0);
      expect(bp.broker.getExchange('api'), 'api exchange').to.have.property('bindingCount', 0);
      expect(bp.broker.getExchange('event'), 'event exchange').to.have.property('bindingCount', 0);
      expect(bp.broker, 'broker').to.have.property('consumerCount', 0);
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

    it('stop on process enter stops all running activities', (done) => {
      const bp = Process({id: 'theProcess'}, Context());

      bp.once('enter', () => {
        bp.stop();
      });

      bp.once('stop', () => {
        expect(bp.broker.getQueue('run-q')).to.have.property('consumerCount', 0);
        expect(bp.broker.getQueue('execution-q')).to.have.property('consumerCount', 0);
        expect(bp.broker.getQueue('format-run-q')).to.have.property('consumerCount', 0);
        expect(bp.broker.getExchange('api'), 'api exchange').to.have.property('bindingCount', 0);
        expect(bp.broker.getExchange('event'), 'event exchange').to.have.property('bindingCount', 0);
        expect(bp.broker, 'broker').to.have.property('consumerCount', 0);
        done();
      });

      bp.run();
    });

    it('stop on activity start stops all running activities', (done) => {
      const bp = Process({id: 'theProcess'}, Context());

      bp.once('activity.start', () => {
        bp.stop();
      });

      bp.once('stop', () => {
        expect(bp.execution.getActivities()).to.have.length(1);
        expect(bp.execution.getActivities()[0]).to.have.property('stopped', true);
        done();
      });

      bp.run();
    });

    it('publish stop event when all activities are stopped', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <userTask id="task1" />
          <userTask id="task2" />
          <userTask id="task3" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();
      const [task1, task2, task3] = bp.getActivities();

      const stop = bp.waitFor('stop');
      bp.run();

      expect(task1).to.have.property('isRunning', true);
      expect(task2).to.have.property('isRunning', true);
      expect(task3).to.have.property('isRunning', true);

      bp.stop();

      await stop;

      expect(task1).to.have.property('isRunning', false);
      expect(task2).to.have.property('isRunning', false);
      expect(task3).to.have.property('isRunning', false);
    });

    it('publish one stop event when stopped', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <userTask id="task1" />
          <userTask id="task2" />
          <userTask id="task3" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();

      let stopped;
      bp.on('stop', () => {
        if (stopped) throw new Error('already stopped');
        stopped = true;
      });
      bp.run();
      bp.stop();
    });

    it.skip('publish stop event when postponed start event is stopped', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start">
            <messageEventDefinition />
          </startEvent>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();
      const [start] = bp.getActivities();

      const stop = bp.waitFor('stop');
      bp.run();

      expect(start).to.have.property('isRunning', true);

      bp.stop();

      await stop;

      expect(start).to.have.property('isRunning', false);
    });

    it('publish stop event when boundaryEvent with event definitions is stopped', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <userTask id="task1" />
          <boundaryEvent id="bound" attachedToRef="task1">
            <messageEventDefinition />
            <timerEventDefinition>
              <timeDuration>PT1H</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();
      const [task1, bound] = bp.getActivities();

      const stop = bp.waitFor('stop');
      bp.run();

      expect(task1).to.have.property('isRunning', true);
      expect(bound).to.have.property('isRunning', true);

      bp.stop();

      await stop;

      expect(task1).to.have.property('isRunning', false);
      expect(bound).to.have.property('isRunning', false);
    });

    it('emit stop event when all activities are stopped', async () => {
      const context = await multiContext();
      const [bp] = context.getProcesses();
      const [start, task1, task2, task3] = bp.getActivities();

      expect(start, start.id).to.have.property('id', 'start');
      expect(task1, task1.id).to.have.property('id', 'task1');
      expect(task2, task2.id).to.have.property('id', 'task2');
      expect(task3, task3.id).to.have.property('id', 'subProcess');

      const stop = new Promise((resolve) => {
        bp.once('stop', () => {
          expect(start, start.id).to.have.property('isRunning', false);
          expect(task1, task1.id).to.have.property('isRunning', false);
          expect(task2, task2.id).to.have.property('isRunning', false);
          expect(task3, task3.id).to.have.property('isRunning', false);
          resolve();
        });
      });

      bp.run();

      expect(start, start.id).to.have.property('isRunning', false);
      expect(start, start.id).to.have.property('counters').with.property('taken', 1);
      expect(task1, task1.id).to.have.property('isRunning', true);
      expect(task2, task2.id).to.have.property('isRunning', true);
      expect(task3, task3.id).to.have.property('isRunning', true);

      bp.stop();

      await stop;
    });

    it('publish stop event when all subProcess activities are stopped', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <subProcess id="subProcess">
            <userTask id="task1" />
            <userTask id="task2" />
            <userTask id="task3" />
          </subProcess>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();
      const [subProcess] = bp.getActivities();

      const stop = bp.waitFor('stop');
      bp.run();

      const [task1, task2, task3] = subProcess.execution.source.execution.getActivities();

      expect(task1).to.have.property('isRunning', true);
      expect(task2).to.have.property('isRunning', true);
      expect(task3).to.have.property('isRunning', true);

      bp.stop();

      await stop;

      expect(task1).to.have.property('isRunning', false);
      expect(task2).to.have.property('isRunning', false);
      expect(task3).to.have.property('isRunning', false);
    });
  });

  describe('getState()', () => {
    it('returns expected state when not running', () => {
      const bp = Process({id: 'theProcess'}, Context());

      const state = bp.getState();

      expect(state.status).to.be.undefined;
      expect(state.broker).to.not.be.ok;
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

  describe('recover(state)', () => {
    it('throws if called when process is running', () => {
      const bp = Process({id: 'theProcess'}, Context());
      bp.run();

      const state = bp.getState();

      expect(() => {
        bp.recover(state);
      }).to.throw('cannot recover running process');
    });

    it('returns process if called without state', () => {
      const bp = Process({id: 'theProcess'}, Context());
      expect(bp === bp.recover()).to.be.true;
    });
  });

  describe('resume()', () => {
    it('resumes with dangling sequence flow error', async () => {
      const source = factory.resource('resume_error.bpmn');
      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();

      bp.on('activity.start', (api) => {
        if (api.type === 'bpmn:UserTask') {
          bp.once('activity.wait', () => bp.stop());
        }
      });

      bp.run();

      bp.resume();

      bp.getPostponed().forEach(p => {
        if (p.type === 'bpmn:UserTask') {
          p.signal();
        }
      });

      bp.resume();

      bp.getPostponed().forEach(p => {
        if (p.type === 'bpmn:UserTask') {
          p.signal();
        }
      });
    });

    it('resumes after stopped', async () => {
      const bp = Process({id: 'theProcess'}, Context());

      bp.run();
      bp.stop();

      expect(bp.resume()).to.equal(bp);

      bp.getPostponed()[0].signal();

      expect(bp.counters).to.have.property('completed', 1);
    });

    it('resumes with stopped state', async () => {
      const bp1 = Process({id: 'theProcess'}, Context());

      bp1.run();
      bp1.stop();

      const bp2 = Process({id: 'theProcess'}, Context());
      bp2.recover(bp1.getState());

      bp2.resume();

      bp2.getPostponed()[0].signal();

      expect(bp2.counters).to.have.property('completed', 1);
    });

    it('resumes with running state', async () => {
      const bp1 = Process({id: 'theProcess'}, Context());

      bp1.run();

      const bp2 = Process({id: 'theProcess'}, Context());
      bp2.recover(bp1.getState());

      bp2.resume();

      bp2.getPostponed()[0].signal();

      expect(bp2.counters).to.have.property('completed', 1);
    });

    it('resumes on enter', async () => {
      const bp1 = Process({id: 'theProcess'}, Context());
      bp1.once('enter', (api) => {
        api.stop();
      });

      bp1.run();

      const bp2 = Process({id: 'theProcess'}, Context());
      bp2.recover(bp1.getState());

      bp2.resume();

      bp2.getPostponed()[0].signal();

      expect(bp2.counters).to.have.property('completed', 1);
    });

    it('resumes stopped recovered on enter', async () => {
      const bp1 = Process({id: 'theProcess'}, Context());
      bp1.once('enter', (api) => {
        api.stop();
      });

      bp1.run();

      const bp2 = Process({id: 'theProcess'}, Context());
      bp2.recover(bp1.getState());

      bp2.resume();

      bp2.getPostponed()[0].signal();

      expect(bp2.counters).to.have.property('completed', 1);
    });

    it('resumes stopped recovered on start', async () => {
      const bp1 = Process({id: 'theProcess'}, Context());
      bp1.once('start', (api) => {
        api.stop();
      });

      bp1.run();

      const bp2 = Process({id: 'theProcess'}, Context());
      bp2.recover(bp1.getState());

      bp2.resume();

      bp2.getPostponed()[0].signal();

      expect(bp2.counters).to.have.property('completed', 1);
    });

    it('resumes on start state', async () => {
      const bp1 = Process({id: 'theProcess'}, Context());
      let state;
      bp1.once('enter', () => {
        state = bp1.getState();
      });

      bp1.run();

      const bp2 = Process({id: 'theProcess'}, Context());
      bp2.recover(state);

      bp2.resume();

      bp2.getPostponed()[0].signal();

      expect(bp2.counters).to.have.property('completed', 1);
    });

    it('resumes stopped recovered on end', async () => {
      const bp1 = Process({id: 'theProcess'}, Context());
      const stopped = bp1.waitFor('stop');
      bp1.once('end', (api) => {
        api.stop();
      });

      bp1.run();
      bp1.getPostponed()[0].signal();

      await stopped;

      const bp2 = Process({id: 'theProcess'}, Context());
      bp2.recover(bp1.getState());

      bp2.resume();

      expect(bp2.counters).to.have.property('completed', 1);
    });

    it('resumes stopped recovered on activity event', async () => {
      const bp1 = Process({id: 'theProcess'}, Context());
      bp1.once('wait', (api) => {
        api.stop();
      });

      bp1.run();
      expect(bp1.counters).to.have.property('completed', 0);

      const bp2 = Process({id: 'theProcess'}, Context());
      bp2.recover(JSON.parse(JSON.stringify(bp1.getState())));

      bp2.resume();

      bp2.getPostponed()[0].signal();

      expect(bp2.counters).to.have.property('completed', 1);
    });

    it('throws if called while process is running', () => {
      const bp = Process({id: 'theProcess'}, Context());
      bp.run();

      expect(() => {
        bp.resume();
      }).to.throw('cannot resume running process');
    });

    it('ignored if never started', () => {
      const bp = Process({id: 'theProcess'}, Context());
      bp.broker.subscribeTmp('event', '#', () => {
        throw new Error('Shouldn´t happen');
      });
      expect(bp.resume()).to.equal(bp);
    });

    it('ignored if completed', () => {
      const bp = Process({id: 'theProcess'}, Context());

      bp.on('wait', (activityApi) => {
        activityApi.signal();
      });

      bp.run();

      expect(bp.counters).to.have.property('completed', 1);

      bp.broker.subscribeTmp('event', '#', () => {
        throw new Error('Shouldn´t happen');
      });
      expect(bp.resume()).to.equal(bp);
    });
  });

  describe('getPostponed()', () => {
    let context;
    beforeEach(async () => {
      context = await multiContext();
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

    it('still returns executing activities if stopped', () => {
      const [bp] = context.getProcesses();
      bp.run();

      let postponed = bp.getPostponed();
      expect(postponed[0].id).to.equal('task1');
      expect(postponed[1].id).to.equal('task2');
      expect(postponed[2].id).to.equal('subProcess');
      expect(postponed).to.have.length(3);

      bp.stop();

      postponed = bp.getPostponed();

      expect(postponed[0].id).to.equal('task1');
      expect(postponed[0].owner).to.have.property('stopped', true);
      expect(postponed[1].id).to.equal('task2');
      expect(postponed[1].owner).to.have.property('stopped', true);
      expect(postponed[2].id).to.equal('subProcess');
      expect(postponed[2].owner).to.have.property('stopped', true);
      expect(postponed).to.have.length(3);
    });

    it('returns executing activities when recovered and resumed', () => {
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

    it('looped activity returns root task', async () => {
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
      expect(activities[0].content.parent).to.have.property('id', 'theProcess');
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

    it('events with event definitions return root event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start">
            <messageEventDefinition />
            <messageEventDefinition />
            <messageEventDefinition />
          </startEvent>
        </process>
      </definitions>`;

      const [bp] = (await testHelpers.context(source)).getProcesses();

      bp.run();

      const activities = bp.getPostponed();
      expect(activities).to.have.length(1);
      expect(activities[0].id).to.equal('start');
      expect(activities[0].content.parent).to.have.property('id', 'theProcess');
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

    it('stop process stops sub process', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="subProcess" />
          <subProcess id="subProcess">
            <userTask id="task1" />
          </subProcess>
          <sequenceFlow id="flow3" sourceRef="subProcess" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();

      const stop = bp.waitFor('stop');
      bp.on('activity.start', ({id}) => {
        if (id === 'subProcess') bp.stop();
      });
      bp.run();

      await stop;
      expect(bp.getActivityById('subProcess')).to.have.property('isRunning', false);
    });

    it('stop process on sub task wait stops sub process', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="subProcess" />
          <subProcess id="subProcess">
            <userTask id="task1" />
          </subProcess>
          <sequenceFlow id="flow3" sourceRef="subProcess" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();

      const stop = bp.waitFor('stop');
      let task;
      bp.on('activity.wait', (api) => {
        if (api.id === 'task1') {
          bp.stop();
          task = api.owner;
        }
      });
      bp.run();

      await stop;
      expect(bp.getActivityById('subProcess')).to.have.property('isRunning', false);
      expect(task).to.have.property('isRunning', false);
      expect(task).to.have.property('stopped', true);
    });

    it('stop and resume process continues sub process execution', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="subProcess" />
          <subProcess id="subProcess">
            <userTask id="task1" />
          </subProcess>
          <sequenceFlow id="flow3" sourceRef="subProcess" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();
      const subProcess = bp.getActivityById('subProcess');

      const stop = bp.waitFor('stop');
      bp.on('activity.start', ({id}) => {
        if (id === subProcess.id) {
          bp.broker.cancel('_test-tag');
          bp.stop();
        }
      }, {consumerTag: '_test-tag'});

      bp.run();

      await stop;

      const wait = bp.waitFor('wait');
      const leave = bp.waitFor('leave');
      bp.resume();

      (await wait).signal();

      await leave;

      expect(subProcess).to.have.property('isRunning', false);
    });

    it('stop and resume process with subProcess with timeout event continues execution', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="subProcess" />
          <subProcess id="subProcess">
            <userTask id="task1" />
            <boundaryEvent id="timeoutEvent" attachedToRef="task1">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT0.1S</timeDuration>
              </timerEventDefinition>
            </boundaryEvent>
          </subProcess>
          <sequenceFlow id="flow3" sourceRef="subProcess" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();
      const subProcess = bp.getActivityById('subProcess');

      const stop = bp.waitFor('stop');
      bp.on('activity.start', ({id}) => {
        if (id === subProcess.id) {
          bp.broker.cancel('_test-tag');
          bp.stop();
        }
      }, {consumerTag: '_test-tag'});

      bp.run();

      await stop;

      expect(subProcess.execution.source.execution).to.have.property('isRunning', false);
      const subTask = subProcess.execution.source.execution.getActivityById('task1');
      const subEvent = subProcess.execution.source.execution.getActivityById('timeoutEvent');

      expect(subTask, subTask.id).to.have.property('isRunning', false);
      expect(subEvent, subEvent.id).to.have.property('isRunning', false);

      const wait = bp.waitFor('wait');
      const leave = bp.waitFor('leave');
      bp.resume();

      (await wait).signal();

      await leave;

      expect(subProcess).to.have.property('isRunning', false);
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

    it('emits api that exposes getPostponed', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <manualTask id="task" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();

      const errored = new Promise((resolve) => {
        bp.on('error', () => {
          resolve(bp.getApi().getPostponed());
        });
      });

      bp.on('wait', (api) => {
        api.fail({
          error: new Error('thrown in wait'),
        });
      });

      bp.run();

      const postponed = await errored;
      expect(postponed).to.have.length(1);

      expect(postponed[0]).to.have.property('id', 'task');
      expect(postponed[0]).to.have.property('executionId');
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

  describe('sendMessage(message)', () => {
    let bp;
    beforeEach('setup proc', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start">
            <messageEventDefinition />
          </startEvent>
          <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
          <userTask id="task" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      [bp] = context.getProcesses();
    });

    it('starts process if message content target id is found', () => {
      bp.sendMessage({
        fields: {},
        content: {
          id: 'messageFlow',
          target: {id: 'start'},
        },
        properties: {}
      });

      expect(bp.isRunning).to.be.true;
    });

    it('is ignored if message content target id is not found', () => {
      bp.sendMessage({
        fields: {},
        content: {
          id: 'messageFlow',
          target: {id: 'start2'},
        },
        properties: {}
      });

      expect(bp.isRunning).to.be.false;
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

      expect(bp.counters).to.have.property('discarded', 1);
    });

    it('emits error on flow condition TypeError', async () => {
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
            <conditionExpression xsi:type="tFormalExpression" language="javascript"><![CDATA[
            next(null, this.supported.unsupported);
            ]]></conditionExpression>
          </sequenceFlow>
          <sequenceFlow id="flow3" sourceRef="decision" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression" language="javascript"><![CDATA[
            next(null, this.supported.unsupported);
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
      expect(errors[0]).to.match(/TypeError.+unsupported/);
    });

    it('emits error if script handler throws', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <scriptTask id="task" scriptFormat="coffeescript">
            <script>
              <![CDATA[
                if true then next() else next(new Error("tea"))
              ]]>
            </script>
          </scriptTask>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, {
        scripts: {
          register() {},
          getScript(scriptFormat, activity) {
            if (scriptFormat !== 'javascript') return activity.emitFatal(new ActivityError('unsupported'));
          }
        }
      });
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

    it('emits error if service was not defined', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="task" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      context.environment.settings.enableDummyService = false;
      const bp = context.getProcessById('theProcess');

      const errors = [];
      bp.once('error', (err) => {
        errors.push(err);
      });

      bp.run();

      expect(errors).to.have.length(1);
      expect(errors[0]).to.be.instanceof(Error);
      expect(errors[0].message).to.match(/service not defined/);
    });
  });

  describe('waitFor()', () => {
    it('returns promise that resolves when event occur', async () => {
      const bp = Process({id: 'theProcess'}, testHelpers.emptyContext());

      const leave = bp.waitFor('leave');

      bp.run();

      return leave;
    });

    it('rejects if process error is published', (done) => {
      const bp = Process({id: 'theProcess'}, testHelpers.emptyContext());

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
      const bp = Process({id: 'theProcess'}, Context());

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
});

function Context() {
  const context = testHelpers.emptyContext();

  let activities;
  context.getActivities = () => {
    return activities || (activities = [SignalTask({
      id: 'task',
      type: 'bpmn:ManualTask',
      Behaviour: SignalTask,
      parent: {
        id: 'theProcess',
      },
    }, context)]);
  };
  context.getActivityById = (id) => {
    return activities.find((a) => a.id === id);
  };

  return context;
}

function multiContext() {
  const source = `
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="theProcess" isExecutable="true">
      <startEvent id="start" />
      <sequenceFlow id="flow1" sourceRef="start" targetRef="task1" />
      <sequenceFlow id="flow2" sourceRef="start" targetRef="task2" />
      <sequenceFlow id="flow3" sourceRef="start" targetRef="subProcess" />
      <userTask id="task1" />
      <userTask id="task2" />
      <subProcess id="subProcess">
        <userTask id="task3" />
      </subProcess>
      <sequenceFlow id="flow4" sourceRef="task1" targetRef="end" />
      <sequenceFlow id="flow5" sourceRef="task2" targetRef="end" />
      <sequenceFlow id="flow6" sourceRef="subProcess" targetRef="end" />
      <endEvent id="end" />
    </process>
  </definitions>`;

  return testHelpers.context(source);
}
