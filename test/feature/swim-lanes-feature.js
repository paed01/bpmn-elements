import {Definition, Process, Activity, Lane} from '../../src/index.js';
import testHelpers from '../helpers/testHelpers.js';
import factory from '../helpers/factory.js';

const source = factory.resource('swimlanes.bpmn');
const noLanesSource = factory.resource('call-activity.bpmn');

Feature('Swim lanes', () => {
  Scenario('Two lanes with user tasks and sub process with task', () => {
    let context;
    When('context is created from source', async () => {
      context = await testHelpers.context(source);
    });

    Then('activity has parent element process and lane', () => {
      const task = context.getActivityById('fillform');
      const parentProcess = context.getProcesses()[0];
      const parentElement = task.parentElement;
      expect(parentElement).to.have.property('id', 'Process_1');
      expect(parentElement).to.have.property('behaviour').that.is.an('object').with.property('$type', 'bpmn:Process');
      expect(parentElement).to.be.instanceof(Process);

      expect(task.lane).to.be.ok.and.be.instanceof(Lane);

      expect(task.lane).to.have.property('id', 'customer-lane');
      expect(task.lane).to.have.property('type', 'bpmn:Lane');
      expect(task.lane).to.have.property('name', 'Customer');
      expect(task.lane).to.have.property('parent').that.deep.equal({id: 'Process_1', type: 'bpmn:Process'});
      expect(task.lane).to.have.property('behaviour').with.property('documentation');
      expect(task.lane).to.have.property('broker', parentProcess.broker);
      expect(task.lane).to.have.property('environment', parentProcess.environment);
      expect(task.lane).to.have.property('context', parentProcess.context);
      expect(task.lane).to.have.property('logger').that.is.ok;
      expect(task.lane).to.have.property('process', parentProcess);
    });

    And('sub process has parent element process and lane', () => {
      const task = context.getActivityById('sub');
      const parentElement = task.parentElement;
      expect(parentElement).to.have.property('id', 'Process_1');
      expect(parentElement).to.have.property('behaviour').that.is.an('object').with.property('$type', 'bpmn:Process');
      expect(parentElement).to.be.instanceof(Process);

      expect(task.lane).to.be.ok.and.be.instanceof(Lane);
    });

    And('sub process activity has parent element sub process but no lane', () => {
      const task = context.getActivityById('subtask');
      const parentElement = task.parentElement;
      expect(parentElement).to.have.property('id', 'sub');
      expect(parentElement).to.have.property('isSubProcess', true);
      expect(parentElement).to.be.instanceof(Activity);

      expect(task.lane).to.be.undefined;
    });

    let bp;
    And('process has two lanes', () => {
      bp = context.getProcesses()[0];
      expect(bp.lanes).to.be.ok.and.have.length(2);

      for (const lane of bp.lanes) {
        const laneInstance = bp.getLaneById(lane.id);
        expect(laneInstance === lane, lane.id + ' lane ref').to.be.true;
        expect(laneInstance.process === bp, lane.id + ' process ref').to.be.true;
      }
    });

    And('that can be fethed by id', () => {
      expect(bp.getLaneById('admin-lane')).to.be.ok;
    });

    But('missing lane id returns undefined', () => {
      expect(bp.getLaneById('outer-lane')).to.be.undefined;
    });

    let definition;
    When('definition is ran', () => {
      definition = new Definition(context);
      definition.run();
    });

    Then('run waits for user task belonging to first lane', () => {
      const [customerTaskApi] = definition.getPostponed();
      expect(customerTaskApi.content, 'api lane id').to.have.property('lane', 'customer-lane');
      expect(customerTaskApi.owner.lane, 'task lane').to.have.property('id', 'customer-lane');

      const [runningBp] = definition.getProcesses();
      expect(runningBp.getLaneById(customerTaskApi.content.lane) === customerTaskApi.owner.lane, 'same as process lane ref').to.be.true;
    });

    let state;
    Given('run is stopped and state is saved', () => {
      definition.stop();
      state = definition.getState();
    });

    let end;
    When('definition is recovered and resumed', () => {
      definition = new Definition(context.clone());
      definition.recover(state);

      end = definition.waitFor('end');
      definition.resume();
    });

    let taskApi;
    Then('run still waits for user task belonging to first lane', () => {
      taskApi = definition.getPostponed().shift();
      expect(taskApi.content, 'api lane id').to.have.property('lane', 'customer-lane');
      expect(taskApi.owner.lane, 'task lane').to.have.property('id', 'customer-lane');

      const [runningBp] = definition.getProcesses();
      expect(runningBp.getLaneById(taskApi.content.lane) === taskApi.owner.lane, 'same as process lane ref').to.be.true;
    });

    When('task is signaled', () => {
      definition.signal({id: taskApi.id});
    });

    Then('run waits for next user task belonging to second lane', () => {
      taskApi = definition.getPostponed().shift();
      expect(taskApi.content, 'api lane id').to.have.property('lane', 'admin-lane');
      expect(taskApi.owner.lane, 'task lane').to.have.property('id', 'admin-lane');
    });

    When('second lane task is signaled', () => {
      definition.signal({id: taskApi.id});
    });

    Then('run waits for sub process task belonging to second lane', () => {
      taskApi = definition.getPostponed().find((p) => p.type === 'bpmn:SubProcess');
      expect(taskApi.content, 'api lane id').to.have.property('lane', 'admin-lane');
      expect(taskApi.owner.lane, 'task lane').to.have.property('id', 'admin-lane');
    });

    Then('run waits for sub process task belonging to second lane', () => {
      taskApi = definition.getPostponed().find((p) => p.type === 'bpmn:SubProcess');
      expect(taskApi.content, 'api lane id').to.have.property('lane', 'admin-lane');
      expect(taskApi.owner.lane, 'task lane').to.have.property('id', 'admin-lane');
    });

    let subtask;
    And('sub process task lacks lane information', () => {
      subtask = taskApi.getPostponed().find((p) => p.type === 'bpmn:ManualTask');
      expect(subtask.content, 'api lane id').to.not.have.property('lane');
      expect(subtask.owner.parentElement === taskApi.owner, 'parent element ref').to.be.true;
    });

    When('sub process task task is signaled', () => {
      definition.signal({id: subtask.id});
    });

    Then('run completes', () => {
      return end;
    });
  });

  Scenario('No lanes but call activity', () => {
    let context;
    When('context is created from source', async () => {
      context = await testHelpers.context(noLanesSource);
    });

    Then('activity has parent element process but no lane', () => {
      const task = context.getActivityById('start');
      const parentElement = task.parentElement;
      expect(parentElement).to.have.property('id', 'Process_1');
      expect(parentElement).to.have.property('behaviour').that.is.an('object').with.property('$type', 'bpmn:Process');
      expect(parentElement).to.be.instanceof(Process);
      expect(task.lane, 'no lane').to.be.undefined;
    });

    And('participant process activity has parent element', () => {
      const task = context.getActivityById('task');
      const parentElement = task.parentElement;
      expect(parentElement).to.have.property('id', 'called-process');
      expect(parentElement).to.have.property('type', 'bpmn:Process');
      expect(parentElement).to.be.instanceof(Process);
      expect(parentElement.context.owner === parentElement, 'context owned by participant').to.be.true;
      expect(task.lane, 'no lane').to.be.undefined;
    });

    And('process has NO lanes', () => {
      const [bp] = context.getProcesses();
      expect(bp.lanes).to.be.undefined;
    });

    And('process lane by id returns undefined', () => {
      const [bp] = context.getProcesses();
      expect(bp.getLaneById('swimlane')).to.be.undefined;
    });
  });
});
