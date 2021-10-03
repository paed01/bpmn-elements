import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';
import Definition from '../../src/definition/Definition';

Feature('Call activity', () => {
  Scenario('Call process in the same diagram', () => {
    let definition;
    Given('a process with a call activity referencing a process', async () => {
      const context = await testHelpers.context(factory.resource('call-activity.bpmn'));
      definition = Definition(context);
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('call activity was taken', () => {
      expect(definition.getActivityById('call-activity').counters).to.have.property('taken', 1);
    });
  });

  Scenario('called process throws', () => {
    let definition;
    Given('a process with a call activity referencing a process that throws', async () => {
      const source = `
      <definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="main-process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-call-activity" sourceRef="start" targetRef="call-activity" />
          <callActivity id="call-activity" calledElement="called-process" />
          <endEvent id="end" />
          <sequenceFlow id="to-end" sourceRef="call-activity" targetRef="end" />
        </process>
        <process id="called-process" isExecutable="false">
          <serviceTask id="task" implementation="\${environment.services.serviceFn}" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, {
        services: {
          serviceFn(...args) {
            args.pop()(new Error('No cigarr'));
          },
        },
      });
      definition = Definition(context);
    });

    let endInError;
    When('ran', () => {
      endInError = definition.waitFor('error');
      definition.run();
    });

    Then('run fails', () => {
      return endInError;
    });

    Given('a process with a call activity with bound error handling referencing a process that throws', async () => {
      const source = `
      <definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="main-process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-call-activity" sourceRef="start" targetRef="call-activity" />
          <callActivity id="call-activity" calledElement="called-process" />
          <boundaryEvent id="bound" attachedToRef="call-activity">
            <errorEventDefinition />
          </boundaryEvent>
          <sequenceFlow id="to-end" sourceRef="call-activity" targetRef="end" />
          <endEvent id="end" />
          <sequenceFlow id="to-failend" sourceRef="bound" targetRef="failedend" />
          <endEvent id="failedend" />
        </process>
        <process id="called-process" isExecutable="false">
          <serviceTask id="task" implementation="\${environment.services.serviceFn}" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, {
        services: {
          serviceFn(...args) {
            args.pop()(new Error('No cigarr'));
          },
        },
      });
      definition = Definition(context);
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('bound activity was taken', () => {
      expect(definition.getActivityById('bound').counters).to.have.property('taken', 1);
    });
  });

  Scenario('call activity is canceled', () => {
    let definition;
    Given('a process with a call activity referencing a process that throws', async () => {
      const source = `
      <definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="main-process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-call-activity" sourceRef="start" targetRef="call-activity" />
          <callActivity id="call-activity" calledElement="called-process" />
          <endEvent id="end" />
          <sequenceFlow id="to-end" sourceRef="call-activity" targetRef="end" />
        </process>
        <process id="called-process" isExecutable="false">
          <userTask id="task" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = Definition(context);
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('call activity has started process', () => {
      expect(definition.getRunningProcesses()).to.have.length(2);
    });

    When('call activity is cancelled', () => {
      const callActivity = definition.getPostponed()[0];
      callActivity.cancel();
    });

    Then('run completes', () => {
      return end;
    });

    When('ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('call activity has started process', () => {
      expect(definition.getRunningProcesses()).to.have.length(2);
    });

    When('called process is discarded', () => {
      definition.getRunningProcesses()[1].getApi().discard();
    });

    Then('run completes', () => {
      return end;
    });
  });

  Scenario('a process with a parallel multi-instance call activity with cardinality of three', () => {
    let context, definition;
    const serviceCalls = [];
    Given('a process', async () => {
      const source = `
      <definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="main-process" isExecutable="true">
          <startEvent id="start" />
          <callActivity id="call-activity" calledElement="called-process">
            <multiInstanceLoopCharacteristics isSequential="false">
              <loopCardinality>3</loopCardinality>
            </multiInstanceLoopCharacteristics>
          </callActivity>
          <endEvent id="end" />
          <sequenceFlow id="to-end" sourceRef="call-activity" targetRef="end" />
          <sequenceFlow id="to-call-activity" sourceRef="start" targetRef="call-activity" />
        </process>
        <process id="called-process" isExecutable="false">
          <serviceTask id="task" implementation="\${environment.services.serviceFn}" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source, {
        services: {
          serviceFn(...args) {
            serviceCalls.push(args);
          },
        },
        extensions: {
          processOutput: {
            extension: processOutput,
          },
        },
      });

      definition = Definition(context);
    });

    let leave;
    When('ran', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('multi-instance is waiting to complete', () => {
      expect(serviceCalls).to.have.length(3);
    });

    And('executable process is running', () => {
      expect(definition.getProcesses().filter(({id}) => id === 'main-process')).to.have.length(1);
    });

    And('three instances of called process are running with unique execution ids', () => {
      const called = definition.getProcesses().filter(({id}) => id === 'called-process');
      expect(called).to.have.length(3);

      called.map(({executionId}) => executionId).forEach((bpExecId) => {
        expect(called.filter(({executionId}) => executionId === bpExecId), bpExecId + ' reused').to.have.length(1);
      });
    });

    When('multi-instance completes', () => {
      serviceCalls.forEach((args, idx) => args.pop()(null, idx + 1));
    });

    Then('run completes', () => {
      return leave;
    });

    And('only the executable process is saved', () => {
      expect(definition.execution.processes).to.have.length(1);
    });

    And('call activity has output from called process', () => {
      expect(definition.getActivityById('call-activity').counters).to.have.property('taken', 1);
      expect(definition.getProcessById('main-process').environment.output).to.deep.equal({
        'call-activity': [{
          task: 1
        }, {
          task: 2
        }, {
          task: 3
        }]
      });
    });

    When('ran again', () => {
      serviceCalls.splice(0);
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('multi-instance is waiting to complete', () => {
      expect(serviceCalls).to.have.length(3);
    });

    let state;
    Given('stopped', () => {
      definition.stop();
      state = definition.getState();
      serviceCalls.splice(0);
    });

    When('resumed', () => {
      leave = definition.waitFor('leave');
      definition.resume();
    });

    Then('multi-instance is waiting to complete', () => {
      expect(serviceCalls).to.have.length(3);
    });

    When('multi-instance completes', () => {
      serviceCalls.forEach((args, idx) => args.pop()(null, idx + 10));
    });

    Then('run completes', () => {
      return leave;
    });

    And('only the executable process is saved', () => {
      expect(definition.execution.processes).to.have.length(1);
    });

    And('call activity has output from called process', () => {
      expect(definition.getActivityById('call-activity').counters).to.have.property('taken', 2);
      expect(definition.getProcessById('main-process').environment.output).to.deep.equal({
        'call-activity': [{
          task: 10
        }, {
          task: 11
        }, {
          task: 12
        }]
      });
    });

    Given('recovered from stopped', () => {
      definition = Definition(context.clone()).recover(state);
    });

    And('has four running processes', () => {
      expect(definition.execution.processes).to.have.length(4);
    });

    When('resumed', () => {
      serviceCalls.splice(0);
      leave = definition.waitFor('leave');
      definition.resume();
    });

    Then('multi-instance is waiting to complete', () => {
      expect(serviceCalls).to.have.length(3);
    });

    When('multi-instance completes', () => {
      serviceCalls.forEach((args, idx) => args.pop()(null, idx + 20));
    });

    Then('run completes', () => {
      return leave;
    });

    And('call activity has output from called process', () => {
      expect(definition.getProcessById('main-process').environment.output).to.deep.equal({
        'call-activity': [{
          task: 20
        }, {
          task: 21
        }, {
          task: 22
        }]
      });
    });
  });

  Scenario('a process with a parallel multi-instance call activity referencing process with two user tasks', () => {
    let context, definition;
    Given('a process', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="main-process" isExecutable="true">
          <startEvent id="start" />
          <callActivity id="call-activity" calledElement="called-process">
            <multiInstanceLoopCharacteristics isSequential="false">
              <loopCardinality>3</loopCardinality>
            </multiInstanceLoopCharacteristics>
          </callActivity>
          <endEvent id="end" />
          <sequenceFlow id="to-end" sourceRef="call-activity" targetRef="end" />
          <sequenceFlow id="to-call-activity" sourceRef="start" targetRef="call-activity" />
        </process>
        <process id="called-process" isExecutable="false">
          <userTask id="task1" />
          <sequenceFlow id="to-task2" sourceRef="task1" targetRef="task2" />
          <userTask id="task2" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source, {
        extensions: {
          processOutput: {
            extension: processOutput,
          },
        },
      });

      definition = Definition(context);
    });

    let leave;
    When('ran', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    let postponed;
    Then('user tasks are waiting', () => {
      postponed = definition.getPostponed();
      expect(postponed).to.have.length(4);
      expect(postponed[0]).to.have.property('id', 'call-activity');
      expect(postponed[1]).to.have.property('id', 'task1');
      expect(postponed[2]).to.have.property('id', 'task1');
      expect(postponed[3]).to.have.property('id', 'task1');
    });

    When('first user task is signaled by id', () => {
      definition.signal({id: 'task1', message: 'first'});
    });

    Then('second user task in all called processes are waiting', () => {
      postponed = definition.getPostponed();
      expect(postponed).to.have.length(4);
      expect(postponed[0]).to.have.property('id', 'call-activity');
      expect(postponed[1]).to.have.property('id', 'task2');
      expect(postponed[2]).to.have.property('id', 'task2');
      expect(postponed[3]).to.have.property('id', 'task2');
    });

    When('second user task is signaled by id', () => {
      definition.signal({id: 'task2', message: 'second'});
    });

    Then('run completes', () => {
      return leave;
    });

    And('only the executable process is saved', () => {
      expect(definition.execution.processes).to.have.length(1);
    });

    And('call activity has output from called process', () => {
      expect(definition.getActivityById('call-activity').counters).to.have.property('taken', 1);
      expect(definition.getProcessById('main-process').environment.output).to.deep.equal({
        'call-activity': [{
          task1: 'first',
          task2: 'second',
        }, {
          task1: 'first',
          task2: 'second',
        }, {
          task1: 'first',
          task2: 'second',
        }]
      });
    });

    When('ran again', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('multi-instance is waiting to complete', () => {
      postponed = definition.getPostponed();
      expect(postponed).to.have.length(4);
    });

    When('first iteration user task is signaled by execution id', () => {
      definition.signal({executionId: postponed[1].executionId, message: '#1 first'});
    });

    Then('second user task in first called process is waiting', () => {
      postponed = definition.getPostponed();
      expect(postponed).to.have.length(4);
      expect(postponed[0]).to.have.property('id', 'call-activity');
      expect(postponed[1]).to.have.property('id', 'task2');
      expect(postponed[2]).to.have.property('id', 'task1');
      expect(postponed[3]).to.have.property('id', 'task1');
    });

    When('first iteration second user task is signaled by execution id', () => {
      definition.signal({executionId: postponed[1].executionId, message: '#1 second'});
    });

    Then('first iteration completes', () => {
      postponed = definition.getPostponed();
      expect(postponed).to.have.length(3);
      expect(postponed[0]).to.have.property('id', 'call-activity');
      expect(postponed[1]).to.have.property('id', 'task1');
      expect(postponed[2]).to.have.property('id', 'task1');
    });

    When('second iteration user task is signaled by execution id', () => {
      definition.signal({executionId: postponed[1].executionId, message: '#2 first'});
    });

    Then('second user task in first called process is waiting', () => {
      postponed = definition.getPostponed();
      expect(postponed).to.have.length(3);
      expect(postponed[0]).to.have.property('id', 'call-activity');
      expect(postponed[1]).to.have.property('id', 'task2');
      expect(postponed[2]).to.have.property('id', 'task1');
    });

    let state;
    Given('stopped', () => {
      definition.stop();
      state = definition.getState();
    });

    When('resumed', () => {
      leave = definition.waitFor('leave');
      definition.resume();
    });

    Then('multi-instance is waiting to complete', () => {
      postponed = definition.getPostponed();
      expect(postponed).to.have.length(3);
      expect(postponed[0]).to.have.property('id', 'call-activity');
      expect(postponed[1]).to.have.property('id', 'task2');
      expect(postponed[2]).to.have.property('id', 'task1');
    });

    When('tasks are signaled', () => {
      definition.signal({id: 'task1', message: 'all first'});
      definition.signal({id: 'task2', message: 'all second'});
    });

    Then('run completes', () => {
      return leave;
    });

    And('only the executable process is saved', () => {
      expect(definition.execution.processes).to.have.length(1);
    });

    And('call activity has output from called process', () => {
      expect(definition.getActivityById('call-activity').counters).to.have.property('taken', 2);
      expect(definition.getProcessById('main-process').environment.output).to.deep.equal({
        'call-activity': [{
          task1: '#1 first',
          task2: '#1 second',
        }, {
          task1: '#2 first',
          task2: 'all second',
        }, {
          task1: 'all first',
          task2: 'all second',
        }]
      });
    });

    Given('recovered from stopped', () => {
      definition = Definition(context.clone()).recover(state);
    });

    And('has three running processes', () => {
      expect(definition.execution.processes).to.have.length(3);
    });

    When('resumed', () => {
      leave = definition.waitFor('leave');
      definition.resume();
    });

    Then('multi-instance is waiting to complete', () => {
      postponed = definition.getPostponed();
      expect(postponed).to.have.length(3);
      expect(postponed[0]).to.have.property('id', 'call-activity');
      expect(postponed[1]).to.have.property('id', 'task2');
      expect(postponed[2]).to.have.property('id', 'task1');
    });

    When('tasks are signaled', () => {
      definition.signal({id: 'task1', message: 'all first'});
      definition.signal({id: 'task2', message: 'all second'});
    });

    Then('run completes', () => {
      return leave;
    });

    And('call activity has output from called process', () => {
      expect(definition.getProcessById('main-process').environment.output).to.deep.equal({
        'call-activity': [{
          task1: '#1 first',
          task2: '#1 second',
        }, {
          task1: '#2 first',
          task2: 'all second',
        }, {
          task1: 'all first',
          task2: 'all second',
        }]
      });
    });
  });

  Scenario('a process with a call activity referencing unknown process', () => {
    let definition;
    Given('a process', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="Process_1" isExecutable="true">
          <startEvent id="start" />
          <callActivity id="call-activity" calledElement="called-process" />
          <endEvent id="end" />
          <sequenceFlow id="to-end" sourceRef="call-activity" targetRef="end" />
          <sequenceFlow id="to-call-activity" sourceRef="start" targetRef="call-activity" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = Definition(context);
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    let activity;
    Then('call activity is waiting', () => {
      activity = definition.getPostponed()[0];
      expect(activity).to.have.property('id', 'call-activity');
    });

    When('call activity is signaled', () => {
      definition.signal({
        executionId: activity.content.executionId,
      });
    });

    Then('run completes', () => {
      return end;
    });
  });
});

function processOutput(elm) {
  if (elm.type === 'bpmn:Definitions') return;

  if (elm.type === 'bpmn:Process') {
    elm.on('activity.end', (api) => {
      if (!('output' in api.content)) return;
      api.environment.output[api.id] = api.content.output;
    });
  } else {
    elm.on('activity.execution.completed', (api) => {
      if (!('output' in api.content)) return;

      let output = api.content.output;
      if (api.type === 'bpmn:ServiceTask') {
        output = output[0];
      } else if (api.type === 'bpmn:UserTask') {
        output = output.message;
      } else if (Array.isArray(output)) {
        output = output.map((r) => {
          if ('output' in r) return r.output;
          return r;
        });
      }
      elm.broker.getQueue('format-run-q').queueMessage({routingKey: 'run.format.end'}, {output});
    });
  }
}
