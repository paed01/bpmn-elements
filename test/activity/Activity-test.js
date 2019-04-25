import Activity from '../../src/activity/Activity';
import Environment from '../../src/Environment';
import SequenceFlow from '../../src/flows/SequenceFlow';
import testHelpers from '../helpers/testHelpers';
import {ActivityBroker} from '../../src/EventBroker';
import {TaskBehaviour} from '../../src/tasks/Task';
import {SignalTaskBehaviour} from '../../src/tasks/SignalTask';

const Logger = testHelpers.Logger;

describe('Activity', () => {
  describe('run on inbound', () => {
    it('starts run when inbound sequence flow is taken', () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
        getOutboundSequenceFlows() {
          return [];
        },
        loadExtensions() {},
      };

      const sequenceFlow = SequenceFlow({id: 'flow', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow);

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'bpmn:Task',
        parent: {
          id: 'process1',
        },
      }, context);

      const enter = activity.waitFor('enter');

      activity.activate();
      sequenceFlow.take();

      expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 0);

      return enter;
    });

    it('publishes activity enter with taken flow', () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
        getOutboundSequenceFlows() {
          return [];
        },
        loadExtensions() {},
      };

      const sequenceFlow = SequenceFlow({id: 'flow', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow);

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'bpmn:Task',
        parent: {
          id: 'process1',
        },
      }, context);

      activity.activate();

      let message;
      activity.broker.subscribeOnce('event', 'activity.enter', (_, msg) => {
        message = msg;
      });

      sequenceFlow.take();

      expect(message).to.be.ok;
      expect(message.content.inbound).to.have.length(1);
      expect(message.content.inbound[0]).to.include({
        id: 'flow',
        type: 'sequenceflow',
        action: 'take',
      });
      expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 0);
    });

    it('publishes activity discard with discarded flow', () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
        getOutboundSequenceFlows() {
          return [];
        },
        loadExtensions() {},
      };

      const sequenceFlow = SequenceFlow({id: 'flow', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow);

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'bpmn:Task',
        parent: {
          id: 'process1',
        },
      }, context);

      activity.activate();

      let message;
      activity.broker.subscribeOnce('event', 'activity.discard', (_, msg) => {
        message = msg;
      });

      sequenceFlow.discard();

      expect(message).to.be.ok;
      expect(message.content.inbound).to.have.length(1);
      expect(message.content.inbound[0]).to.include({
        id: 'flow',
        type: 'sequenceflow',
        action: 'discard',
      });
      expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 0);
    });

    it('queues inbound message if already running', () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
        getOutboundSequenceFlows() {
          return [];
        },
        loadExtensions() {},
      };

      const sequenceFlow = SequenceFlow({id: 'flow', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow);

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'bpmn:Task',
        parent: {
          id: 'process1',
        },
      }, context);

      activity.activate();

      sequenceFlow.take();
      sequenceFlow.take();

      expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 1);
      expect(activity.broker.getQueue('inbound-q')).to.have.property('consumerCount', 0);
    });

    it('starts next run when completed with first', () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
        getOutboundSequenceFlows() {
          return [];
        },
        loadExtensions() {},
      };

      const sequenceFlow = SequenceFlow({id: 'flow', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow);

      const activity = Activity(({broker}) => {
        return {
          execute({content}) {
            broker.publish('execution', 'execute.completed', {...content});
          },
        };
      }, {
        id: 'activity',
        type: 'bpmn:Task',
        parent: {
          id: 'process1',
        },
      }, context);

      activity.activate();

      sequenceFlow.take();
      sequenceFlow.take();

      expect(activity.counters).to.have.property('taken', 2);
    });

    it('forwards message from inbound to execution', () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
        getOutboundSequenceFlows() {
          return [];
        },
        loadExtensions() {},
      };

      const sequenceFlow = SequenceFlow({id: 'flow', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow);

      let executeMessage;
      const activity = Activity(({broker}) => {
        return {
          execute(msg) {
            executeMessage = msg;
            broker.publish('execution', 'execute.completed', {...msg.content});
          },
        };
      }, {
        id: 'activity',
        type: 'bpmn:Task',
        parent: {
          id: 'process1',
        },
      }, context);

      activity.activate();
      sequenceFlow.take({message: 1});

      expect(executeMessage).to.be.ok;
      expect(executeMessage).to.have.property('content').with.property('message', 1);
    });

    describe('parallel gateway join', () => {
      it('publishes activity enter with taken flows', () => {
        const sequenceFlows = [];
        const context = {
          environment: Environment({Logger}),
          getInboundSequenceFlows() {
            return sequenceFlows;
          },
          getOutboundSequenceFlows() {
            return [];
          },
          loadExtensions() {},
        };

        const sequenceFlow1 = SequenceFlow({id: 'flow1', parent: {id: 'process1'}}, context);
        const sequenceFlow2 = SequenceFlow({id: 'flow2', parent: {id: 'process1'}}, context);

        sequenceFlows.push(sequenceFlow1, sequenceFlow2);

        const activity = Activity(() => {
          return {
            execute() {},
          };
        }, {
          id: 'activity',
          isParallelGateway: true,
          parent: {
            id: 'process1',
          },
        }, context);

        activity.activate();

        let message;
        activity.broker.subscribeOnce('event', 'activity.enter', (_, msg) => {
          message = msg;
        });

        sequenceFlow1.take();
        sequenceFlow2.take();

        expect(message).to.be.ok;
        expect(message.content.inbound).to.have.length(2);
        expect(message.content.inbound[0]).to.include({
          id: 'flow1',
          type: 'sequenceflow',
          action: 'take',
        });
        expect(message.content.inbound[1]).to.include({
          id: 'flow2',
          type: 'sequenceflow',
          action: 'take',
        });

        expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 0);
        expect(activity.broker.getQueue('inbound-q')).to.have.property('consumerCount', 0);
      });

      it('publishes activity enter if at least one flow is taken', () => {
        const sequenceFlows = [];
        const context = {
          environment: Environment({Logger}),
          getInboundSequenceFlows() {
            return sequenceFlows;
          },
          getOutboundSequenceFlows() {
            return [];
          },
          loadExtensions() {},
        };

        const sequenceFlow1 = SequenceFlow({id: 'flow1', parent: {id: 'process1'}}, context);
        const sequenceFlow2 = SequenceFlow({id: 'flow2', parent: {id: 'process1'}}, context);

        sequenceFlows.push(sequenceFlow1, sequenceFlow2);

        const activity = Activity(() => {
          return {
            execute() {},
          };
        }, {
          id: 'activity',
          isParallelGateway: true,
          parent: {
            id: 'process1',
          },
        }, context);

        activity.activate();

        let message;
        activity.broker.subscribeOnce('event', 'activity.enter', (_, msg) => {
          message = msg;
        });

        sequenceFlow1.discard();
        sequenceFlow2.take();

        expect(message).to.be.ok;
        expect(message.content.inbound).to.have.length(2);
        expect(message.content.inbound[0]).to.include({
          id: 'flow1',
          type: 'sequenceflow',
          action: 'discard',
        });
        expect(message.content.inbound[1]).to.include({
          id: 'flow2',
          type: 'sequenceflow',
          action: 'take',
        });

        expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 0);
      });

      it('publishes activity enter if at least one flow is taken, regardless of order', () => {
        const sequenceFlows = [];
        const context = {
          environment: Environment({Logger}),
          getInboundSequenceFlows() {
            return sequenceFlows;
          },
          getOutboundSequenceFlows() {
            return [];
          },
          loadExtensions() {},
        };

        const sequenceFlow1 = SequenceFlow({id: 'flow1', parent: {id: 'process1'}}, context);
        const sequenceFlow2 = SequenceFlow({id: 'flow2', parent: {id: 'process1'}}, context);

        sequenceFlows.push(sequenceFlow1, sequenceFlow2);

        const activity = Activity(() => {
          return {
            execute() {},
          };
        }, {
          id: 'activity',
          isParallelGateway: true,
          parent: {
            id: 'process1',
          },
        }, context);

        activity.activate();

        let message;
        activity.broker.subscribeOnce('event', 'activity.enter', (_, msg) => {
          message = msg;
        });

        sequenceFlow1.take();
        sequenceFlow2.discard();

        expect(message).to.be.ok;
        expect(message.content.inbound).to.have.length(2);
        expect(message.content.inbound[0]).to.include({
          id: 'flow1',
          type: 'sequenceflow',
          action: 'take',
        });
        expect(message.content.inbound[1]).to.include({
          id: 'flow2',
          type: 'sequenceflow',
          action: 'discard',
        });

        expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 0);
      });

      it('publishes activity discard if all flows were discarded', () => {
        const sequenceFlows = [];
        const context = {
          environment: Environment({Logger}),
          getInboundSequenceFlows() {
            return sequenceFlows;
          },
          getOutboundSequenceFlows() {
            return [];
          },
          loadExtensions() {},
        };

        const sequenceFlow1 = SequenceFlow({id: 'flow1', parent: {id: 'process1'}}, context);
        const sequenceFlow2 = SequenceFlow({id: 'flow2', parent: {id: 'process1'}}, context);

        sequenceFlows.push(sequenceFlow1, sequenceFlow2);

        const activity = Activity(() => {
          return {
            execute() {},
          };
        }, {
          id: 'activity',
          isParallelGateway: true,
          parent: {
            id: 'process1',
          },
        }, context);

        activity.activate();

        let message;
        activity.broker.subscribeOnce('event', 'activity.discard', (_, msg) => {
          message = msg;
        });

        sequenceFlow1.discard();
        sequenceFlow2.discard();

        expect(message).to.be.ok;
        expect(message.content.inbound).to.have.length(2);
        expect(message.content.inbound[0]).to.include({
          id: 'flow1',
          type: 'sequenceflow',
          action: 'discard',
        });
        expect(message.content.inbound[1]).to.include({
          id: 'flow2',
          type: 'sequenceflow',
          action: 'discard',
        });

        expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 0);
      });

      it('queues inbound before each inbound flow is taken', () => {
        const sequenceFlows = [];
        const context = {
          environment: Environment({Logger}),
          getInboundSequenceFlows() {
            return sequenceFlows;
          },
          getOutboundSequenceFlows() {
            return [];
          },
          loadExtensions() {},
        };

        const sequenceFlow1 = SequenceFlow({id: 'flow1', parent: {id: 'process1'}}, context);
        const sequenceFlow2 = SequenceFlow({id: 'flow2', parent: {id: 'process1'}}, context);

        sequenceFlows.push(sequenceFlow1, sequenceFlow2);

        const activity = Activity(() => {
          return {
            execute() {},
          };
        }, {
          id: 'activity',
          isParallelGateway: true,
          parent: {
            id: 'process1',
          },
        }, context);

        activity.activate();

        let message;
        activity.broker.subscribeOnce('event', 'activity.enter', (_, msg) => {
          message = msg;
        });

        sequenceFlow1.take();
        sequenceFlow1.take();
        sequenceFlow1.take();
        sequenceFlow2.take();

        expect(message).to.be.ok;
        expect(message.content.inbound).to.have.length(2);
        expect(message.content.inbound[0]).to.have.property('id', 'flow1');
        expect(message.content.inbound[1]).to.have.property('id', 'flow2');

        expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 2);
      });

      it('takes next when all inbound flows have been evaluated', async () => {
        const sequenceFlows = [];
        const context = {
          environment: Environment({Logger}),
          getInboundSequenceFlows() {
            return sequenceFlows;
          },
          getOutboundSequenceFlows() {
            return [];
          },
          loadExtensions() {},
        };

        const sequenceFlow1 = SequenceFlow({id: 'flow1', targetId: 'activity', parent: {id: 'process1'}}, context);
        const sequenceFlow2 = SequenceFlow({id: 'flow2', targetId: 'activity', parent: {id: 'process1'}}, context);

        sequenceFlows.push(sequenceFlow1, sequenceFlow2);

        const activity = Activity(({broker}) => {
          return {
            execute({content}) {
              broker.publish('execution', 'execute.completed', {...content});
            },
          };
        }, {
          id: 'activity',
          isParallelGateway: true,
          parent: {
            id: 'process1',
          },
        }, context);

        activity.activate();

        let message;
        activity.broker.subscribeTmp('event', 'activity.enter', (_, msg) => {
          message = msg;
        }, {noAck: true});

        let leave = activity.waitFor('leave');

        sequenceFlow1.take();
        sequenceFlow1.take();
        sequenceFlow1.take();
        sequenceFlow2.take();

        expect(message).to.be.ok;
        expect(message.content.inbound).to.have.length(2);
        expect(message.content.inbound[0]).to.have.property('id', 'flow1');
        expect(message.content.inbound[1]).to.have.property('id', 'flow2');

        expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 2);

        await leave;

        leave = activity.waitFor('leave');

        sequenceFlow2.discard();

        await leave;

        expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 1);
      });
    });
  });

  describe('run()', () => {
    it('completes run when execution completed message is received', () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
        getOutboundSequenceFlows() {
          return [];
        },
        loadExtensions() {},
      };

      const sequenceFlow = SequenceFlow({id: 'flow', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow);

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'bpmn:Task',
        parent: {
          id: 'process1',
        },
      }, context);

      const leave = activity.waitFor('leave');

      activity.run();

      activity.broker.publish('execution', 'execution.completed', {});

      return leave;
    });

    it('assigns execution completed message to run end message', async () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
        loadExtensions() {},
      };

      const sequenceFlow = SequenceFlow({id: 'flow', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow);

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'bpmn:Task',
        parent: {
          id: 'process1',
        },
      }, context);

      const leave = activity.waitFor('leave');

      activity.run();

      activity.broker.publish('execution', 'execution.completed', {output: 1});

      const leaveApi = await leave;

      expect(leaveApi.content).to.have.property('output', 1);
    });
  });

  describe('discard()', () => {
    it('discards run', () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
        loadExtensions() {},
      };

      const sequenceFlow = SequenceFlow({id: 'flow', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow);

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'bpmn:Task',
        parent: {
          id: 'process1',
        },
      }, context);

      const leave = activity.waitFor('leave');

      activity.discard();

      expect(sequenceFlow.counters).to.have.property('discard', 1);

      return leave;
    });

    it('discards execution if executing', async () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
        loadExtensions() {},
      };

      const sequenceFlow = SequenceFlow({id: 'flow', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow);

      const activity = Activity((parent) => {
        return {
          execute() {
            parent.discard();
          },
        };
      }, {
        id: 'activity',
        type: 'bpmn:Task',
        parent: {
          id: 'process1',
        },
      }, context);

      const leave = activity.waitFor('leave');
      activity.run();

      expect(sequenceFlow.counters).to.have.property('discard', 1);

      return leave;
    });

    it('discards on end', async () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
        loadExtensions() {},
      };

      const sequenceFlow = SequenceFlow({id: 'flow', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow);

      const activity = Activity(({broker}) => {
        return {
          execute({content}) {
            broker.publish('execution', 'execute.completed', content);
          },
        };
      }, {
        id: 'activity',
        type: 'bpmn:Task',
        parent: {
          id: 'process1',
        },
      }, context);

      const end = activity.waitFor('end');
      const leave = activity.waitFor('leave');

      activity.run();

      await end;
      activity.discard();

      await leave;

      expect(sequenceFlow.counters).to.have.property('discard', 1);
    });

    it('next run can be discarded by discard', async () => {
      const activity = getActivity(undefined, () => {
        return {
          execute() {},
        };
      });

      activity.activate();

      const leave = activity.waitFor('leave');

      activity.inbound[0].discard();
      activity.inbound[0].take();

      await leave;

      expect(activity).to.have.property('status', 'executing');
      expect(activity.counters).to.have.property('discarded', 1);

      expect(activity.broker.getExchange('api')).to.have.property('bindingCount', 2);

      activity.discard();

      expect(activity.counters).to.have.property('discarded', 2);

      expect(activity.broker.getExchange('api')).to.have.property('bindingCount', 0);
    });

    it('next run can be discarded by api', async () => {
      let executeMessage;
      const activity = getActivity(undefined, () => {
        return {
          execute(msg) {
            executeMessage = msg;
          },
        };
      });

      activity.activate();

      const leave = activity.waitFor('leave');

      activity.inbound[0].discard();
      activity.inbound[0].take();

      await leave;

      expect(activity).to.have.property('status', 'executing');
      expect(activity.counters).to.have.property('discarded', 1);

      expect(activity.broker.getExchange('api')).to.have.property('bindingCount', 2);

      activity.getApi(executeMessage).discard();

      expect(activity.counters).to.have.property('discarded', 2);

      expect(activity.broker.getExchange('api')).to.have.property('bindingCount', 0);
    });
  });

  describe('error', () => {
    it('throws if execute error is NOT caught', async () => {
      const activity = getActivity(undefined, ({broker}) => {
        return {
          execute(executeMessage) {
            broker.publish('execution', 'execute.error', {...executeMessage.content, error: new Error('unstable')}, {type: 'error', mandatory: true});
          },
        };
      });

      expect(activity.run).to.throw('unstable');
    });

    it('throws if activity error is NOT caught', async () => {
      const activity = getActivity(undefined, ({broker}) => {
        return {
          execute(executeMessage) {
            broker.publish('event', 'activity.error', {...executeMessage.content, error: new Error('unstable')}, {type: 'error', mandatory: true});
          },
        };
      });

      expect(activity.run).to.throw('unstable');
    });

    it('continues execution if execute error is caught', async () => {
      const activity = getActivity(undefined, ({broker}) => {
        return {
          execute(executeMessage) {
            broker.publish('execution', 'execute.error', {...executeMessage.content, error: new Error('unstable')}, {type: 'error', mandatory: true});
          },
        };
      });

      let message;
      activity.broker.subscribeOnce('event', 'activity.error', (_, msg) => {
        message = msg;
      });

      const leave = new Promise((resolve) => {
        activity.broker.subscribeOnce('event', 'activity.leave', (_, msg) => {
          resolve(msg);
        });
      });

      activity.run();

      await leave;

      expect(message).to.be.ok;
    });
  });

  describe('outbound', () => {
    it('takes outbound when completed', () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
        loadExtensions() {},
      };

      const sequenceFlow = SequenceFlow({id: 'flow', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow);

      const activity = Activity(({broker}) => {
        return {
          execute({content}) {
            broker.publish('execution', 'execute.completed', content);
          },
        };
      }, {
        id: 'activity',
        type: 'bpmn:Task',
        parent: {
          id: 'process1',
        },
      }, context);

      const leave = activity.waitFor('leave');

      activity.activate();
      activity.run();

      expect(sequenceFlow.counters).to.have.property('take', 1);

      return leave;
    });

    it('forwards execute completed message', async () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
        loadExtensions() {},
      };

      const sequenceFlow = SequenceFlow({id: 'flow', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow);

      const activity = Activity(({broker}) => {
        return {
          execute({content}) {
            broker.publish('execution', 'execute.completed', {...content, message: 1});
          },
        };
      }, {
        id: 'activity',
        type: 'bpmn:Task',
        parent: {
          id: 'process1',
        },
      }, context);

      let takeMessage;
      sequenceFlow.broker.subscribeOnce('event', 'flow.take', (_, msg) => {
        takeMessage = msg;
      });

      const leave = activity.waitFor('leave');

      activity.activate();
      activity.run();

      expect(sequenceFlow.counters).to.have.property('take', 1);

      await leave;

      expect(takeMessage).to.be.ok;
      expect(takeMessage).to.have.property('content').with.property('message', 1);
    });

    it('takes all outbound when completed', () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
        loadExtensions() {},
      };

      const sequenceFlow1 = SequenceFlow({id: 'flow1', parent: {id: 'process1'}}, context);
      const sequenceFlow2 = SequenceFlow({id: 'flow2', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow1, sequenceFlow2);

      const activity = Activity(({broker}) => {
        return {
          execute({content}) {
            broker.publish('execution', 'execute.completed', content);
          },
        };
      }, {
        id: 'activity',
        type: 'bpmn:Task',
        parent: {
          id: 'process1',
        },
      }, context);

      const leave = activity.waitFor('leave');

      activity.activate();
      activity.run();

      expect(sequenceFlow1.counters).to.have.property('take', 1);
      expect(sequenceFlow2.counters).to.have.property('take', 1);

      return leave;
    });

    it('respects outbound actions during execution', () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
        loadExtensions() {},
      };

      const sequenceFlow1 = SequenceFlow({id: 'flow1', parent: {id: 'process1'}}, context);
      const sequenceFlow2 = SequenceFlow({id: 'flow2', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow1, sequenceFlow2);

      const activity = Activity(({broker}) => {
        return {
          execute({content}) {
            broker.publish('execution', 'execute.completed', {
              ...content,
              outbound: [{
                id: 'flow1',
                action: 'take',
              }, {
                id: 'flow2',
                action: 'discard',
              }],
            });
          },
        };
      }, {
        id: 'activity',
        type: 'bpmn:ExclusiveGateway',
        parent: {
          id: 'process1',
        },
      }, context);

      const leave = activity.waitFor('leave');

      activity.activate();
      activity.run();

      expect(sequenceFlow1.counters).to.have.property('take', 1);
      expect(sequenceFlow2.counters).to.have.property('discard', 1);

      return leave;
    });

    it('discards outbound when discarded', () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
        loadExtensions() {},
      };

      const sequenceFlow = SequenceFlow({id: 'flow', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow);

      const activity = Activity(({broker}) => {
        return {
          execute({content}) {
            broker.publish('execution', 'execute.completed', content);
          },
        };
      }, {
        id: 'activity',
        type: 'bpmn:Task',
        parent: {
          id: 'process1',
        },
      }, context);

      const leave = activity.waitFor('leave');

      activity.discard();

      expect(sequenceFlow.counters).to.have.property('discard', 1);

      return leave;
    });

    it('respects all outbound discarded during execution', () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
        loadExtensions() {},
      };

      const sequenceFlow1 = SequenceFlow({id: 'flow1', parent: {id: 'process1'}}, context);
      const sequenceFlow2 = SequenceFlow({id: 'flow2', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow1, sequenceFlow2);

      const activity = Activity(({broker}) => {
        return {
          execute({content}) {
            broker.publish('execution', 'execute.completed', {
              ...content,
              outbound: [{
                id: 'flow1',
                action: 'discard',
              }, {
                id: 'flow2',
                action: 'discard',
              }],
            });
          },
        };
      }, {
        id: 'activity',
        type: 'bpmn:ExclusiveGateway',
        parent: {
          id: 'process1',
        },
      }, context);

      const leave = activity.waitFor('leave');

      activity.activate();
      activity.run();

      expect(sequenceFlow1.counters).to.have.property('discard', 1);
      expect(sequenceFlow2.counters).to.have.property('discard', 1);

      return leave;
    });

    it('uses last action from evaluated flows during execution', () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
        loadExtensions() {},
      };

      const sequenceFlow1 = SequenceFlow({id: 'flow1', parent: {id: 'process1'}}, context);
      const sequenceFlow2 = SequenceFlow({id: 'flow2', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow1, sequenceFlow2);

      const activity = Activity(({broker}) => {
        return {
          execute({content}) {
            broker.publish('execution', 'execute.completed', {
              ...content,
              outbound: [{
                id: 'flow1',
                action: 'discard',
              }, {
                id: 'flow2',
                action: 'discard',
              }, {
                id: 'flow1',
                action: 'take',
              }],
            });
          },
        };
      }, {
        id: 'activity',
        type: 'bpmn:ExclusiveGateway',
        parent: {
          id: 'process1',
        },
      }, context);

      const leave = activity.waitFor('leave');

      activity.activate();
      activity.run();

      expect(sequenceFlow1.counters).to.have.property('take', 1);
      expect(sequenceFlow2.counters).to.have.property('discard', 1);

      return leave;
    });

    it('discards flows and adds activity id to discard sequence when discarded', () => {
      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
        loadExtensions() {},
      };

      const sequenceFlow1 = SequenceFlow({id: 'flow1', sourceId: 'activity', parent: {id: 'process1'}}, context);
      const sequenceFlow2 = SequenceFlow({id: 'flow2', sourceId: 'activity', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow1, sequenceFlow2);

      const messages = [];
      sequenceFlow1.broker.subscribeOnce('event', 'flow.discard', (_, {content}) => {
        messages.push(content);
      });
      sequenceFlow2.broker.subscribeOnce('event', 'flow.discard', (_, {content}) => {
        messages.push(content);
      });

      const activity = Activity(({broker}) => {
        return {
          execute({content}) {
            broker.publish('execution', 'execute.completed', {
              ...content,
              outbound: [{
                id: 'flow1',
                action: 'discard',
              }, {
                id: 'flow2',
                action: 'discard',
              }],
            });
          },
        };
      }, {
        id: 'activity',
        type: 'bpmn:ExclusiveGateway',
        parent: {
          id: 'process1',
        },
      }, context);

      const leave = activity.waitFor('leave');

      activity.activate();
      activity.run();

      expect(messages).to.have.length(2);
      expect(messages[0]).to.have.property('discardSequence').that.eql(['activity']);
      expect(messages[1]).to.have.property('discardSequence').that.eql(['activity']);

      return leave;
    });

    it('discards flows and appends activity id to discard sequence if discarded', () => {
      const inboundFlows = [];
      const outboundFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return inboundFlows;
        },
        getOutboundSequenceFlows() {
          return outboundFlows;
        },
        loadExtensions() {},
      };

      const sequenceFlow0 = SequenceFlow({id: 'flow0', sourceId: 'start', targetId: 'activity', parent: {id: 'process1'}}, context);
      inboundFlows.push(sequenceFlow0);

      const sequenceFlow1 = SequenceFlow({id: 'flow1', sourceId: 'activity', parent: {id: 'process1'}}, context);
      const sequenceFlow2 = SequenceFlow({id: 'flow2', sourceId: 'activity', parent: {id: 'process1'}}, context);
      outboundFlows.push(sequenceFlow1, sequenceFlow2);

      const messages = [];
      sequenceFlow1.broker.subscribeOnce('event', 'flow.discard', (_, {content}) => {
        messages.push(content);
      });
      sequenceFlow2.broker.subscribeOnce('event', 'flow.discard', (_, {content}) => {
        messages.push(content);
      });

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'bpmn:ExclusiveGateway',
        parent: {
          id: 'process1',
        },
      }, context);

      const leave = activity.waitFor('leave');

      activity.activate();
      sequenceFlow0.discard();

      expect(messages).to.have.length(2);
      expect(messages[0]).to.have.property('discardSequence').that.eql(['start', 'activity']);
      expect(messages[1]).to.have.property('discardSequence').that.eql(['start', 'activity']);

      return leave;
    });

    it('join activity concats discard sequence when discarded', () => {
      const inboundFlows = [];
      const outboundFlows = [];
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return inboundFlows;
        },
        getOutboundSequenceFlows() {
          return outboundFlows;
        },
        loadExtensions() {},
      };

      const sequenceFlow1 = SequenceFlow({id: 'flow1', sourceId: 'start1', parent: {id: 'process1'}}, context);
      const sequenceFlow2 = SequenceFlow({id: 'flow2', sourceId: 'task', parent: {id: 'process1'}}, context);

      inboundFlows.push(sequenceFlow1, sequenceFlow2);

      const sequenceFlow3 = SequenceFlow({id: 'flow3', sourceId: 'activity', parent: {id: 'process1'}}, context);
      const sequenceFlow4 = SequenceFlow({id: 'flow4', sourceId: 'activity', parent: {id: 'process1'}}, context);
      outboundFlows.push(sequenceFlow3, sequenceFlow4);

      const messages = [];
      sequenceFlow3.broker.subscribeOnce('event', 'flow.discard', (_, {content}) => {
        messages.push(content);
      });
      sequenceFlow4.broker.subscribeOnce('event', 'flow.discard', (_, {content}) => {
        messages.push(content);
      });

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        isParallelGateway: true,
        parent: {
          id: 'process1',
        },
      }, context);

      const leave = activity.waitFor('leave');

      activity.activate();
      sequenceFlow1.discard();
      sequenceFlow2.discard({discardSequence: ['start2']});

      expect(messages).to.have.length(2);
      expect(messages[0]).to.have.property('discardSequence').that.eql(['start1', 'start2', 'task', 'activity']);
      expect(messages[1]).to.have.property('discardSequence').that.eql(['start1', 'start2', 'task', 'activity']);

      return leave;
    });
  });

  describe('extensions', () => {
    it('activates extensions on enter', () => {
      const attachedTo = ActivityBroker();
      attachedTo.id = 'task';

      let activateMessage;
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return [];
        },
        loadExtensions() {
          return {
            activate(msg) {
              activateMessage = msg;
            },
          };
        },
      };

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'task',
        parent: {
          id: 'process1',
        },
      }, context);

      activity.run();

      expect(activateMessage).to.be.ok;
      expect(activateMessage.fields).to.have.property('routingKey', 'run.enter');
    });

    it('activates extensions on discard', () => {
      const attachedTo = ActivityBroker();
      attachedTo.id = 'task';

      let activateMessage;
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return [];
        },
        loadExtensions() {
          return {
            activate(msg) {
              activateMessage = msg;
            },
          };
        },
      };

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'task',
        parent: {
          id: 'process1',
        },
      }, context);

      activity.discard();

      expect(activateMessage).to.be.ok;
      expect(activateMessage.fields).to.have.property('routingKey', 'run.discard');
    });

    it('activates extensions on resume', () => {
      const attachedTo = ActivityBroker();
      attachedTo.id = 'task';

      let activateMessage;
      const context = {
        environment: Environment({Logger}),
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return [];
        },
        loadExtensions() {
          return {
            activate(msg) {
              activateMessage = msg;
            },
          };
        },
      };

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'task',
        parent: {
          id: 'process1',
        },
      }, context);

      activity.run();
      activity.stop();
      activity.resume();

      expect(activateMessage).to.be.ok;
      expect(activateMessage.fields).to.have.property('routingKey', 'run.execute');
    });
  });

  describe('attached to activity', () => {
    it('starts run when inbound sequence flow is taken', () => {
      const attachedTo = {
        id: 'task',
        parent: {
          id: 'process1',
        },
        broker: ActivityBroker().broker,
      };

      const context = {
        environment: Environment({Logger}),
        getActivityById(id) {
          if (id === 'task') return attachedTo;
        },
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return [];
        },
        loadExtensions() {},
      };

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'bpmn:BoundaryEvent',
        behaviour: {
          attachedTo: {
            id: 'task',
          },
        },
        parent: {
          id: 'process1',
        },
      }, context);

      activity.activate();

      const enter = activity.waitFor('enter');
      attachedTo.broker.publish('event', 'activity.enter', {id: 'event'});

      return enter;
    });

    it('publishes activity enter with attached to', () => {
      const attachedTo = {
        id: 'task',
        parent: {
          id: 'process1',
        },
        broker: ActivityBroker().broker,
      };

      const context = {
        environment: Environment({Logger}),
        getActivityById(id) {
          if (id === 'task') return attachedTo;
        },
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return [];
        },
        loadExtensions() {},
      };

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'bpmn:BoundaryEvent',
        behaviour: {
          attachedTo: {
            id: 'task',
          },
        },
        parent: {
          id: 'process1',
        },
      }, context);

      activity.activate();

      let message;
      activity.broker.subscribeOnce('event', 'activity.enter', (_, msg) => {
        message = msg;
      });

      attachedTo.broker.publish('event', 'activity.enter', {id: 'task', type: 'bpmn:ServiceTask'});

      expect(message).to.be.ok;
      expect(message.content.inbound).to.have.length(1);
      expect(message.content.inbound[0]).to.include({
        id: 'task',
        type: 'bpmn:ServiceTask',
      });
      expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 0);
    });

    it('discards activity with discard sequence if attachedTo is discarded', () => {
      const attachedTo = {
        id: 'task',
        parent: {
          id: 'process1',
        },
        broker: ActivityBroker().broker,
      };

      const context = {
        environment: Environment({Logger}),
        getActivityById(id) {
          if (id === 'task') return attachedTo;
        },
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return [];
        },
        loadExtensions() {},
      };

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'bpmn:BoundaryEvent',
        behaviour: {
          attachedTo: {
            id: 'task',
          },
        },
        parent: {
          id: 'process1',
        },
      }, context);

      activity.activate();

      let message;
      activity.broker.subscribeOnce('event', 'activity.discard', (_, msg) => {
        message = msg;
      });

      attachedTo.broker.publish('event', 'activity.discard', {id: 'task', type: 'bpmn:ServiceTask', discardSequence: ['start']});

      expect(message).to.be.ok;
      expect(message.content.inbound).to.have.length(1);
      expect(message.content.discardSequence).to.eql(['start']);
      expect(message.content.inbound[0]).to.include({
        id: 'task',
        type: 'bpmn:ServiceTask',
      });
      expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 0);
    });

    it('discards activity outbound with discard sequence if attachedTo is discarded', () => {
      const attachedTo = {
        id: 'task',
        parent: {
          id: 'process1',
        },
        broker: ActivityBroker().broker,
      };

      const sequenceFlows = [];
      const context = {
        environment: Environment({Logger}),
        getActivityById(id) {
          if (id === 'task') return attachedTo;
        },
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
        loadExtensions() {},
      };

      const sequenceFlow1 = SequenceFlow({id: 'flow1', sourceId: 'activity', parent: {id: 'process1'}}, context);
      const sequenceFlow2 = SequenceFlow({id: 'flow2', sourceId: 'activity', parent: {id: 'process1'}}, context);
      sequenceFlows.push(sequenceFlow1, sequenceFlow2);

      const messages = [];
      sequenceFlow1.broker.subscribeOnce('event', 'flow.discard', (_, {content}) => {
        messages.push(content);
      });
      sequenceFlow2.broker.subscribeOnce('event', 'flow.discard', (_, {content}) => {
        messages.push(content);
      });

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'bpmn:BoundaryEvent',
        behaviour: {
          attachedTo: {
            id: 'task',
          },
        },
        parent: {
          id: 'process1',
        },
      }, context);

      activity.activate();
      const leave = activity.waitFor('leave');

      attachedTo.broker.publish('event', 'activity.discard', {id: 'task', type: 'bpmn:ServiceTask', discardSequence: ['start']});

      expect(messages).to.have.length(2);
      expect(messages[0]).to.have.property('discardSequence').that.eql(['start', 'activity']);
      expect(messages[1]).to.have.property('discardSequence').that.eql(['start', 'activity']);

      return leave;
    });

    it('queues attached to starts if already running', () => {
      const attachedTo = ActivityBroker();
      const context = {
        environment: Environment({Logger}),
        getActivityById(id) {
          if (id === 'task') return attachedTo;
        },
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return [];
        },
        loadExtensions() {},
      };

      const activity = Activity(() => {
        return {
          execute() {},
        };
      }, {
        id: 'activity',
        type: 'bpmn:BoundaryEvent',
        behaviour: {
          attachedTo: {
            id: 'task',
          },
        },
        parent: {
          id: 'process1',
        },
      }, context);

      activity.activate();

      let message;
      activity.broker.subscribeOnce('event', 'activity.enter', (_, msg) => {
        message = msg;
      });

      attachedTo.broker.publish('event', 'activity.enter', {id: 'task', type: 'bpmn:ServiceTask'});
      attachedTo.broker.publish('event', 'activity.enter', {id: 'task', type: 'bpmn:ServiceTask'});

      expect(message).to.be.ok;
      expect(message.content.inbound).to.have.length(1);
      expect(message.content.inbound[0]).to.have.property('id', 'task');

      expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 1);
      expect(activity.broker.getQueue('inbound-q')).to.have.property('consumerCount', 0);
    });
  });

  describe('waitFor()', () => {
    it('returns promise that resolves when event occur', async () => {
      const activity = getActivity(undefined, TaskBehaviour);
      const leave = activity.waitFor('leave');

      activity.run();

      return leave;
    });

    it('waiting for error resolves to activity api with error in content', async () => {
      const activity = getActivity(undefined, ({broker}) => {
        return {
          execute(executeMessage) {
            broker.publish('event', 'activity.error', {...executeMessage.content, error: new Error('unstable')}, {type: 'error', mandatory: true});
          },
        };
      });

      const error = activity.waitFor('error');

      activity.run();

      const api = await error;
      expect(api.content.error.message).to.equal('unstable');
    });

    it('rejects if activity error is published', (done) => {
      const activity = getActivity(undefined, ({broker}) => {
        return {
          execute(executeMessage) {
            broker.publish('event', 'activity.error', {...executeMessage.content, error: new Error('unstable')}, {type: 'error', mandatory: true});
          },
        };
      });

      activity.waitFor('leave').catch((err) => {
        expect(err.message).to.equal('unstable');
        done();
      });

      activity.run();
    });

    it('rejects if execute error is published', (done) => {
      const activity = getActivity(undefined, ({broker}) => {
        return {
          execute(executeMessage) {
            broker.publish('execution', 'execute.error', {...executeMessage.content, error: new Error('unstable')});
          },
        };
      });

      activity.waitFor('leave').catch((err) => {
        expect(err.message).to.equal('unstable');
        done();
      });

      activity.run();
    });
  });

  describe('stop()', () => {
    it('stops all activity', () => {
      const activity = getActivity(undefined, () => {
        return {
          execute() {},
        };
      });

      activity.run();

      activity.stop();

      expect(activity.stopped).to.be.true;
      expect(activity.status).to.equal('executing');

      const runQ = activity.broker.getQueue('run-q');
      expect(runQ).to.have.property('consumerCount', 0);
      expect(runQ).to.have.property('messageCount', 1);

      expect(runQ.peek()).to.have.property('fields').with.property('redelivered', true);

      expect(activity.broker.getQueue('execution-q')).to.have.property('consumerCount', 0);
      expect(activity.broker.getQueue('format-run-q')).to.have.property('consumerCount', 0);
    });

    it('stops all executions', () => {
      const activity = getActivity(undefined, ({broker}) => {
        return {
          execute({content}) {
            if (content.isSubExec) return;
            broker.publish('execution', 'execute.start', {...content, executionId: 'activity_sub_exec', isSubExec: true});
          },
        };
      });

      const apiMsgs = [];
      activity.broker.subscribeTmp('api', '#', (_, msg) => {
        apiMsgs.push(msg);
      }, {noAck: true});

      activity.run();

      activity.stop();

      expect(apiMsgs).to.have.length(2);
      expect(apiMsgs[0].properties).to.have.property('type', 'stop');
      expect(apiMsgs[0].content).to.have.property('isRootScope', true);
      expect(apiMsgs[1].fields).to.have.property('routingKey', 'activity.stop.activity_sub_exec');
      expect(apiMsgs[1].properties).to.have.property('type', 'stop');
    });

    it('next run can be stopped', async () => {
      const activity = getActivity(undefined, () => {
        return {
          execute() {},
        };
      });

      activity.activate();

      const leave = activity.waitFor('leave');

      activity.inbound[0].discard();
      activity.inbound[0].take();

      await leave;

      expect(activity).to.have.property('status', 'executing');
      expect(activity.counters).to.have.property('discarded', 1);

      expect(activity.broker.getExchange('api')).to.have.property('bindingCount', 2);

      activity.stop();

      expect(activity.broker.getExchange('api')).to.have.property('bindingCount', 0);
      expect(activity.broker.getQueue('execution-q')).to.have.property('consumerCount', 0);
      expect(activity.broker.getQueue('format-run-q')).to.have.property('consumerCount', 0);
    });

    it('next run can be stopped by api', async () => {
      let executeMessage;
      const activity = getActivity(undefined, () => {
        return {
          execute(msg) {
            executeMessage = msg;
          },
        };
      });

      activity.activate();

      const leave = activity.waitFor('leave');

      activity.inbound[0].discard();
      activity.inbound[0].take();

      await leave;

      expect(activity).to.have.property('status', 'executing');
      expect(activity.counters).to.have.property('discarded', 1);

      expect(activity.broker.getExchange('api')).to.have.property('bindingCount', 2);

      activity.getApi(executeMessage).stop();

      expect(activity.broker.getExchange('api')).to.have.property('bindingCount', 0);
      expect(activity.broker.getQueue('execution-q')).to.have.property('consumerCount', 0);
      expect(activity.broker.getQueue('format-run-q')).to.have.property('consumerCount', 0);
    });
  });

  describe('getState()', () => {
    it('returns expected state when not running', () => {
      const activity = getActivity(undefined, () => {
        return {
          execute() {},
        };
      });
      const state = activity.getState();

      expect(state.status).to.be.undefined;
      expect(state.counters).to.eql({discarded: 0, taken: 0});
      expect(state).to.have.property('broker').with.property('queues');
      expect(state.execution).to.be.undefined;
    });

    it('returns expected state when running', () => {
      const activity = getActivity(undefined, () => {
        return {
          execute() {},
          getState() {
            return {
              behaviourState: true
            };
          },
        };
      });
      activity.run();
      const state = activity.getState();

      expect(state).to.have.property('status', 'executing');
      expect(state).to.have.property('execution').with.property('completed', false);
      expect(state.execution).to.have.property('behaviourState', true);
      expect(state.counters).to.eql({discarded: 0, taken: 0});
      expect(state).to.have.property('broker').with.property('queues');
    });

    it('returns expected state when stopped', () => {
      const activity = getActivity(undefined, () => {
        return {
          execute() {},
        };
      });

      activity.run();
      activity.stop();

      const state = activity.getState();

      expect(state.counters).to.eql({discarded: 0, taken: 0});
      expect(state.status).to.equal('executing');
      expect(state).to.have.property('broker').with.property('queues');
    });

    it('returns expected state when completed', () => {
      const activity = getActivity(undefined, ({broker}) => {
        return {
          execute(executeMessage) {
            broker.publish('execution', 'execute.completed', executeMessage.content);
          },
        };
      });

      activity.run();

      const state = activity.getState();

      expect(state.status).to.be.undefined;
      expect(state.counters).to.eql({discarded: 0, taken: 1});
      expect(state).to.have.property('broker').with.property('queues');
    });

    it('returns expected state when completed twice', () => {
      const activity = getActivity(undefined, TaskBehaviour);

      activity.run();
      activity.run();

      const state = activity.getState();

      expect(state.status).to.be.undefined;
      expect(state.counters).to.eql({discarded: 0, taken: 2});
      expect(state).to.have.property('broker').with.property('queues');
    });

    it('returns expected state when discarded', () => {
      const activity = getActivity(undefined, TaskBehaviour);

      activity.discard();

      const state = activity.getState();

      expect(state.status).to.be.undefined;
      expect(state.counters).to.eql({discarded: 1, taken: 0});
      expect(state).to.have.property('broker').with.property('queues');
    });

    it('returns expected state when discarded and completed', () => {
      const activity = getActivity(undefined, TaskBehaviour);

      activity.discard();
      activity.run();

      const state = activity.getState();

      expect(state.status).to.be.undefined;
      expect(state.counters).to.eql({discarded: 1, taken: 1});
      expect(state).to.have.property('broker').with.property('queues');
    });
  });

  describe('recover()', () => {
    it('recovers stopped activity without state', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);
      activity.run();
      activity.stop();

      activity.recover();

      expect(activity.stopped).to.be.true;
      expect(activity.status).to.equal('executing');

      expect(activity.broker.getQueue('run-q')).to.have.property('consumerCount', 0);
      expect(activity.broker.getQueue('execution-q')).to.have.property('consumerCount', 0);
      expect(activity.broker.getQueue('format-run-q')).to.have.property('consumerCount', 0);
    });

    it('recovers stopped activity with state', () => {
      let activityState;
      const activity = getActivity(undefined, () => {
        return {
          execute() {},
          getState() {
            return {
              behaviourState: true
            };
          },
          recover(executionState) {
            activityState = executionState;
          }
        };
      });
      activity.run();
      activity.stop();

      const state = activity.getState();

      activity.recover(state);

      expect(activity.stopped).to.be.true;
      expect(activity.status).to.equal('executing');
      expect(activity.execution).to.be.ok;
      expect(activity.execution).to.have.property('completed', false);

      expect(activity.broker.getQueue('run-q')).to.have.property('consumerCount', 0);
      expect(activity.broker.getQueue('execution-q')).to.have.property('consumerCount', 0);
      expect(activity.broker.getQueue('format-run-q')).to.have.property('consumerCount', 0);

      expect(activityState).to.have.property('behaviourState', true);
    });

    it('recovers new activity with state', () => {
      let activityState;
      const activity = getActivity(undefined, () => {
        return {
          execute() {},
          getState() {
            return {
              behaviourState: true
            };
          },
        };
      });
      activity.run();
      activity.stop();

      const state = activity.getState();

      const recoveredActivity = getActivity(undefined, () => {
        return {
          execute() {},
          recover(executionState) {
            activityState = executionState;
          }
        };
      });

      recoveredActivity.recover(state);

      expect(recoveredActivity.stopped).to.be.true;
      expect(recoveredActivity.status).to.equal('executing');
      expect(recoveredActivity.execution).to.be.ok;
      expect(recoveredActivity.execution).to.have.property('completed', false);

      expect(recoveredActivity.broker.getQueue('run-q')).to.have.property('consumerCount', 0);
      expect(recoveredActivity.broker.getQueue('execution-q')).to.have.property('consumerCount', 0);
      expect(recoveredActivity.broker.getQueue('format-run-q')).to.have.property('consumerCount', 0);

      expect(activityState).to.have.property('behaviourState', true);
    });

    it('recovers new activity with running state', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);
      activity.run();
      expect(activity.counters).to.eql({discarded: 0, taken: 0});

      const state = activity.getState();
      state.counters.taken = 1;

      const recoveredActivity = getActivity(undefined, SignalTaskBehaviour);
      recoveredActivity.recover(state);

      expect(recoveredActivity.status).to.equal('executing');
      expect(recoveredActivity.counters).to.eql({discarded: 0, taken: 1});

      expect(recoveredActivity.broker.getQueue('run-q')).to.have.property('consumerCount', 0);
      expect(recoveredActivity.broker.getQueue('run-q')).to.have.property('messageCount', 1);
      expect(recoveredActivity.broker.getQueue('execution-q')).to.have.property('consumerCount', 0);
      expect(recoveredActivity.broker.getQueue('execution-q')).to.have.property('messageCount', 0);
      expect(recoveredActivity.broker.getQueue('execute-q')).to.have.property('consumerCount', 0);
      expect(recoveredActivity.broker.getQueue('execute-q')).to.have.property('messageCount', 1);
    });

    it('throws if recover is called if activity is running', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);
      activity.run();

      const state = activity.getState();

      expect(() => {
        activity.recover(state);
      }).to.throw('cannot recover running activity');
    });
  });

  describe('resume()', () => {
    it('resumes all activity', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);

      activity.run();
      activity.stop();

      activity.resume();

      expect(activity.stopped).to.be.false;
      expect(activity.status).to.equal('executing');

      expect(activity.broker.getQueue('run-q')).to.have.property('consumerCount', 1);
      expect(activity.broker.getQueue('execution-q')).to.have.property('consumerCount', 1);
      expect(activity.broker.getQueue('format-run-q')).to.have.property('consumerCount', 0);
      expect(activity.broker.getQueue('execute-q')).to.have.property('consumerCount', 1);
      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 2);

      activity.getApi().signal();
      expect(activity.counters).to.eql({discarded: 0, taken: 1});
    });

    it('resumes recovered activity with state', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);

      activity.run();

      activity.stop();
      expect(activity.counters).to.eql({discarded: 0, taken: 0});

      const state = activity.getState();
      const recoveredActivity = getActivity(undefined, SignalTaskBehaviour);
      recoveredActivity.recover(state);

      recoveredActivity.resume();

      expect(recoveredActivity.broker.getQueue('run-q')).to.have.property('consumerCount', 1);
      expect(recoveredActivity.broker.getQueue('run-q')).to.have.property('messageCount', 2);
      expect(recoveredActivity.broker.getQueue('execution-q')).to.have.property('consumerCount', 1);
      expect(recoveredActivity.broker.getQueue('execution-q')).to.have.property('messageCount', 0);
      expect(recoveredActivity.broker.getQueue('execute-q')).to.have.property('consumerCount', 1);
      expect(recoveredActivity.broker.getQueue('execute-q')).to.have.property('messageCount', 2);

      recoveredActivity.getApi().signal();
      expect(recoveredActivity.counters).to.eql({discarded: 0, taken: 1});
    });

    it('resumes recovered activity with running state', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);

      activity.run();

      expect(activity.counters).to.eql({discarded: 0, taken: 0});

      const state = activity.getState();
      const recoveredActivity = getActivity(undefined, SignalTaskBehaviour);

      recoveredActivity.recover(state);

      recoveredActivity.resume();

      expect(recoveredActivity.broker.getQueue('run-q')).to.have.property('consumerCount', 1);
      expect(recoveredActivity.broker.getQueue('run-q')).to.have.property('messageCount', 2);
      expect(recoveredActivity.broker.getQueue('execution-q')).to.have.property('consumerCount', 1);
      expect(recoveredActivity.broker.getQueue('execution-q')).to.have.property('messageCount', 0);
      expect(recoveredActivity.broker.getQueue('execute-q')).to.have.property('consumerCount', 1);
      expect(recoveredActivity.broker.getQueue('execute-q')).to.have.property('messageCount', 2);

      recoveredActivity.getApi().signal();
      expect(recoveredActivity.counters).to.eql({discarded: 0, taken: 1});
    });

    it('throws if resume is called when activity is running', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);
      activity.run();

      expect(() => {
        activity.resume();
      }).to.throw('cannot resume running activity');
    });
  });
});

function getActivity(override = {}, Behaviour = TaskBehaviour) {
  const activity = Activity(Behaviour, {
    id: 'activity',
    type: 'test:activity',
    parent: {
      id: 'process1',
    },
    ...override,
  }, getContext());
  return activity;
}

function getContext() {
  const environment = Environment({Logger: testHelpers.Logger});
  return {
    environment,
    getActivityExtensions() {
      return {};
    },
    getInboundSequenceFlows() {
      return [SequenceFlow({id: 'flow', parent: {id: 'process1'}}, {environment})];
    },
    getOutboundMessageFlows() {
      return [];
    },
    getOutboundSequenceFlows() {
      return [];
    },
    loadExtensions() {},
  };
}
