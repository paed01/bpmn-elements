import BoundaryEvent from '../../src/events/BoundaryEvent';
import EndEvent from '../../src/events/EndEvent';
import Environment from '../../src/Environment';
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
      const execution = ProcessExecution(bp, bp.context);
      expect(execution.execute).to.throw(/requires message/i);
    });

    it('requires message content executionId', () => {
      const bp = createProcess();
      const execution = ProcessExecution(bp, bp.context);
      expect(() => {
        execution.execute({content: {}});
      }).to.throw(/requires execution id/i);
    });

    it('publishes start execute message', () => {
      const bp = createProcess();
      const execution = ProcessExecution(bp, bp.context);

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
      const execution = ProcessExecution(bp, bp.context);

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
      const execution = ProcessExecution(bp, bp.context);

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

    it('publishes no start message if redelivered (recovered)', () => {
      const bp = createProcess();
      const execution = ProcessExecution(bp, bp.context);

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

      expect(message).to.not.be.ok;
    });

    it('forwards activity events', () => {
      const bp = createProcess();
      const execution = ProcessExecution(bp, bp.context);

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
      const execution = ProcessExecution(bp, bp.context);

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
    it('publish execution error on activity error', async () => {
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

      const execution = ProcessExecution(bp, bp.context);

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
      activities.push(activity);

      const boundEvent = BoundaryEvent({
        id: 'boundEvent',
        parent: {
          id: 'process1',
        },
        behaviour: {
          attachedTo: {id: 'service'},
          eventDefinitions: [{Behaviour: ErrorEventDefinition}],
        },
      }, bp.context);
      activities.push(boundEvent);

      const execution = ProcessExecution(bp, bp.context);

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

      expect(message).to.not.be.ok;
    });
  });

  describe('execution flow', () => {
    it('completes immediately if no activities', async () => {
      const bp = createProcess();
      bp.context.getActivities = () => {};

      const execution = ProcessExecution(bp, bp.context);
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
      });

      const activity = EndEvent({
        id: 'end2',
        type: 'bpmn:EndEvent',
        parent: {
          id: 'process1',
        },
      }, bp.context);
      bp.context.getActivities = () => {
        return [activity];
      };

      const execution = ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      activity.broker.publish('event', 'activity.enter', {id: 'end'});
      activity.broker.publish('event', 'activity.leave', {id: 'end'});

      expect(execution).to.have.property('completed', true);
    });

    it('completes when last activity leaves', async () => {
      const bp = createProcess();

      const activities = bp.getActivities();

      const execution = ProcessExecution(bp, bp.context);
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
      const bp = createProcess();
      const activity1 = SignalTask({id: 'task1', type: 'bpmn:Task', parent: {id: 'process1'}}, bp.context);
      const activity2 = SignalTask({id: 'task2', type: 'bpmn:Task', parent: {id: 'process1'}}, bp.context);
      bp.context.getActivities = () => {
        return [activity1, activity2];
      };

      const execution = ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
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

      const execution = ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      activity1.broker.publish('event', 'activity.enter', {id: activity1.id, executionId: activity1.executionId, parent: {id: 'process1'}});
      const sequenceId = sequenceflow.preFlight();
      activity1.broker.publish('event', 'activity.leave', {id: activity1.id, executionId: activity1.executionId, parent: {id: 'process1'}});

      expect(execution).to.have.property('completed', false);

      activity2.broker.publish('event', 'activity.enter', {id: activity2.id, executionId: activity2.executionId, parent: {id: 'process1'}, inbound: [{id: sequenceflow.id, sequenceId}]});
      activity2.broker.publish('event', 'activity.leave', {id: activity2.id, executionId: activity2.executionId, parent: {id: 'process1'}});

      expect(execution).to.have.property('completed', true);
    });

    it('deletes execution queue when completed', async () => {
      const bp = createProcess();
      const activity1 = SignalTask({id: 'task1', type: 'bpmn:Task', parent: {id: 'process1'}}, bp.context);
      const activity2 = SignalTask({id: 'task2', type: 'bpmn:Task', parent: {id: 'process1'}}, bp.context);
      bp.context.getActivities = () => {
        return [activity1, activity2];
      };

      const execution = ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
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
      const bp = createProcess();
      bp.context.getActivities = () => {
        return [
          SignalTask({id: 'start', parent: {id: 'process1'}}, bp.context),
          EndEvent({
            id: 'terminate',
            parent: {id: 'process1'},
            behaviour: {
              eventDefinitions: [{Behaviour: TerminateEventDefinition}],
            },
          }, bp.context)
        ];
      };

      const execution = ProcessExecution(bp, bp.context);

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
      const bp = createProcess();
      const activity = SignalTask({id: 'start', type: 'bpmn:ManualTask', isStart: true, parent: {id: 'process1'}}, bp.context);
      bp.context.getActivities = () => {
        return [activity];
      };

      const execution = ProcessExecution(bp, bp.context);
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

      expect(activity).to.have.property('stopped', true);
    });

    it('stop on activity wait stops all activity', async () => {
      const bp = createProcess();
      const activity = SignalTask({id: 'start', type: 'bpmn:ManualTask', isStart: true, parent: {id: 'process1'}}, bp.context);
      bp.context.getActivities = () => {
        return [activity];
      };

      const stop = new Promise((resolve) => {
        bp.broker.subscribeOnce('event', 'activity.wait', () => {
          execution.stop();
          resolve();
        });
      });

      const execution = ProcessExecution(bp, bp.context);
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

      expect(activity).to.have.property('stopped', true);
    });

    it('closes execution queue and keeps messages', async () => {
      const bp = createProcess();
      const activity = SignalTask({id: 'start', type: 'bpmn:StartEvent', isStart: true, parent: {id: 'process1'}}, bp.context);
      bp.context.getActivities = () => {
        return [activity];
      };

      const execution = ProcessExecution(bp, bp.context);
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
      const bp = createProcess();
      const activity = StartEvent({
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
        }
      }, bp.context);

      bp.context.getActivities = () => {
        return [activity];
      };

      const stop = new Promise((resolve) => {
        bp.broker.subscribeOnce('event', 'activity.wait', () => {
          expect(activity.broker.getQueue('messages')).to.have.property('consumerCount', 1);
          execution.stop();
          resolve();
        });
      });

      const execution = ProcessExecution(bp, bp.context);
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

      expect(activity).to.have.property('stopped', true);

      expect(activity.broker.getQueue('messages')).to.have.property('consumerCount', 0);
    });

    it('stops running sub process', async () => {
      const bp = createProcess();

      const subActivity = StartEvent({
        id: 'start',
        type: 'bpmn:StartEvent',
        isStart: true,
        parent: {id: 'activity'},
        behaviour: {
          eventDefinitions: [{
            Behaviour: MessageEventDefinition,
          }, {
            Behaviour: TimerEventDefinition,
            behaviour: {
              timeDuration: 'PT1M'
            }
          }]
        }
      }, bp.context);

      const activity = SubProcess({
        id: 'activity',
        type: 'bpmn:SubProcess',
        isStart: true,
        parent: {id: 'process1'},
        behaviour: {}
      }, bp.context);

      bp.context.getActivities = (id) => {
        if (id === 'activity') return [subActivity];
        return [activity];
      };
      bp.context.getSequenceFlows = () => {
        return [];
      };

      const stop = new Promise((resolve) => {
        bp.broker.subscribeOnce('event', 'activity.wait', () => {
          expect(subActivity.broker.getQueue('messages')).to.have.property('consumerCount', 1);
          execution.stop();
          resolve();
        });
      });

      const execution = ProcessExecution(bp, bp.context);
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

      expect(subActivity).to.have.property('stopped', true);

      expect(subActivity.broker.getQueue('messages')).to.have.property('consumerCount', 0);
    });
  });

  describe('getState()', () => {
    it('returns child states', () => {
      const bp = createProcess();
      const activity = SignalTask({id: 'start', type: 'bpmn:StartEvent', isStart: true, parent: {id: 'process1'}}, bp.context);
      bp.context.getActivities = () => {
        return [activity];
      };

      const execution = ProcessExecution(bp, bp.context);
      const state = execution.getState();

      expect(state).to.have.property('children').with.length(1);
      expect(state).to.have.property('flows');
    });

    it('returns completed false if not completed', () => {
      const bp = createProcess();
      const activity = SignalTask({id: 'start', type: 'bpmn:StartEvent', isStart: true, parent: {id: 'process1'}}, bp.context);
      bp.context.getActivities = () => {
        return [activity];
      };

      const execution = ProcessExecution(bp, bp.context);
      const state = execution.getState();

      expect(state).to.have.property('completed', false);
    });

    it('returns completed true if completed', () => {
      const bp = createProcess();
      const activity = StartEvent({id: 'start1', type: 'bpmn:StartEvent', isStart: true, parent: {id: 'process1'}}, bp.context);
      bp.context.getActivities = () => {
        return [activity];
      };

      const execution = ProcessExecution(bp, bp.context);
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
      const execution = ProcessExecution(bp, bp.context).recover();
      expect(execution).to.be.ok;
    });

    it('sets stopped and completed from state', () => {
      const bp = createProcess();
      const execution = ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      execution.stop();

      const state = execution.getState();

      const recoveredExecution = ProcessExecution(bp, bp.context).recover(state);
      expect(recoveredExecution).to.have.property('stopped', true);
      expect(recoveredExecution).to.have.property('completed', false);
    });

    it('recovers children and flows', () => {
      const bp = createProcess();
      const execution = ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });
      execution.stop();

      const state = execution.getState();

      const recoveredExecution = ProcessExecution(bp, bp.context).recover(state);

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
      const execution = ProcessExecution(bp, bp.context);
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
      const bp = createProcess();
      const activity = StartEvent({id: 'start1', type: 'bpmn:StartEvent', isStart: true, parent: {id: 'process1'}}, bp.context);
      bp.context.getActivities = () => {
        return [activity];
      };

      const execution = ProcessExecution(bp, bp.context);
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
      const bp = createProcess();
      const activity = StartEvent({id: 'start1', type: 'bpmn:StartEvent', isStart: true, parent: {id: 'process1'}}, bp.context);
      bp.context.getActivities = () => {
        return [activity];
      };

      const execution = ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(execution).to.have.property('completed', true);

      const state = execution.getState();
      const recoveredExecution = ProcessExecution(bp, bp.context);
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
      const bp = createProcess();
      const activity = StartEvent({id: 'start1', type: 'bpmn:StartEvent', isStart: true, parent: {id: 'process1'}}, bp.context);
      bp.context.getActivities = () => {
        return [activity];
      };

      const execution = ProcessExecution(bp, bp.context);
      execution.execute({
        fields: {},
        content: {
          id: 'process1',
          executionId: 'process1_1',
        },
      });

      expect(execution).to.have.property('completed', true);

      const state = execution.getState();
      const recoveredExecution = ProcessExecution(bp, bp.context);
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
      const execution = ProcessExecution(bp, bp.context);

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

      const execution = ProcessExecution(bp, bp.context);

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
      const execution = ProcessExecution(bp, bp.context);

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
      const execution = ProcessExecution(bp, bp.context);

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
      const execution = ProcessExecution(bp, bp.context);

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
      const bp = createProcess({
        getSequenceFlows() {},
      });
      const activity = SubProcess({
        id: 'subp',
        type: 'bpmn:SubProcess',
        parent: {
          id: 'process1',
        },
      }, bp.context);

      bp.context.getActivities = (id) => {
        if (id === 'subp') return [SignalTask({id: 'subtask', parent: {id: 'subp'}}, bp.context)];
        return [activity];
      };

      const execution = ProcessExecution(bp, bp.context);
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
      const bp = createProcess({
        getSequenceFlows() {},
      });
      const activity = SubProcess({
        id: 'subp',
        type: 'bpmn:SubProcess',
        parent: {
          id: 'process1',
        },
      }, bp.context);

      bp.context.getActivities = (id) => {
        if (id === 'subp') return [SignalTask({id: 'subtask', parent: {id: 'subp'}}, bp.context)];
        return [activity];
      };

      const execution = ProcessExecution(bp, bp.context);
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
      const bp = createProcess({
        getSequenceFlows() {},
      });
      const activity = SubProcess({
        id: 'subp',
        type: 'bpmn:SubProcess',
        parent: {
          id: 'process1',
        },
      }, bp.context);

      bp.context.getActivities = (id) => {
        if (id === 'subp') return [SignalTask({id: 'subtask', parent: {id: 'subp'}}, bp.context)];
        return [activity];
      };

      const execution = ProcessExecution(bp, bp.context);
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

    it('getApi() with sub process child message return child api', () => {
      const bp = createProcess({
        getSequenceFlows() {},
      });
      const activity1 = SubProcess({
        id: 'subp1',
        type: 'bpmn:SubProcess',
        parent: {
          id: 'process1',
        },
      }, bp.context);

      const activity2 = SubProcess({
        id: 'subp2',
        type: 'bpmn:SubProcess',
        parent: {
          id: 'subp1',
        },
      }, bp.context);

      bp.context.getActivities = (id) => {
        if (id === 'subp1') return [activity2];
        if (id === 'subp2') return [SignalTask({id: 'subtask', parent: {id: 'subp2'}}, bp.context)];
        return [activity1];
      };

      const execution = ProcessExecution(bp, bp.context);
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
      const bp = createProcess({
        getSequenceFlows() {},
      });
      const activity = SubProcess({
        id: 'subp',
        type: 'bpmn:SubProcess',
        parent: {
          id: 'process1',
        },
      }, bp.context);

      bp.context.getActivities = (id) => {
        if (id === 'subp') {
          return [EndEvent({
            id: 'subend',
            type: 'endevent',
            parent: {id: 'subp'},
            behaviour: {
              eventDefinitions: [{Behaviour: TerminateEventDefinition}],
            },
          }, bp.context)];
        }
        return [activity];
      };

      const execution = ProcessExecution(bp, bp.context);

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
      const bp = createProcess({
        getSequenceFlows() {},
      });
      const activity1 = StartEvent({
        id: 'start1',
        parent: {
          id: 'process1',
        },
      }, bp.context);
      const activity2 = SignalTask({
        id: 'start2',
        parent: {
          id: 'process1',
        },
      }, bp.context);

      bp.context.getActivities = () => {
        return [activity1, activity2];
      };

      const execution = ProcessExecution(bp, bp.context);

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
  const environment = Environment({
    Logger: testHelpers.Logger,
    settings: {
      step,
    },
  });

  const sequenceFlows = [
    SequenceFlow({id: 'flow1', sourceId: 'start', targetId: 'task', parent: {id: 'process1'}}, {environment}),
    SequenceFlow({id: 'flow2', sourceId: 'task', targetId: 'end', parent: {id: 'process1'}}, {environment})
  ];
  const context = {
    environment,
    getInboundSequenceFlows,
    getOutboundSequenceFlows,
    loadExtensions,
    getSequenceFlows,
    clone(newEnv) {
      if (newEnv) return {...this, environment: newEnv};
      return {...this};
    },
    ...override,
  };

  const activities = [
    StartEvent({id: 'start', parent: {id: 'process1'}}, context),
    SignalTask({id: 'task', type: 'signalTask', parent: {id: 'process1'}}, context),
    EndEvent({id: 'end', parent: {id: 'process1'}}, context)
  ];

  return Process({
    id: 'process1',
    type: 'bpmn:Process',
  }, {
    getActivities() {
      return activities;
    },
    getActivityById(id) {
      return this.getActivities().find((a) => a.id === id);
    },
    getDataObjects() {},
    getMessageFlows() {},
    ...context,
  });

  function loadExtensions() {}

  function getSequenceFlows() {
    return sequenceFlows;
  }
  function getOutboundSequenceFlows(id) {
    return sequenceFlows.filter(({sourceId}) => sourceId === id);
  }
  function getInboundSequenceFlows(id) {
    return sequenceFlows.filter(({targetId}) => targetId === id);
  }
}
