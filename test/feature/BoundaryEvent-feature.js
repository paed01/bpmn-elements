import testHelpers from '../helpers/testHelpers.js';

Feature('BoundaryEvent', () => {
  Scenario('task with boundary event followed by a join', () => {
    let bp;
    Given('a process', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="toTask" sourceRef="start" targetRef="task" />
          <task id="task" />
          <boundaryEvent id="bound" attachedToRef="task" cancelActivity="true" />
          <sequenceFlow id="toJoinFromTask" sourceRef="task" targetRef="join" />
          <sequenceFlow id="toJoinFromBoundary" sourceRef="bound" targetRef="join" />
          <parallelGateway id="join" />
          <sequenceFlow id="toEnd" sourceRef="join" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      [bp] = context.getProcesses();
    });

    let end;
    When('ran', () => {
      end = bp.waitFor('end');
      bp.run();
    });

    Then('process completes', () => {
      return end;
    });
  });

  Scenario('user task with interrupting boundary event followed by a join', () => {
    let bp;
    Given('a process', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="toTask" sourceRef="start" targetRef="task" />
          <userTask id="task" />
          <boundaryEvent id="bound" attachedToRef="task" cancelActivity="true">
            <messageEventDefinition />
          </boundaryEvent>
          <sequenceFlow id="toJoinFromTask" sourceRef="task" targetRef="join" />
          <sequenceFlow id="toJoinFromBoundary" sourceRef="bound" targetRef="join" />
          <parallelGateway id="join" />
          <sequenceFlow id="toEnd" sourceRef="join" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      [bp] = context.getProcesses();
    });

    let end;
    When('ran', () => {
      end = bp.waitFor('end');
      bp.run();
    });

    let bound;
    And('boundary event is taken', () => {
      [bound] = bp.getPostponed((e) => e.id === 'bound');
      bound.signal();
    });

    Then('process completes', () => {
      return end;
    });

    And('bound was taken', () => {
      expect(bound.owner.counters).to.have.property('taken', 1);
    });

    And('user task was discarded', () => {
      expect(bp.getActivityById('task').counters).to.have.property('discarded', 1);
    });

    And('join was taken', () => {
      expect(bp.getActivityById('join').counters).to.have.property('taken', 1);
    });

    And('end was taken', () => {
      expect(bp.getActivityById('end').counters).to.have.property('taken', 1);
    });

    Given('process is ran again', () => {
      end = bp.waitFor('end');
      bp.run();
    });

    let task;
    When('task is taken', () => {
      [task] = bp.getPostponed((e) => e.id === 'task');
      task.signal();
    });

    And('bound was discarded', () => {
      expect(bound.owner.counters).to.have.property('taken', 1);
      expect(bound.owner.counters).to.have.property('discarded', 1);
    });

    And('user task was taken', () => {
      expect(bp.getActivityById('task').counters).to.have.property('discarded', 1);
      expect(bp.getActivityById('task').counters).to.have.property('taken', 1);
    });

    And('join was taken', () => {
      expect(bp.getActivityById('join').counters).to.have.property('taken', 2);
    });

    And('end was taken', () => {
      expect(bp.getActivityById('end').counters).to.have.property('taken', 2);
    });
  });

  Scenario('user task with non-interrupting boundary event followed by a join', () => {
    let bp;
    Given('a process', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="toTask" sourceRef="start" targetRef="task" />
          <userTask id="task" />
          <boundaryEvent id="bound" attachedToRef="task" cancelActivity="false">
            <messageEventDefinition />
          </boundaryEvent>
          <sequenceFlow id="toJoinFromTask" sourceRef="task" targetRef="join" />
          <sequenceFlow id="toJoinFromBoundary" sourceRef="bound" targetRef="join" />
          <parallelGateway id="join" />
          <sequenceFlow id="toEnd" sourceRef="join" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      [bp] = context.getProcesses();
    });

    let end;
    When('ran', () => {
      end = bp.waitFor('end');
      bp.run();
    });

    let bound;
    And('boundary event is taken', () => {
      [bound] = bp.getPostponed((e) => e.id === 'bound');
      bound.signal();
    });

    Then('process is still running', () => {
      expect(bp.isRunning).to.be.true;
    });

    And('bound was taken', () => {
      expect(bound.owner.counters).to.have.property('taken', 1);
    });

    let task;
    And('task is pending', () => {
      [task] = bp.getPostponed((e) => e.id === 'task');
      expect(task.owner.counters).to.have.property('taken', 0);
      expect(task.owner.counters).to.have.property('discarded', 0);
    });

    When('user task is taken', () => {
      task.signal();
    });

    Then('process completes', () => {
      return end;
    });

    And('user task was taken', () => {
      expect(bp.getActivityById('task').counters).to.have.property('taken', 1);
    });

    And('join was taken', () => {
      expect(bp.getActivityById('join').counters).to.have.property('taken', 1);
    });

    And('end was taken', () => {
      expect(bp.getActivityById('end').counters).to.have.property('taken', 1);
    });

    Given('process is ran again', () => {
      end = bp.waitFor('end');
      bp.run();
    });

    When('task is taken', () => {
      [task] = bp.getPostponed((e) => e.id === 'task');
      task.signal();
    });

    Then('process completes', () => {
      return end;
    });

    And('bound was discarded', () => {
      expect(bound.owner.counters).to.have.property('taken', 1);
      expect(bound.owner.counters).to.have.property('discarded', 1);
    });

    And('user task was taken', () => {
      expect(bp.getActivityById('task').counters).to.have.property('discarded', 0);
      expect(bp.getActivityById('task').counters).to.have.property('taken', 2);
    });

    And('join was taken', () => {
      expect(bp.getActivityById('join').counters).to.have.property('taken', 2);
    });

    And('end was taken', () => {
      expect(bp.getActivityById('end').counters).to.have.property('taken', 2);
    });
  });

  Scenario('loopback', () => {
    let bp;
    Given('an init task and a user task with interrupting boundary event with loopback flow to init task', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="toInit" sourceRef="start" targetRef="initTask" />
          <task id="initTask" />
          <sequenceFlow id="toTask" sourceRef="initTask" targetRef="task" />
          <userTask id="task" />
          <sequenceFlow id="toEnd" sourceRef="task" targetRef="end" />
          <boundaryEvent id="bound" attachedToRef="task" cancelActivity="true">
            <messageEventDefinition />
          </boundaryEvent>
          <sequenceFlow id="backToInit" sourceRef="bound" targetRef="initTask" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      [bp] = context.getProcesses();
    });

    When('ran', () => {
      bp.run();
    });

    let initTask;
    Then('init task is taken', () => {
      initTask = bp.getActivityById('initTask');
      expect(initTask.counters).to.have.property('taken', 1);
    });

    let bound;
    When('boundary event is taken', () => {
      [bound] = bp.getPostponed((e) => e.id === 'bound');
      bound.signal();
    });

    Then('user task was discarded', () => {
      expect(bp.getActivityById('task').counters).to.have.property('discarded', 1);
    });

    And('bound was taken', () => {
      expect(bound.owner.counters).to.have.property('taken', 1);
    });

    And('init task was taken again', () => {
      expect(initTask.counters).to.have.property('taken', 2);
    });

    And('end was discarded', () => {
      expect(bp.getActivityById('end').counters).to.have.property('discarded', 1);
      expect(bp.getActivityById('end').counters).to.have.property('taken', 0);
    });

    let task;
    And('user task is waiting for signal again', () => {
      [task] = bp.getPostponed((e) => e.id === 'task');
      expect(task).to.be.ok;
    });

    let end;
    When('task is taken', () => {
      end = bp.waitFor('end');
      task.signal();
    });

    Then('bound was discarded', () => {
      expect(bound.owner.counters).to.have.property('taken', 1);
      expect(bound.owner.counters).to.have.property('discarded', 1);
    });

    And('init task is discarded', () => {
      expect(initTask.counters).to.have.property('discarded', 1);
      expect(initTask.counters).to.have.property('taken', 2);
    });

    And('user task was taken', () => {
      expect(bp.getActivityById('task').counters).to.have.property('taken', 1);
      expect(bp.getActivityById('task').counters).to.have.property('discarded', 1);
    });

    And('end was taken', () => {
      expect(bp.getActivityById('end').counters).to.have.property('taken', 1);
      expect(bp.getActivityById('end').counters).to.have.property('discarded', 1);
    });

    And('process completes', () => {
      expect(bp.counters).to.have.property('completed', 1);
      return end;
    });
  });

  Scenario('catch an error from service task', () => {
    let bp, serviceCallback;
    Given('a service task with error catching boundary event both ending up in a join', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="toTask" sourceRef="start" targetRef="task" />
          <serviceTask id="task" implementation="\${environment.services.volatile}" />
          <boundaryEvent id="bound" attachedToRef="task">
            <errorEventDefinition />
          </boundaryEvent>
          <sequenceFlow id="toJoinFromTask" sourceRef="task" targetRef="join" />
          <sequenceFlow id="toJoinFromBoundary" sourceRef="bound" targetRef="join" />
          <parallelGateway id="join" />
          <sequenceFlow id="toEnd" sourceRef="join" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      context.environment.addService('volatile', (ctx, next) => {
        serviceCallback = next;
      });
      [bp] = context.getProcesses();
    });

    When('ran', () => {
      bp.run();
    });

    let task;
    Then('service task is waiting for service to complete', () => {
      [task] = bp.getPostponed((e) => e.id === 'task');
      expect(task).to.be.ok;
      expect(serviceCallback).to.be.a('function');
    });

    let bound;
    And('boundary event is listening for errors', () => {
      [bound] = bp.getPostponed((e) => e.id === 'bound');
      expect(bound).to.be.ok;
    });

    let end;
    When('service calls callback', () => {
      end = bp.waitFor('end');
      serviceCallback();
    });

    Then('service task is taken', () => {
      expect(task.owner.counters).to.have.property('taken', 1);
    });

    And('bound was discarded', () => {
      expect(bound.owner.counters).to.have.property('discarded', 1);
      expect(bound.owner.counters).to.have.property('taken', 0);
    });

    And('join was taken', () => {
      expect(bp.getActivityById('join').counters).to.have.property('taken', 1);
    });

    And('end was taken', () => {
      expect(bp.getActivityById('end').counters).to.have.property('taken', 1);
    });

    And('process completed', () => {
      expect(bp.counters).to.have.property('completed', 1);
      return end;
    });

    When('process is ran again', () => {
      bp.run();
    });

    Then('service task is waiting for service to complete', () => {
      [task] = bp.getPostponed((e) => e.id === 'task');
      expect(task).to.be.ok;
      expect(serviceCallback).to.be.a('function');
    });

    And('boundary event is listening for errors', () => {
      [bound] = bp.getPostponed((e) => e.id === 'bound');
      expect(bound).to.be.ok;
    });

    When('service fails', () => {
      end = bp.waitFor('end');
      serviceCallback(new Error('volatile'));
    });

    Then('service task is discarded', () => {
      expect(task.owner.counters).to.have.property('discarded', 1);
      expect(task.owner.counters).to.have.property('taken', 1);
    });

    And('bound event is taken', () => {
      expect(bound.owner.counters).to.have.property('taken', 1);
      expect(bound.owner.counters).to.have.property('discarded', 1);
    });

    And('join is taken again', () => {
      expect(bp.getActivityById('join').counters).to.have.property('taken', 2);
    });

    And('end is taken again', () => {
      expect(bp.getActivityById('end').counters).to.have.property('taken', 2);
    });

    And('process completes again', () => {
      expect(bp.counters).to.have.property('completed', 2);
      return end;
    });
  });

  Scenario('catch error from sub process', () => {
    let bp, serviceCallback;
    Given('a sub process with a bound catch error event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="toTask" sourceRef="start" targetRef="task" />
          <subProcess id="task">
            <startEvent id="startSub" />
            <sequenceFlow id="toService" sourceRef="startSub" targetRef="service" />
            <serviceTask id="service" implementation="\${environment.services.volatile}" />
            <sequenceFlow id="toEndSub" sourceRef="service" targetRef="endSub" />
            <endEvent id="endSub" />
          </subProcess>
          <boundaryEvent id="bound" attachedToRef="task">
            <errorEventDefinition />
          </boundaryEvent>
          <sequenceFlow id="toJoinFromTask" sourceRef="task" targetRef="join" />
          <sequenceFlow id="toJoinFromBoundary" sourceRef="bound" targetRef="join" />
          <parallelGateway id="join" />
          <sequenceFlow id="toEnd" sourceRef="join" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      context.environment.addService('volatile', (ctx, next) => {
        serviceCallback = next;
      });
      [bp] = context.getProcesses();
    });

    When('ran', () => {
      bp.run();
    });

    let task;
    Then('sub process is waiting for service to complete', () => {
      [task] = bp.getPostponed((e) => e.id === 'task');
      expect(task).to.be.ok;
      expect(serviceCallback).to.be.a('function');
    });

    let bound;
    And('boundary event is listening for errors', () => {
      [bound] = bp.getPostponed((e) => e.id === 'bound');
      expect(bound).to.be.ok;
    });

    let end;
    When('sub process service calls callback', () => {
      end = bp.waitFor('end');
      serviceCallback();
    });

    Then('sub process task is taken', () => {
      expect(task.owner.counters).to.have.property('taken', 1);
    });

    And('bound was discarded', () => {
      expect(bound.owner.counters).to.have.property('discarded', 1);
      expect(bound.owner.counters).to.have.property('taken', 0);
    });

    And('join was taken', () => {
      expect(bp.getActivityById('join').counters).to.have.property('taken', 1);
    });

    And('end was taken', () => {
      expect(bp.getActivityById('end').counters).to.have.property('taken', 1);
    });

    And('process completed', () => {
      expect(bp.counters).to.have.property('completed', 1);
      return end;
    });

    When('process is ran again', () => {
      bp.run();
    });

    Then('service task is waiting for service to complete', () => {
      [task] = bp.getPostponed((e) => e.id === 'task');
      expect(task).to.be.ok;
      expect(serviceCallback).to.be.a('function');
    });

    And('boundary event is listening for errors', () => {
      [bound] = bp.getPostponed((e) => e.id === 'bound');
      expect(bound).to.be.ok;
    });

    When('service fails', () => {
      end = bp.waitFor('end');
      serviceCallback(new Error('volatile'));
    });

    Then('service task is discarded', () => {
      expect(task.owner.counters).to.have.property('discarded', 1);
      expect(task.owner.counters).to.have.property('taken', 1);
    });

    And('bound event is taken', () => {
      expect(bound.owner.counters).to.have.property('taken', 1);
      expect(bound.owner.counters).to.have.property('discarded', 1);
    });

    And('join is taken again', () => {
      expect(bp.getActivityById('join').counters).to.have.property('taken', 2);
    });

    And('end is taken again', () => {
      expect(bp.getActivityById('end').counters).to.have.property('taken', 2);
    });

    And('process completes again', () => {
      expect(bp.counters).to.have.property('completed', 2);
      return end;
    });
  });

  Scenario('catch an error from multi instance service task', () => {
    let bp;
    const serviceCallbacks = [];
    Given('a service task looped three times with error catching boundary event both ending up in a join', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="toTask" sourceRef="start" targetRef="task" />
          <serviceTask id="task" implementation="\${environment.services.volatile}">
            <multiInstanceLoopCharacteristics isSequential="false">
              <loopCardinality>3</loopCardinality>
            </multiInstanceLoopCharacteristics>
          </serviceTask>
          <boundaryEvent id="bound" attachedToRef="task">
            <errorEventDefinition />
          </boundaryEvent>
          <sequenceFlow id="toJoinFromTask" sourceRef="task" targetRef="join" />
          <sequenceFlow id="toJoinFromBoundary" sourceRef="bound" targetRef="join" />
          <parallelGateway id="join" />
          <sequenceFlow id="toEnd" sourceRef="join" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      context.environment.addService('volatile', (ctx, next) => {
        serviceCallbacks.push(next);
      });
      [bp] = context.getProcesses();
    });

    When('ran', () => {
      bp.run();
    });

    let task;
    Then('service task is waiting for service to complete', () => {
      [task] = bp.getPostponed((e) => e.id === 'task');
      expect(task).to.be.ok;
      expect(serviceCallbacks).to.have.length(3);
    });

    let bound;
    And('boundary event is listening for errors', () => {
      [bound] = bp.getPostponed((e) => e.id === 'bound');
      expect(bound).to.be.ok;
    });

    let end;
    When('service iteration 1 calls callback with an error', () => {
      end = bp.waitFor('end');
      serviceCallbacks[1](new Error('Type 1'));
    });

    Then('service task is discarded', () => {
      expect(task.owner.counters).to.have.property('discarded', 1);
      expect(task.owner.counters).to.have.property('taken', 0);
    });

    And('bound event is taken', () => {
      expect(bound.owner.counters).to.have.property('taken', 1);
      expect(bound.owner.counters).to.have.property('discarded', 0);
    });

    And('join is taken', () => {
      expect(bp.getActivityById('join').counters).to.have.property('taken', 1);
    });

    And('end is taken', () => {
      expect(bp.getActivityById('end').counters).to.have.property('taken', 1);
    });

    And('process completes', () => {
      expect(bp.counters).to.have.property('completed', 1);
      return end;
    });
  });

  Scenario('catch an error from multi instance sub process task', () => {
    let bp;
    const serviceCallbacks = [];
    Given('a service task looped three times with error catching boundary event both ending up in a join', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="toTask" sourceRef="start" targetRef="task" />
          <subProcess id="task">
            <multiInstanceLoopCharacteristics isSequential="false">
              <loopCardinality>3</loopCardinality>
            </multiInstanceLoopCharacteristics>
            <serviceTask id="service" implementation="\${environment.services.volatile}" />
          </subProcess>
          <boundaryEvent id="bound" attachedToRef="task">
            <errorEventDefinition />
          </boundaryEvent>
          <sequenceFlow id="toJoinFromTask" sourceRef="task" targetRef="join" />
          <sequenceFlow id="toJoinFromBoundary" sourceRef="bound" targetRef="join" />
          <parallelGateway id="join" />
          <sequenceFlow id="toEnd" sourceRef="join" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      context.environment.addService('volatile', (ctx, next) => {
        serviceCallbacks.push(next);
      });
      [bp] = context.getProcesses();
    });

    When('ran', () => {
      bp.run();
    });

    let task;
    Then('sub process is waiting for service to complete', () => {
      [task] = bp.getPostponed((e) => e.id === 'task');
      expect(task).to.be.ok;
      expect(serviceCallbacks).to.have.length(3);
    });

    let bound;
    And('boundary event is listening for errors', () => {
      [bound] = bp.getPostponed((e) => e.id === 'bound');
      expect(bound).to.be.ok;
    });

    let end;
    When('service iteration 1 calls callback with an error', () => {
      end = bp.waitFor('end');
      serviceCallbacks[1](new Error('Type 1'));
    });

    Then('service task is discarded', () => {
      expect(task.owner.counters).to.have.property('discarded', 1);
      expect(task.owner.counters).to.have.property('taken', 0);
    });

    And('bound event is taken', () => {
      expect(bound.owner.counters).to.have.property('taken', 1);
      expect(bound.owner.counters).to.have.property('discarded', 0);
    });

    And('join is taken', () => {
      expect(bp.getActivityById('join').counters).to.have.property('taken', 1);
    });

    And('end is taken', () => {
      expect(bp.getActivityById('end').counters).to.have.property('taken', 1);
    });

    And('process completes', () => {
      expect(bp.counters).to.have.property('completed', 1);
      return end;
    });
  });

  Scenario('user task with multiple boundary events', () => {
    let bp;
    Given('a process matching scenario', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
          <userTask id="task" />
          <boundaryEvent id="bound1" attachedToRef="task" cancelActivity="true">
            <messageEventDefinition />
          </boundaryEvent>
          <boundaryEvent id="bound2" attachedToRef="task" cancelActivity="true">
            <messageEventDefinition />
          </boundaryEvent>
          <boundaryEvent id="bound3" attachedToRef="task" cancelActivity="true">
            <messageEventDefinition />
          </boundaryEvent>
          <sequenceFlow id="from-task" sourceRef="task" targetRef="join" />
          <sequenceFlow id="from-bound1" sourceRef="bound1" targetRef="join" />
          <sequenceFlow id="from-bound2" sourceRef="bound2" targetRef="join" />
          <sequenceFlow id="from-bound3" sourceRef="bound3" targetRef="join" />
          <parallelGateway id="join" />
          <sequenceFlow id="to-end" sourceRef="join" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      [bp] = context.getProcesses();
    });

    let end;
    When('ran', () => {
      end = bp.waitFor('end');
      bp.run();
    });

    let postponed;
    Then('all boundary events are started', () => {
      postponed = bp.getPostponed();
      expect(postponed).to.have.length(4);
    });

    let bound;
    When('first boundary event is taken', () => {
      bound = postponed.find((e) => e.id === 'bound1');
      bound.signal();
    });

    Then('process completes', () => {
      return end;
    });

    And('bound was taken', () => {
      expect(bound.owner.counters).to.have.property('taken', 1);
    });

    And('user task was discarded', () => {
      expect(bp.getActivityById('task').counters).to.have.property('discarded', 1);
    });

    And('join was taken', () => {
      expect(bp.getActivityById('join').counters).to.have.property('taken', 1);
    });

    And('end was taken', () => {
      expect(bp.getActivityById('end').counters).to.have.property('taken', 1);
    });

    Given('process is ran again', () => {
      end = bp.waitFor('end');
      bp.run();
    });

    let task;
    When('task is taken', () => {
      [task] = bp.getPostponed((e) => e.id === 'task');
      task.signal();
    });

    And('bound was discarded', () => {
      expect(bound.owner.counters).to.have.property('taken', 1);
      expect(bound.owner.counters).to.have.property('discarded', 1);
    });

    And('user task was taken', () => {
      expect(bp.getActivityById('task').counters).to.have.property('discarded', 1);
      expect(bp.getActivityById('task').counters).to.have.property('taken', 1);
    });

    And('join was taken', () => {
      expect(bp.getActivityById('join').counters).to.have.property('taken', 2);
    });

    And('end was taken', () => {
      expect(bp.getActivityById('end').counters).to.have.property('taken', 2);
    });
  });
});
