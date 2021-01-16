import Definition from '../../src/definition/Definition';
import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';

Feature('Issues', () => {
  Scenario('Multiple discard loop back', () => {
    let definition;
    Given('a source with two user tasks in sequence ending up in two succeeding decisions with loopback', async () => {
      const context = await testHelpers.context(factory.resource('engine-issue-73.bpmn'));
      definition = Definition(context);
    });

    let leave, wait;
    When('definition is ran', () => {
      leave = definition.waitFor('leave');
      wait = definition.waitFor('wait');
      definition.run();
    });

    let userApi, task1;
    Then('first user task waits for signal', async () => {
      userApi = await wait;
      task1 = userApi.owner;
    });

    When('signaled', () => {
      wait = definition.waitFor('wait');
      userApi.signal();
    });

    let task2;
    Then('second user task waits for signal', async () => {
      userApi = await wait;
      task2 = userApi.owner;
    });

    When('signaled', () => {
      wait = definition.waitFor('wait');
      userApi.signal();
    });

    Then('first user task waits for signal again', async () => {
      userApi = await wait;
    });

    When('discarded', () => {
      wait = definition.waitFor('wait');
      userApi.discard();
    });

    Then('definition completes', () => {
      return leave;
    });

    And('first user task is taken once and discarded twice', () => {
      expect(task1.counters).to.have.property('taken', 1);
      expect(task1.counters).to.have.property('discarded', 2);
    });

    And('second user task is taken once and discarded twice', () => {
      expect(task2.counters).to.have.property('taken', 1);
      expect(task2.counters).to.have.property('discarded', 2);
    });

    And('first decision is taken once and discarded once since discard loop prevents more', () => {
      const decision = definition.getActivityById('decision1');
      expect(decision.counters).to.have.property('taken', 1);
      expect(decision.counters).to.have.property('discarded', 1);
    });

    And('second decision is discarded twice', () => {
      const decision = definition.getActivityById('decision2');
      expect(decision.counters).to.have.property('taken', 0);
      expect(decision.counters).to.have.property('discarded', 2);
    });

    And('end event is discarded four times', () => {
      const decision = definition.getActivityById('end');
      expect(decision.counters).to.have.property('taken', 0);
      expect(decision.counters).to.have.property('discarded', 4);
    });
  });

  Scenario('Recovered loopback flows', () => {
    let context, definition, state;

    const extensions = {
      saveAllOutputToEnvironmentExtension,
    };

    function saveAllOutputToEnvironmentExtension(activity, {environment}) {
      activity.on('end', (api) => {
        environment.output[api.id] = api.content.output;
      });
    }

    function onWaitHandler(def) {
      return function onWait(api) {
        if (api.owner.counters.taken === 0) {
          api.signal({isIterationOne: true});
        } else if (api.owner.counters.taken === 1) {
          if (!api.content.isRecovered) {
            state = def.getState();
            def.stop();
          } else {
            api.signal({isIterationTwo: true});
          }
        } else if (api.owner.counters.taken === 2) {
          api.signal();
        }
      };
    }

    Given('an usertask ending up in decision with two loopback flows each taken once and an end event', async () => {
      context = await testHelpers.context(factory.resource('engine-issue-73_2.bpmn'));
      definition = Definition(context, {extensions});
    });

    let stopped;
    When('definition is ran and state is saved on second usertask wait', () => {
      stopped = definition.waitFor('stop');
      definition.on('wait', onWaitHandler(definition));
      definition.run();
    });

    Then('definition stops', () => {
      return stopped;
    });

    let recovered, completed;
    When('resumed', () => {
      recovered = Definition(context.clone(), {extensions}).recover(state);
      completed = recovered.waitFor('leave');
      stopped = recovered.waitFor('stop');
      recovered.on('wait', onWaitHandler(recovered));
      recovered.resume();
    });

    Then('run completes', () => {
      return completed;
    });

    let usertask;
    And('usertask is taken thrice', () => {
      usertask = recovered.getActivityById('usertask');
      expect(usertask.counters).to.have.property('taken', 3);
    });

    And('discarded 4 times', () => {
      expect(usertask.counters).to.have.property('discarded', 4);
    });

    And('end event is taken once and discarded twice', () => {
      const endEvent = recovered.getActivityById('end');
      expect(endEvent.counters).to.have.property('taken', 1);
      expect(endEvent.counters).to.have.property('discarded', 2);
    });
  });

  Scenario('Save state on wait - engine issue #105', () => {
    let source1, source2, source3;
    before(() => {
      source1 = factory.resource('engine-issue-105_1.bpmn');
      source2 = factory.resource('engine-issue-105_2.bpmn');
      source3 = `<?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Definition_GeneralFlow" targetNamespace="http://bpmn.io/schema/bpmn" exporter="Camunda Modeler" exporterVersion="4.1.1">
        <bpmn:process id="Process_GeneralFlow_3" isExecutable="true">
          <bpmn:startEvent id="Start" name="Start">
            <bpmn:outgoing>Flow1</bpmn:outgoing>
          </bpmn:startEvent>
          <bpmn:endEvent id="End" name="End">
            <bpmn:incoming>FlowFalse2</bpmn:incoming>
            <bpmn:incoming>FlowLater</bpmn:incoming>
          </bpmn:endEvent>
          <bpmn:serviceTask id="Task2" name="Task2" implementation="\${environment.services.doTask2}">
            <bpmn:incoming>FlowTrue1</bpmn:incoming>
            <bpmn:incoming>Flow1</bpmn:incoming>
            <bpmn:outgoing>Flow3</bpmn:outgoing>
          </bpmn:serviceTask>
          <bpmn:userTask id="UserTask" name="UserTask">
            <bpmn:incoming>FlowFirst</bpmn:incoming>
            <bpmn:outgoing>Flow4</bpmn:outgoing>
          </bpmn:userTask>
          <bpmn:exclusiveGateway id="Gateway1" name="Gateway1">
            <bpmn:incoming>Flow3</bpmn:incoming>
            <bpmn:outgoing>FlowFirst</bpmn:outgoing>
            <bpmn:outgoing>FlowLater</bpmn:outgoing>
          </bpmn:exclusiveGateway>
          <bpmn:exclusiveGateway id="Gateway2" name="Gateway2">
            <bpmn:incoming>Flow4</bpmn:incoming>
            <bpmn:outgoing>FlowFalse2</bpmn:outgoing>
            <bpmn:outgoing>FlowTrue1</bpmn:outgoing>
          </bpmn:exclusiveGateway>
          <bpmn:sequenceFlow id="Flow1" name="Flow1" sourceRef="Start" targetRef="Task2" />
          <bpmn:sequenceFlow id="Flow3" name="Flow3" sourceRef="Task2" targetRef="Gateway1" />
          <bpmn:sequenceFlow id="Flow4" name="Flow4" sourceRef="UserTask" targetRef="Gateway2" />
          <bpmn:sequenceFlow id="FlowFirst" name="FlowFirst" sourceRef="Gateway1" targetRef="UserTask">
            <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(null, this.environment.variables.passTask2&gt;=0)</bpmn:conditionExpression>
          </bpmn:sequenceFlow>
          <bpmn:sequenceFlow id="FlowLater" name="FlowLater" sourceRef="Gateway1" targetRef="End">
            <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(null, this.environment.variables.passTask2&lt;0)</bpmn:conditionExpression>
          </bpmn:sequenceFlow>
          <bpmn:sequenceFlow id="FlowFalse2" name="FlowFalse2" sourceRef="Gateway2" targetRef="End">
            <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(null, false)</bpmn:conditionExpression>
          </bpmn:sequenceFlow>
          <bpmn:sequenceFlow id="FlowTrue1" name="FlowTrue1" sourceRef="Gateway2" targetRef="Task2">
            <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(null, true)</bpmn:conditionExpression>
          </bpmn:sequenceFlow>
        </bpmn:process>
      </bpmn:definitions>`;
    });

    describe('first source', () => {
      let context, definition, options;
      const states = [];
      Given('one service, two exclusive gateways, one user task with save state extension, and one loopback flow', async () => {
        context = await testHelpers.context(source1);
        options = {
          services: {
            async doTask1(scope, callback) {
              await sleep(50); // calling other heavy service...
              return callback(null);
            },
            async doTask2(scope, callback) {
              await sleep(50); // calling other heavy service...
              scope.environment.variables.passTask2--;
              return callback(null);
            },
          },
          extensions: {
            listenUserTask(activity) {
              if (activity.id !== 'UserTask') return;

              activity.on('wait', async (api) => {
                api.owner.logger.debug('##### log state immediately in wait');
                states.push(JSON.stringify(await definition.getState()));
              });
            },
          }
        };

        definition = Definition(context, {
          variables: {
            passTask2: 1
          },
          ...options,
        });

        function sleep(msec) {
          return new Promise((resolve) => {
            setTimeout(resolve, msec);
          });
        }
      });

      let leave, wait;
      When('definition is ran', () => {
        leave = definition.waitFor('leave');
        wait = definition.waitFor('wait');

        definition.run();
      });

      let userApi;
      Then('user task waits for signal', async () => {
        userApi = await wait;
      });

      When('signaled', () => {
        userApi.signal();
      });

      Then('definition execution completes', () => {
        return leave;
      });

      And('user task was discarded once', () => {
        const task = definition.getActivityById('UserTask');
        expect(task.counters).to.have.property('taken', 1);
        expect(task.counters).to.have.property('discarded', 1);
      });

      And('end was discarded thrice', () => {
        const task = definition.getActivityById('End');
        expect(task.counters).to.have.property('taken', 1);
        expect(task.counters).to.have.property('discarded', 3);
      });

      Given('variables are reset', () => {
        definition.environment.variables.passTask2 = 1;
      });

      When('definition is ran again', () => {
        wait = definition.waitFor('wait');
        definition.run();
      });

      Then('user task waits for signal again', () => {
        return wait;
      });

      Given('run is stopped', () => {
        definition.stop();
      });

      When('definition is resumed', () => {
        wait = definition.waitFor('wait');
        leave = definition.waitFor('leave');

        definition.resume();
      });

      Then('resumed user task waits for signal', async () => {
        userApi = await wait;
      });

      When('signaled', () => {
        userApi.signal();
      });

      Then('resumed definition execution completes', () => {
        return leave;
      });

      And('user task was discarded twice', () => {
        const task = definition.getActivityById('UserTask');
        expect(task.counters).to.have.property('taken', 2);
        expect(task.counters).to.have.property('discarded', 2);
      });

      And('end was discarded six times', () => {
        const task = definition.getActivityById('End');
        expect(task.counters).to.have.property('taken', 2);
        expect(task.counters).to.have.property('discarded', 6);
      });

      When('definition is recovered with state from first run user task wait', () => {
        definition = Definition(context.clone(), {...options});
        definition.recover(JSON.parse(states[0]));
      });

      And('resumed', () => {
        leave = definition.waitFor('leave');
        wait = definition.waitFor('wait');

        let count = 0;
        definition.broker.subscribeTmp('event', 'activity.discard', (_, msg) => {
          if (msg.content.id === 'UserTask') {
            if (count++ > 3) {
              throw new Error('Into infinity');
            }
          }
        }, {noAck: true});

        definition.resume();
      });

      Then('user task waits for signal again', async () => {
        userApi = await wait;
      });

      When('signaled', () => {
        userApi.signal();
      });

      Then('recovered definition execution completes', () => {
        return leave;
      });

      And('user task was discarded once', () => {
        const task = definition.getActivityById('UserTask');
        expect(task.counters).to.have.property('taken', 1);
        expect(task.counters).to.have.property('discarded', 1);
      });

      And('end was discarded thrice', () => {
        const task = definition.getActivityById('End');
        expect(task.counters).to.have.property('taken', 1);
        expect(task.counters).to.have.property('discarded', 3);
      });
    });

    describe('second source', () => {
      let context, definition, state, options;
      Given('two services, two exclusive gateways, one user task with save state extension, and multiple loopback flows', async () => {
        context = await testHelpers.context(source2);
        options = {
          services: {
            async doTask1(scope, callback) {
              await sleep(50); // calling other heavy service...
              return callback(null);
            },
            async doTask2(scope, callback) {
              await sleep(50); // calling other heavy service...
              scope.environment.variables.passTask2--;
              return callback(null);
            },
          },
          extensions: {
            listenUserTask(activity) {
              if (activity.id !== 'UserTask') return;
              activity.on('wait', async (api) => {
                api.owner.logger.debug('##### log state immediately in wait');
                state = JSON.stringify(await definition.getState());
              });
            },
          }
        };

        definition = Definition(context, {
          variables: {
            passTask2: 1
          },
          ...options,
        });

        function sleep(msec) {
          return new Promise((resolve) => {
            setTimeout(resolve, msec);
          });
        }
      });

      let leave, wait;
      When('definition is ran', () => {
        leave = definition.waitFor('leave');
        wait = definition.waitFor('wait');

        definition.run();
      });

      let userApi;
      Then('user task waits for signal', async () => {
        userApi = await wait;
      });

      When('signaled', () => {
        userApi.signal();
      });

      Then('definition execution completes', () => {
        return leave;
      });

      And('user task was discarded twice', () => {
        const task = definition.getActivityById('UserTask');
        expect(task.counters).to.have.property('taken', 1);
        expect(task.counters).to.have.property('discarded', 2);
      });

      When('definition is recovered with state from wait', () => {
        definition = Definition(context.clone(), options);
        definition.recover(JSON.parse(state));
      });

      And('resumed', () => {
        leave = definition.waitFor('leave');
        wait = definition.waitFor('wait');

        let count = 0;
        definition.broker.subscribeTmp('event', 'activity.discard', (_, msg) => {
          if (msg.content.id === 'UserTask') {
            if (count++ > 3) {
              throw new Error('Into infinity');
            }
          }
        }, {noAck: true});

        definition.resume();
      });

      Then('user task waits for signal again', async () => {
        userApi = await wait;
      });

      When('signaled', () => {
        userApi.signal();
      });

      Then('resumed definition execution completes', () => {
        return leave;
      });

      And('user task was discarded twice', () => {
        const task = definition.getActivityById('UserTask');
        expect(task.counters).to.have.property('taken', 1);
        expect(task.counters).to.have.property('discarded', 2);
      });
    });

    describe('first source with shuffled flows', () => {
      let context, definition, options;
      const states = [];
      Given('one service, two exclusive gateways, one user task with save state extension, and one loopback flow', async () => {
        context = await testHelpers.context(source3);
        options = {
          services: {
            async doTask1(scope, callback) {
              await sleep(50); // calling other heavy service...
              return callback(null);
            },
            async doTask2(scope, callback) {
              await sleep(50); // calling other heavy service...
              scope.environment.variables.passTask2--;
              return callback(null);
            },
          },
          extensions: {
            listenUserTask(activity) {
              if (activity.id !== 'UserTask') return;

              activity.on('wait', async (api) => {
                api.owner.logger.debug('##### log state immediately in wait');
                states.push(JSON.stringify(await definition.getState()));
              });
            },
          }
        };

        definition = Definition(context, {
          variables: {
            passTask2: 1
          },
          ...options,
        });

        function sleep(msec) {
          return new Promise((resolve) => {
            setTimeout(resolve, msec);
          });
        }
      });

      let leave, wait;
      When('definition is ran', () => {
        leave = definition.waitFor('leave');
        wait = definition.waitFor('wait');

        definition.run();
      });

      let userApi;
      Then('user task waits for signal', async () => {
        userApi = await wait;
      });

      When('signaled', () => {
        userApi.signal();
      });

      Then('definition execution completes', () => {
        return leave;
      });

      And('user task was discarded once', () => {
        const task = definition.getActivityById('UserTask');
        expect(task.counters).to.have.property('taken', 1);
        expect(task.counters).to.have.property('discarded', 1);
      });

      And('end was discarded thrice', () => {
        const task = definition.getActivityById('End');
        expect(task.counters).to.have.property('taken', 1);
        expect(task.counters).to.have.property('discarded', 3);
      });

      Given('variables are reset', () => {
        definition.environment.variables.passTask2 = 1;
      });

      When('definition is ran again', () => {
        wait = definition.waitFor('wait');
        definition.run();
      });

      Then('user task waits for signal again', () => {
        return wait;
      });

      Given('run is stopped', () => {
        definition.stop();
      });

      When('definition is resumed', () => {
        wait = definition.waitFor('wait');
        leave = definition.waitFor('leave');

        definition.resume();
      });

      Then('resumed user task waits for signal', async () => {
        userApi = await wait;
      });

      When('signaled', () => {
        userApi.signal();
      });

      Then('resumed definition execution completes', () => {
        return leave;
      });

      And('user task was discarded twice', () => {
        const task = definition.getActivityById('UserTask');
        expect(task.counters).to.have.property('taken', 2);
        expect(task.counters).to.have.property('discarded', 2);
      });

      And('end was discarded six times', () => {
        const task = definition.getActivityById('End');
        expect(task.counters).to.have.property('taken', 2);
        expect(task.counters).to.have.property('discarded', 6);
      });

      When('definition is recovered with state from first run user task wait', () => {
        definition = Definition(context.clone(), {...options});
        definition.recover(JSON.parse(states[0]));
      });

      And('resumed', () => {
        leave = definition.waitFor('leave');
        wait = definition.waitFor('wait');

        let count = 0;
        definition.broker.subscribeTmp('event', 'activity.discard', (_, msg) => {
          if (msg.content.id === 'UserTask') {
            if (count++ > 3) {
              throw new Error('Into infinity');
            }
          }
        }, {noAck: true});

        definition.resume();
      });

      Then('user task waits for signal again', async () => {
        userApi = await wait;
      });

      When('signaled', () => {
        userApi.signal();
      });

      Then('recovered definition execution completes', () => {
        return leave;
      });

      And('user task was discarded once', () => {
        const task = definition.getActivityById('UserTask');
        expect(task.counters).to.have.property('taken', 1);
        expect(task.counters).to.have.property('discarded', 1);
      });

      And('end was discarded thrice', () => {
        const task = definition.getActivityById('End');
        expect(task.counters).to.have.property('taken', 1);
        expect(task.counters).to.have.property('discarded', 3);
      });

      Given('definition is ran again', () => {
        states.splice(0);
        definition = Definition(context.clone(), {...options, variables: {passTask2: 1}});
        wait = definition.waitFor('wait');
        definition.run();
      });

      When('user task is waiting', () => {
        return wait;
      });

      let state;
      Then('state was saved', () => {
        expect(states).to.have.length(1);
        state = JSON.parse(states[0]);
      });

      And('end event was not discarded yet', () => {
        expect(state.execution.processes[0].execution.children.find(({id}) => id === 'End').counters).to.deep.equal({taken: 0, discarded: 0});
      });

      When('definition is recovered with state', () => {
        definition = Definition(context.clone(), {...options});
        definition.recover(state);
      });

      Then('end event is still not discarded', () => {
        expect(definition.getActivityById('End').counters).to.deep.equal({taken: 0, discarded: 0});
      });

      When('definition is resumed', () => {
        definition.resume();
      });

      Then('end event is discarded once', () => {
        expect(definition.getActivityById('End').counters).to.deep.equal({taken: 0, discarded: 1});
      });
    });
  });

  Scenario('engine issue 125', () => {
    let context;
    Given('fork two user tasks and then join', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Issue_125" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="parallel" isExecutable="true">
          <startEvent id="start" name="START" />
          <sequenceFlow id="to-fork" sourceRef="start" targetRef="fork" />
          <parallelGateway id="fork" name="FORK" />
          <sequenceFlow id="to-a" sourceRef="fork" targetRef="A" />
          <sequenceFlow id="to-b" sourceRef="fork" targetRef="B" />
          <sequenceFlow id="from-a" sourceRef="A" targetRef="join" />
          <parallelGateway id="join" name="JOIN" />
          <sequenceFlow id="from-b" sourceRef="B" targetRef="join" />
          <userTask id="A" name="A" />
          <userTask id="B" name="B" />
          <sequenceFlow id="to-end" sourceRef="join" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    let definition, state;
    When('run and then stop', () => {
      definition = Definition(context);
      definition.run();
      definition.stop();

      state = definition.getState();
    });

    Then('user tasks are in waiting', () => {
      const postponed = definition.getPostponed();
      expect(postponed).to.have.length(2);
      expect(postponed[0].id).to.equal('A');
      expect(postponed[1].id).to.equal('B');
    });

    When('recovered and resumed', () => {
      definition = Definition(context);
      definition.recover(state);
      definition.resume();
    });

    Then('user tasks are still waiting', () => {
      const postponed = definition.getPostponed();
      expect(postponed).to.have.length(2);
      expect(postponed[0].id).to.equal('A');
      expect(postponed[1].id).to.equal('B');
    });

    When('first user task is signaled', () => {
      definition.signal({id: 'A'});
    });

    And('run is stopped', () => {
      definition.stop();
      state = definition.getState();
    });

    Then('second user task is waiting', () => {
      const postponed = definition.getPostponed();
      expect(postponed.find(({id}) => id === 'B')).to.be.ok;
    });

    When('recovered and resumed', () => {
      definition = Definition(context);
      definition.recover(state);
      definition.resume();
    });

    Then('second user task is still waiting', () => {
      const postponed = definition.getPostponed();
      expect(postponed.find(({id}) => id === 'B')).to.be.ok;
    });

    When('second user task is signaled', () => {
      definition.signal({id: 'B'});
    });

    Then('run completes', () => {
      expect(definition.isRunning).to.be.false;
      expect(definition.counters).to.deep.equal({
        completed: 1,
        discarded: 0,
      });
    });

    And('all activities where taken accordingly', () => {
      expect(definition.getActivityById('start').counters).to.deep.equal({
        taken: 1,
        discarded: 0,
      });
      expect(definition.getActivityById('fork').counters).to.deep.equal({
        taken: 1,
        discarded: 0,
      });
      expect(definition.getActivityById('A').counters).to.deep.equal({
        taken: 1,
        discarded: 0,
      });
      expect(definition.getActivityById('B').counters).to.deep.equal({
        taken: 1,
        discarded: 0,
      });
      expect(definition.getActivityById('join').counters).to.deep.equal({
        taken: 1,
        discarded: 0,
      });
      expect(definition.getActivityById('end').counters).to.deep.equal({
        taken: 1,
        discarded: 0,
      });
    });
  });
});
