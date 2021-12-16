import BoundaryEvent from '../../src/events/BoundaryEvent';
import EndEvent from '../../src/events/EndEvent';
import ErrorEventDefinition from '../../src/eventDefinitions/ErrorEventDefinition';
import MessageEventDefinition from '../../src/eventDefinitions/MessageEventDefinition';
import TimerEventDefinition from '../../src/eventDefinitions/TimerEventDefinition';
import ProcessExecution from '../../src/process/ProcessExecution';
import Process from '../../src/process/Process';
import ServiceTask from '../../src/tasks/ServiceTask';
import SequenceFlow from '../../src/flows/SequenceFlow';
import SignalTask from '../../src/tasks/SignalTask';
import StartEvent from '../../src/events/StartEvent';
import SubProcess from '../../src/tasks/SubProcess';
import TerminateEventDefinition from '../../src/eventDefinitions/TerminateEventDefinition';
import testHelpers from '../helpers/testHelpers';

describe('Process execution', () => {
  describe('execute()', () => {
    it('requires message', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);
      expect(execution.execute).to.throw(/requires message/i);
    });

    it('requires message content executionId', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);
      expect(() => {
        execution.execute({content: {}});
      }).to.throw(/requires execution id/i);
    });

    it('publishes start execute message', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);

      let message;
      bp.broker.subscribeOnce('execution', 'execute.#', (_, msg) => {
        message = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'parentActivity',
          state: 'start',
          type: 'task',
          executionId: 'process1_1',
          input: 1,
        },
      });

      expect(message).to.be.ok;
      expect(message.fields).to.have.property('routingKey', 'execute.start');
      expect(message.content).to.eql({
        id: 'parentActivity',
        type: 'task',
        state: 'start',
        input: 1,
        executionId: 'process1_1',
      });
    });

    it('creates execution queue', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);

      execution.execute({
        fields: {},
        content: {
          id: 'parentActivity',
          state: 'start',
          type: 'task',
          executionId: 'process1_1',
          input: 1,
        },
      });

      expect(bp.broker.getQueue('execute-process1_1-q')).to.be.ok;
    });

    it('starts with start activities', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);

      let message;
      bp.broker.subscribeOnce('event', 'activity.enter', (_, msg) => {
        message = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          state: 'start',
          type: 'bpmn:Process',
          executionId: 'process1_1',
          input: 1,
        },
      });

      expect(message).to.be.ok;
      expect(message.fields).to.have.property('routingKey', 'activity.enter');
      expect(message.content).to.deep.include({
        id: 'start',
        state: 'enter',
        parent: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
    });

    it('publishes start message if recovered on init', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);

      let message;
      bp.broker.subscribeOnce('execution', 'execute.start', (_, msg) => {
        message = msg;
      });

      execution.execute({
        fields: {
          redelivered: true,
        },
        content: {
          id: 'parentActivity',
          state: 'start',
          type: 'task',
          executionId: 'process1_1',
          input: 1,
        },
      });

      expect(message).to.be.ok;
      expect(message.fields).to.have.property('routingKey', 'execute.start');
    });

    it('completes if recovered on executing when all activities are completed', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);
      execution.recover({status: 'executing'});

      let message;
      bp.broker.subscribeOnce('execution', '#', (_, msg) => {
        message = msg;
      });

      execution.execute({
        fields: {
          redelivered: true,
        },
        content: {
          id: 'parentActivity',
          type: 'task',
          executionId: 'process1_1',
          input: 1,
        },
      });

      expect(message).to.be.ok;
      expect(message.fields).to.have.property('routingKey', 'execution.completed.process1_1');
    });

    it('forwards activity events', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);

      const messages = [];
      bp.broker.subscribeTmp('event', 'activity.#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'parentActivity',
          state: 'start',
          type: 'task',
          executionId: 'process1_1',
          input: 1,
        },
      });

      const [, task] = execution.getActivities();
      task.broker.publish('event', 'activity.arb', {id: 'task', state: 'arb', parent: {id: bp.id}});

      expect(messages.length).to.be.ok;
      const msg = messages.pop();
      expect(msg.fields).to.have.property('routingKey', 'activity.arb');
      expect(msg.content).to.have.property('id', 'task');
      expect(msg.content).to.have.property('parent');
      expect(msg.content.parent).to.have.property('executionId', execution.executionId);
    });

    it('forwards sequence flow events', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);

      let message;
      bp.broker.subscribeOnce('event', 'flow.#', (_, msg) => {
        message = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'parentActivity',
          state: 'start',
          type: 'task',
          executionId: 'process1_1',
          input: 1,
        },
      });

      const [flow] = execution.getSequenceFlows();
      flow.broker.publish('event', 'flow.take', {id: 'flow'});

      expect(message).to.be.ok;
      expect(message.content).to.have.property('id', 'flow1');
      expect(message.content).to.have.property('parent');
      expect(message.content.parent).to.have.property('executionId', 'process1_1');
    });
  });

  describe('error', () => {
    it('uncaught activity error throws', async () => {
      const bp = createProcess();
      const activity = ServiceTask({
        id: 'service',
        type: 'bpmn:ServiceTask',
        parent: {
          id: 'process1',
        },
        behaviour: {
          Service: () => {
            return {
              execute(_, next) {
                return next(new Error('Shaky'));
              },
            };
          },
        },
      }, bp.context);

      bp.context.getActivities = () => {
        return [activity];
      };

      const execution = new ProcessExecution(bp, bp.context);

      let message;
      execution.broker.subscribeOnce('execution', 'execution.error.*', (_, msg) => {
        message = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(message).to.be.ok;
      expect(message).to.have.property('fields').with.property('routingKey', 'execution.error.process1_1');
      expect(message).to.have.property('properties').with.property('mandatory', true);
      expect(message).to.have.property('properties').with.property('type', 'error');
    });

    it('caught activity error is swallowed', async () => {
      const activities = [];
      const bp = createProcess({
        getActivities() {
          return activities;
        },
        getActivityById(id) {
          return activities.find((a) => a.id === id);
        },
      });

      const activity = {
        id: 'service',
        type: 'bpmn:ServiceTask',
        parent: {
          id: 'process1',
        },
        Behaviour: ServiceTask,
        behaviour: {
          Service() {
            return {
              execute(_, next) {
                return next(new Error('Shaky'));
              },
            };
          },
        },
      };
      activities.push(activity);

      const boundEvent = {
        id: 'boundEvent',
        parent: {
          id: 'process1',
        },
        Behaviour: BoundaryEvent,
        behaviour: {
          attachedTo: {id: 'service'},
          eventDefinitions: [{Behaviour: ErrorEventDefinition}],
        },
      };
      activities.push(boundEvent);

      const execution = new ProcessExecution(bp, bp.context);

      let errorMessage;
      execution.broker.subscribeOnce('execution', 'execution.error.*', (_, msg) => {
        errorMessage = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(errorMessage).to.not.be.ok;
      expect(execution).to.have.property('completed', true);
    });
  });

  describe('execution flow', () => {
    it('completes immediately if no activities', async () => {
      const bp = createProcess({getActivities() {}});

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      expect(execution).to.have.property('completed', true);
    });

    it('completes when activity leaves', async () => {
      const bp = createProcess({
        getSequenceFlows() {},
        getActivities() {
          return [{
            id: 'end2',
            type: 'bpmn:EndEvent',
            Behaviour: EndEvent,
            parent: {
              id: 'process1',
            },
          }];
        }
      });

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      const [activity] = execution.getActivities();

      activity.broker.publish('event', 'activity.enter', {id: 'end'});
      activity.broker.publish('event', 'activity.leave', {id: 'end'});

      expect(execution).to.have.property('completed', true);
    });

    it('completes when last activity leaves', async () => {
      const bp = createProcess();

      const activities = bp.getActivities();

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(execution).to.have.property('completed', false);

      const [task] = execution.getPostponed();
      expect(task).to.have.property('id', 'task');

      task.signal();

      expect(execution).to.have.property('completed', true);

      expect(activities).to.have.length(3);
      activities.forEach((activity) => {
        expect(activity.counters).to.have.property('taken', 1);
      });
    });

    it('multiple start activities completes when last activity leaves', async () => {
      const bp = createProcess({
        getActivities() {
          return [
            {id: 'task1', type: 'bpmn:Task', parent: {id: 'process1'}, Behaviour: SignalTask},
            {id: 'task2', type: 'bpmn:Task', parent: {id: 'process1'}, Behaviour: SignalTask},
          ];
        }
      });

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      const [activity1, activity2] = execution.getActivities();

      activity1.broker.publish('event', 'activity.enter', {id: activity1.id, executionId: activity1.executionId, parent: {id: 'process1'}});
      activity2.broker.publish('event', 'activity.enter', {id: activity2.id, executionId: activity2.executionId, parent: {id: 'process1'}});

      activity1.broker.publish('event', 'activity.leave', {id: activity1.id, executionId: activity1.executionId, parent: {id: 'process1'}});

      expect(execution).to.have.property('completed', false);

      activity2.broker.publish('event', 'activity.leave', {id: activity2.id, executionId: activity2.executionId, parent: {id: 'process1'}});

      expect(execution).to.have.property('completed', true);
    });

    it('completes when no pending activities', async () => {
      const bp = createProcess();
      const [activity1, activity2] = bp.getActivities();
      const [sequenceflow] = bp.getSequenceFlows();

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      activity1.broker.publish('event', 'activity.enter', {id: activity1.id, executionId: activity1.executionId, parent: {id: 'process1'}});
      sequenceflow.take({sequenceId: 'Flow_take_1'});
      activity1.broker.publish('event', 'activity.leave', {id: activity1.id, executionId: activity1.executionId, parent: {id: 'process1'}});

      expect(execution).to.have.property('completed', false);

      activity2.broker.publish('event', 'activity.enter', {id: activity2.id, executionId: activity2.executionId, parent: {id: 'process1'}, inbound: [{id: sequenceflow.id, isSequenceFlow: true, sequenceId: 'Flow_take_1'}]});
      activity2.broker.publish('event', 'activity.leave', {id: activity2.id, executionId: activity2.executionId, parent: {id: 'process1'}});

      expect(execution).to.have.property('completed', true);
    });

    it('deletes execution queue when completed', async () => {
      const bp = createProcess({
        getActivities() {
          return [
            {id: 'task1', type: 'bpmn:Task', parent: {id: 'process1'}, Behaviour: SignalTask},
            {id: 'task2', type: 'bpmn:Task', parent: {id: 'process1'}, Behaviour: SignalTask},
          ];
        }
      });

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      const [activity1, activity2] = execution.getActivities();

      activity1.broker.publish('event', 'activity.enter', {id: activity1.id, executionId: activity1.executionId, parent: {id: 'process1'}});
      activity2.broker.publish('event', 'activity.enter', {id: activity2.id, executionId: activity2.executionId, parent: {id: 'process1'}});

      activity1.broker.publish('event', 'activity.leave', {id: activity1.id, executionId: activity1.executionId, parent: {id: 'process1'}});

      expect(execution).to.have.property('completed', false);
      expect(bp.broker.getQueue('execute-process1_1-q')).to.be.ok;

      activity2.broker.publish('event', 'activity.leave', {id: activity2.id, executionId: activity2.executionId, parent: {id: 'process1'}});

      expect(execution).to.have.property('completed', true);
      expect(bp.broker.getQueue('execute-process1_1-q')).to.not.be.ok;
    });
  });

  describe('termination event', () => {
    it('terminates execution', () => {
      const bp = createProcess({
        getActivities() {
          return [
            {id: 'start', parent: {id: 'process1'}, Behaviour: SignalTask},
            {
              id: 'terminate',
              parent: {id: 'process1'},
              behaviour: {
                eventDefinitions: [{Behaviour: TerminateEventDefinition}],
              },
              Behaviour: EndEvent,
            }
          ];
        }
      });

      const execution = new ProcessExecution(bp, bp.context);

      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(execution).to.have.property('postponedCount', 0);
      expect(execution.status).to.equal('terminated');
    });
  });

  describe('stop()', () => {
    it('stops all activity', async () => {
      const bp = createProcess({
        getActivities() {
          return [{id: 'start', type: 'bpmn:ManualTask', isStart: true, parent: {id: 'process1'}, Behaviour: SignalTask}];
        }
      });

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      expect(execution).to.have.property('completed', false);
      expect(execution.getPostponed()).to.have.length(1);

      execution.stop();

      expect(execution).to.have.property('completed', false);
      expect(execution).to.have.property('stopped', true);
      expect(execution.getPostponed()).to.have.length(1);

      expect(execution.getActivityById('start')).to.have.property('stopped', true);
    });

    it('stop on activity wait stops all activity', async () => {
      const bp = createProcess({
        getActivities() {
          return [{id: 'start', type: 'bpmn:ManualTask', isStart: true, parent: {id: 'process1'}, Behaviour: SignalTask}];
        }
      });

      const stop = new Promise((resolve) => {
        bp.broker.subscribeOnce('event', 'activity.wait', () => {
          execution.stop();
          resolve();
        });
      });

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      await stop;

      expect(execution).to.have.property('completed', false);
      expect(execution.getPostponed()).to.have.length(1);

      expect(execution).to.have.property('completed', false);
      expect(execution).to.have.property('stopped', true);
      expect(execution.getPostponed()).to.have.length(1);

      expect(execution.getActivityById('start')).to.have.property('stopped', true);
    });

    it('closes execution queue and keeps messages', async () => {
      const bp = createProcess({
        getActivities() {
          return [{id: 'start', type: 'bpmn:ManualTask', isStart: true, parent: {id: 'process1'}, Behaviour: SignalTask}];
        }
      });

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      expect(execution).to.have.property('completed', false);
      expect(execution.getPostponed()).to.have.length(1);

      execution.stop();

      const executionQ = bp.broker.getQueue(`execute-${execution.executionId}-q`);
      expect(executionQ).to.be.ok;
      expect(executionQ).to.have.property('consumerCount', 0);
      expect(executionQ).to.have.property('messageCount').above(0);
    });

    it('stops running event eventDefinitions', async () => {
      const bp = createProcess({
        getActivities() {
          return [{
            id: 'start',
            type: 'bpmn:StartEvent',
            isStart: true,
            parent: {id: 'process1'},
            behaviour: {
              eventDefinitions: [{
                Behaviour: MessageEventDefinition,
              }, {
                Behaviour: TimerEventDefinition,
                behaviour: {
                  timeDuration: 'PT1M'
                }
              }]
            },
            Behaviour: StartEvent
          }];
        }
      });

      const stop = new Promise((resolve) => {
        bp.broker.subscribeOnce('event', 'activity.wait', () => {
          execution.stop();
          resolve();
        });
      });

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      await stop;

      expect(execution).to.have.property('completed', false);
      expect(execution.getPostponed()).to.have.length(1);

      expect(execution).to.have.property('completed', false);
      expect(execution).to.have.property('stopped', true);
      expect(execution.getPostponed()).to.have.length(1);

      expect(execution.getActivityById('start')).to.have.property('stopped', true);
    });

    it('stops running sub process', async () => {
      const activities = [{
        id: 'start',
        type: 'bpmn:StartEvent',
        isStart: true,
        parent: {id: 'activity'},
        Behaviour: StartEvent,
        behaviour: {
          eventDefinitions: [{
            Behaviour: MessageEventDefinition,
          }, {
            Behaviour: TimerEventDefinition,
            behaviour: {
              timeDuration: 'PT1M'
            }
          }]
        },
      }, {
        id: 'activity',
        type: 'bpmn:SubProcess',
        isStart: true,
        parent: {id: 'process1'},
        Behaviour: SubProcess,
      }];

      const bp = createProcess({
        getActivities(scopeId) {
          if (scopeId === 'activity') {
            return [activities[0]];
          } else if (scopeId === 'process1') {
            return [activities[1]];
          }

          return activities;
        },
        getSequenceFlows() {}
      });

      const stop = new Promise((resolve) => {
        bp.broker.subscribeOnce('event', 'activity.wait', () => {
          execution.stop();
          resolve();
        });
      });

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      await stop;

      expect(execution).to.have.property('completed', false);
      expect(execution.getPostponed()).to.have.length(1);

      expect(execution).to.have.property('completed', false);
      expect(execution).to.have.property('stopped', true);
      expect(execution.getPostponed()).to.have.length(1);

      const [subProcess] = execution.getPostponed();
      const [, start] = subProcess.getPostponed();
      expect(start.owner).to.have.property('id', 'start');
      expect(start.owner).to.have.property('stopped', true);
    });
  });

  describe('discard()', () => {
    it('discards all running activities', async () => {
      const bp = createProcess({
        getActivities() {
          return [{id: 'start', type: 'bpmn:ManualTask', isStart: true, parent: {id: 'process1'}, Behaviour: SignalTask}];
        }
      });

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      expect(execution).to.have.property('completed', false);
      expect(execution.getPostponed()).to.have.length(1);

      execution.discard();

      expect(execution).to.have.property('completed', true);
      expect(execution).to.have.property('status', 'discard');
      expect(execution.getPostponed()).to.have.length(0);

      const [activity] = execution.getActivities();
      expect(activity.counters).to.have.property('discarded', 1);
      expect(activity.counters).to.have.property('taken', 0);
    });

    it('api.discard() discards all running activities', async () => {
      const bp = createProcess({
        getActivities() {
          return [{id: 'start', type: 'bpmn:ManualTask', isStart: true, parent: {id: 'process1'}, Behaviour: SignalTask}];
        }
      });

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      expect(execution).to.have.property('completed', false);
      expect(execution.getPostponed()).to.have.length(1);

      execution.getApi().discard();

      expect(execution).to.have.property('completed', true);
      expect(execution).to.have.property('status', 'discard');
      expect(execution.getPostponed()).to.have.length(0);

      const [activity] = execution.getActivities();
      expect(activity.counters).to.have.property('discarded', 1);
      expect(activity.counters).to.have.property('taken', 0);
    });

    it('discards running sub process', async () => {
      const activities = [{
        id: 'start',
        type: 'bpmn:StartEvent',
        isStart: true,
        parent: {id: 'activity'},
        Behaviour: StartEvent,
        behaviour: {
          eventDefinitions: [{
            Behaviour: MessageEventDefinition,
          }, {
            Behaviour: TimerEventDefinition,
            behaviour: {
              timeDuration: 'PT1M'
            }
          }]
        },
      }, {
        id: 'activity',
        type: 'bpmn:SubProcess',
        isStart: true,
        parent: {id: 'process1'},
        Behaviour: SubProcess,
      }];

      const bp = createProcess({
        getActivities(scopeId) {
          if (scopeId === 'activity') {
            return [activities[0]];
          } else if (scopeId === 'process1') {
            return [activities[1]];
          }

          return activities;
        },
        getSequenceFlows() {}
      });

      const discard = new Promise((resolve) => {
        bp.broker.subscribeOnce('event', 'activity.wait', () => {
          execution.discard();
          resolve();
        });
      });

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      await discard;

      expect(execution.getPostponed()).to.have.length(0);
      expect(execution).to.have.property('completed', true);
      expect(execution).to.have.property('status', 'discard');

      const [subProcess] = execution.getActivities();
      expect(subProcess.counters).to.have.property('discarded', 1);

      expect(subProcess.execution.source.execution.getActivityById('start').counters).to.have.property('discarded', 1);
    });
  });

  describe('getState()', () => {
    it('returns child states', () => {
      const bp = createProcess({
        getActivities() {
          return [{id: 'start', type: 'bpmn:ManualTask', isStart: true, parent: {id: 'process1'}, Behaviour: SignalTask}];
        }
      });

      const execution = new ProcessExecution(bp, bp.context);
      const state = execution.getState();

      expect(state).to.have.property('children').with.length(1);
      expect(state).to.have.property('flows');
    });

    it('returns completed false if not completed', () => {
      const bp = createProcess({
        getActivities() {
          return [{id: 'start', type: 'bpmn:ManualTask', isStart: true, parent: {id: 'process1'}, Behaviour: SignalTask}];
        }
      });

      const execution = new ProcessExecution(bp, bp.context);
      const state = execution.getState();

      expect(state).to.have.property('completed', false);
    });

    it('returns completed true if completed', () => {
      const bp = createProcess({
        getActivities() {
          return [{id: 'start1', type: 'bpmn:StartEvent', isStart: true, parent: {id: 'process1'}, Behaviour: StartEvent}];
        }
      });

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      const state = execution.getState();

      expect(state).to.have.property('completed', true);
    });
  });

  describe('recover(state)', () => {
    it('is ignored if no state is passed', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context).recover();
      expect(execution).to.be.ok;
    });

    it('sets stopped and completed from state', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      execution.stop();

      const state = execution.getState();

      const recoveredExecution = new ProcessExecution(bp, bp.context).recover(state);
      expect(recoveredExecution).to.have.property('stopped', true);
      expect(recoveredExecution).to.have.property('completed', false);
    });

    it('recovers children and flows', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      execution.stop();

      const state = execution.getState();

      const recoveredExecution = new ProcessExecution(bp, bp.context).recover(state);

      const [start, task, end] = recoveredExecution.getActivities();
      expect(start).to.have.property('counters').with.property('taken', 1);
      expect(task).to.have.property('status', 'executing');
      expect(task).to.have.property('executionId').that.is.ok;
      expect(end).to.have.property('counters').with.property('taken', 0);
      expect(end.executionId).to.be.undefined;

      const [flow1, flow2] = recoveredExecution.getSequenceFlows();
      expect(flow1).to.have.property('counters').with.property('take', 1);
      expect(flow2).to.have.property('counters').with.property('take', 0);
    });
  });

  describe('resume', () => {
    it('resumes if execution message is redelivered', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      expect(execution).to.have.property('completed', false);
      expect(execution.getPostponed()).to.have.length(1);

      execution.stop();

      execution.execute({
        fields: {
          redelivered: true,
        },
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(execution.getPostponed()).to.have.length(1);
      const [taskApi] = execution.getPostponed();

      const executionQ = bp.broker.getQueue('execute-process1_1-q');
      expect(executionQ).to.be.ok;
      expect(executionQ).to.have.property('consumerCount', 1);
      expect(executionQ).to.have.property('messageCount').above(0);

      taskApi.signal();

      expect(bp.broker.getQueue('execute-process1_1-q')).to.not.be.ok;

      const [start, task, end] = execution.getActivities();
      expect(start).to.have.property('counters').with.property('taken', 1);
      expect(task).to.have.property('counters').with.property('taken', 1);
      expect(end).to.have.property('counters').with.property('taken', 1);

      const [flow1, flow2] = execution.getSequenceFlows();
      expect(flow1).to.have.property('counters').with.property('take', 1);
      expect(flow2).to.have.property('counters').with.property('take', 1);
    });

    it('resume completed execution publishes complete message', () => {
      const bp = createProcess({
        getActivities() {
          return [{id: 'start1', type: 'bpmn:StartEvent', isStart: true, parent: {id: 'process1'}, Behaviour: StartEvent}];
        }
      });

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(execution).to.have.property('completed', true);

      let message;
      bp.broker.subscribeOnce('execution', '#', (_, msg) => {
        message = msg;
      });

      execution.execute({
        fields: {
          redelivered: true,
        },
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(execution).to.have.property('completed', true);

      expect(message.fields).to.have.property('routingKey', 'execution.completed.process1_1');
      expect(bp.broker.getQueue('execute-process1_1-q')).to.not.be.ok;
    });

    it('resume recovered completed execution publishes complete message', () => {
      const bp = createProcess({
        getActivities() {
          return [{id: 'start1', type: 'bpmn:StartEvent', isStart: true, parent: {id: 'process1'}, Behaviour: StartEvent}];
        }
      });

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(execution).to.have.property('completed', true);

      const state = execution.getState();
      const recoveredExecution = new ProcessExecution(bp, bp.context);
      recoveredExecution.recover(state);

      let message;
      bp.broker.subscribeOnce('execution', '#', (_, msg) => {
        message = msg;
      });

      recoveredExecution.execute({
        fields: {
          redelivered: true,
        },
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(execution).to.have.property('completed', true);

      expect(message.fields).to.have.property('routingKey', 'execution.completed.process1_1');
      expect(bp.broker.getQueue('execute-process1_1-q')).to.not.be.ok;
    });

    it('resume recovered completed execution publishes complete message', () => {
      const bp = createProcess({
        getActivities() {
          return [{id: 'start1', type: 'bpmn:StartEvent', isStart: true, parent: {id: 'process1'}, Behaviour: StartEvent}];
        }
      });

      const execution = new ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(execution).to.have.property('completed', true);

      const state = execution.getState();
      const recoveredExecution = new ProcessExecution(bp, bp.context);
      recoveredExecution.recover(state);

      let message;
      bp.broker.subscribeOnce('execution', '#', (_, msg) => {
        message = msg;
      });

      recoveredExecution.execute({
        fields: {
          redelivered: true,
        },
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(execution).to.have.property('completed', true);

      expect(message.fields).to.have.property('routingKey', 'execution.completed.process1_1');
      expect(bp.broker.getQueue('execute-process1_1-q')).to.not.be.ok;
    });
  });

  describe('getPostponed()', () => {
    it('returns running activity apis', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);

      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      const postponed = execution.getPostponed();
      expect(postponed).to.have.length(1);

      expect(postponed[0].content).to.deep.include({
        id: 'task',
        state: 'wait',
        parent: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
    });

    it('returns running activity api with changed state', () => {
      const bp = createProcess();
      const [, task] = bp.getActivities();

      const execution = new ProcessExecution(bp, bp.context);

      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      task.broker.publish('event', 'activity.made-up', {id: task.id, executionId: task.executionId, state: 'postponed', parent: {id: 'process1'}});

      const postponed = execution.getPostponed();
      expect(postponed).to.have.length(1);

      expect(postponed[0].content).to.eql({
        id: 'task',
        executionId: task.executionId,
        state: 'postponed',
        parent: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
    });
  });

  describe('getApi()', () => {
    it('without message returns process api', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);

      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      const api = execution.getApi();
      expect(api.content).to.have.property('executionId', 'process1_1');
      expect(api.content).to.have.property('state', 'start');
    });

    it('with message returns process api', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);

      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      const api = execution.getApi({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
          state: 'wait',
        },
      });

      expect(api.content).to.have.property('executionId', 'process1_1');
      expect(api.content).to.have.property('state', 'wait');
    });

    it('with activity message returns activity api', () => {
      const bp = createProcess();
      const execution = new ProcessExecution(bp, bp.context);

      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      const api = execution.getApi({
        fields: {},
        content: {
          id: 'task',
          executionId: 'task_1',
          state: 'wait',
        },
      });

      expect(api.content).to.have.property('id', 'task');
      expect(api.content).to.have.property('executionId', 'task_1');
      expect(api.content).to.have.property('state', 'wait');
    });
  });

  describe('sub process', () => {
    it('forwards events from sub process activities', () => {
      const activities = [{
        id: 'subtask',
        parent: {id: 'subp'},
        Behaviour: SignalTask,
      }, {
        id: 'subp',
        type: 'bpmn:SubProcess',
        isStart: true,
        parent: {id: 'process1'},
        Behaviour: SubProcess,
      }];

      const bp = createProcess({
        getActivities(scopeId) {
          if (scopeId === 'subp') {
            return [activities[0]];
          } else if (scopeId === 'process1') {
            return [activities[1]];
          }

          return activities;
        },
        getSequenceFlows() {}
      });

      const execution = new ProcessExecution(bp, bp.context);
      const messages = [];
      bp.broker.subscribeTmp('event', 'activity.start', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});
      bp.broker.subscribeTmp('event', 'activity.wait', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(messages).to.have.length(3);
      expect(messages[0]).to.have.property('fields').with.property('routingKey', 'activity.start');
      expect(messages[0]).to.have.property('content').with.property('id', 'subp');
      expect(messages[0].content).to.have.property('parent').with.property('id', 'process1');
      expect(messages[0].content.parent).to.not.have.property('path');

      expect(messages[1]).to.have.property('fields').with.property('routingKey', 'activity.start');
      expect(messages[1]).to.have.property('content').with.property('id', 'subtask');

      expect(messages[1].content).to.have.property('parent').with.property('id', 'subp');
      expect(messages[1].content.parent).to.have.property('path').with.length(1);
      expect(messages[1].content.parent.path[0]).to.have.property('id', 'process1');

      expect(messages[2]).to.have.property('fields').with.property('routingKey', 'activity.wait');
      expect(messages[2]).to.have.property('content').with.property('id', 'subtask');

      expect(messages[2].content).to.have.property('parent').with.property('id', 'subp');
      expect(messages[2].content.parent).to.have.property('path').with.length(1);
      expect(messages[2].content.parent.path[0]).to.have.property('id', 'process1');
    });

    it('reports child activity activities but only tracks sub process', () => {
      const activities = [{
        id: 'subtask',
        parent: {id: 'subp'},
        Behaviour: SignalTask,
      }, {
        id: 'subp',
        type: 'bpmn:SubProcess',
        isStart: true,
        parent: {id: 'process1'},
        Behaviour: SubProcess,
      }];

      const bp = createProcess({
        getActivities(scopeId) {
          if (scopeId === 'subp') {
            return [activities[0]];
          } else if (scopeId === 'process1') {
            return [activities[1]];
          }

          return activities;
        },
        getSequenceFlows() {}
      });

      const execution = new ProcessExecution(bp, bp.context);
      const messages = [];
      bp.broker.subscribeTmp('event', 'activity.start', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});
      bp.broker.subscribeTmp('event', 'activity.wait', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(messages).to.have.length(3);
      expect(execution).to.have.property('postponedCount', 1);

      const postponed = execution.getPostponed();
      expect(postponed).to.have.length(1);
      expect(postponed[0]).to.have.property('content').with.property('id', 'subp');
    });

    it('getApi() with child message return child api', () => {
      const activities = [{
        id: 'subtask',
        parent: {id: 'subp'},
        Behaviour: SignalTask,
      }, {
        id: 'subp',
        type: 'bpmn:SubProcess',
        isStart: true,
        parent: {id: 'process1'},
        Behaviour: SubProcess,
      }];

      const bp = createProcess({
        getActivities(scopeId) {
          if (scopeId === 'subp') {
            return [activities[0]];
          } else if (scopeId === 'process1') {
            return [activities[1]];
          }

          return activities;
        },
        getSequenceFlows() {}
      });

      const execution = new ProcessExecution(bp, bp.context);
      const messages = [];
      bp.broker.subscribeTmp('event', 'activity.wait', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(messages).to.have.length(1);

      expect(execution.getActivityById('subp').execution.source.getPostponed(), 'sub process postponed').to.have.length(1);
      expect(execution.getActivityById('subp').execution.source.getPostponed()[0], 'sub process postponed id').to.have.property('id', 'subtask');

      const childApi = execution.getApi(messages[0]);
      expect(childApi).to.be.ok;
      expect(childApi.owner === execution.getActivityById('subp').execution.source.getPostponed()[0].owner, 'same subtask ref').to.be.true;
    });

    it('getApi() with sub process´ sub process child message return child api', () => {
      const activities = [{
        id: 'subp1',
        type: 'bpmn:SubProcess',
        isStart: true,
        parent: {id: 'process1'},
        Behaviour: SubProcess,
      }, {
        id: 'subp2',
        type: 'bpmn:SubProcess',
        isStart: true,
        parent: {id: 'subp1'},
        Behaviour: SubProcess,
      }, {
        id: 'subtask',
        parent: {id: 'subp2'},
        Behaviour: SignalTask,
      }];

      const bp = createProcess({
        getActivities(scopeId) {
          if (scopeId) return activities.filter((a) => a.parent.id === scopeId);
          return activities;
        },
        getSequenceFlows() {}
      });

      const execution = new ProcessExecution(bp, bp.context);
      const messages = [];
      bp.broker.subscribeTmp('event', 'activity.wait', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(messages).to.have.length(1);

      expect(execution.getActivityById('subp1').execution.source.getPostponed(), 'sub process postponed').to.have.length(1);
      expect(execution.getActivityById('subp1').execution.source.getPostponed()[0], 'sub process postponed id').to.have.property('id', 'subp2');

      const subp2 = execution.getActivityById('subp1').execution.source.getPostponed()[0].owner;

      const childApi = execution.getApi(messages[0]);
      expect(childApi).to.be.ok;
      expect(childApi).to.have.property('id', 'subtask');

      const taskInstance = subp2.execution.source.execution.getActivityById('subtask');
      expect(childApi.owner.id).to.equal('subtask');

      expect(childApi.owner === taskInstance, 'same subtask ref').to.be.true;
    });

    it('terminated sub process terminates only terminates sub process', () => {
      const activities = [{
        id: 'subp1',
        type: 'bpmn:SubProcess',
        isStart: true,
        parent: {id: 'process1'},
        Behaviour: SubProcess,
      }, {
        id: 'subend',
        parent: {id: 'subp1'},
        Behaviour: EndEvent,
        behaviour: {
          eventDefinitions: [{Behaviour: TerminateEventDefinition}],
        },
      }];

      const bp = createProcess({
        getActivities(scopeId) {
          if (scopeId) return activities.filter((a) => a.parent.id === scopeId);
          return activities;
        },
        getSequenceFlows() {}
      });

      const execution = new ProcessExecution(bp, bp.context);

      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(execution.status).to.equal('completed');
    });
  });

  describe('two start activities', () => {
    it('completes when both activities are completed', () => {
      const activities = [{
        id: 'start1',
        parent: {
          id: 'process1',
        },
        Behaviour: StartEvent,
      }, {
        id: 'start2',
        parent: {
          id: 'process1',
        },
        Behaviour: SignalTask,
      }];

      const bp = createProcess({
        getActivities() {
          return activities;
        },
        getSequenceFlows() {},
      });

      const execution = new ProcessExecution(bp, bp.context);

      let completed;
      execution.broker.subscribeTmp('execution', 'execution.completed.*', () => {
        completed = true;
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          executionId: 'process1_1',
        }
      });

      expect(completed, 'completed before second activity is complete').to.not.be.ok;

      const [, activity2] = execution.getActivities();

      activity2.broker.publish('event', 'activity.leave', {
        id: 'start2',
        executionId: activity2.executionId,
        parent: {
          id: 'process1',
        }
      });

      expect(completed).to.be.true;
    });
  });
});

function createProcess(override, step) {
  const sequenceFlows = [
    {id: 'flow1', sourceId: 'start', targetId: 'task', parent: {id: 'process1'}, Behaviour: SequenceFlow},
    {id: 'flow2', sourceId: 'task', targetId: 'end', parent: {id: 'process1'}, Behaviour: SequenceFlow},
  ];

  const activities = [
    {id: 'start', type: 'startEvent', parent: {id: 'process1'}, Behaviour: StartEvent},
    {id: 'task', type: 'signalTask', parent: {id: 'process1'}, Behaviour: SignalTask},
    {id: 'end', type: 'endEvent', parent: {id: 'process1'}, Behaviour: EndEvent},
  ];

  const context = testHelpers.emptyContext({
    getSequenceFlows() {
      return sequenceFlows;
    },
    getActivities() {
      return activities;
    },
    getOutboundSequenceFlows(id) {
      return (this.getSequenceFlows() || []).filter(({sourceId}) => sourceId === id);
    },
    getInboundSequenceFlows(id) {
      return (this.getSequenceFlows() || []).filter(({targetId}) => targetId === id);
    },
    getActivityById(id) {
      return (this.getActivities() || []).find((a) => a.id === id);
    },
    ...override
  }, {step});

  return Process({
    id: 'process1',
    type: 'bpmn:Process',
  }, context);
}
