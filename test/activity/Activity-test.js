import Activity from '../../src/activity/Activity.js';
import Association from '../../src/flows/Association.js';
import Environment from '../../src/Environment.js';
import SequenceFlow from '../../src/flows/SequenceFlow.js';
import testHelpers from '../helpers/testHelpers.js';
import { ActivityBroker } from '../../src/EventBroker.js';
import { TaskBehaviour, SignalTaskBehaviour } from '../../src/tasks/index.js';

function Behaviour() {
  return {
    execute() {},
  };
}

function CompleteBehaviour({ broker }) {
  return {
    execute({ content }) {
      broker.publish('execution', 'execute.completed', { ...content });
    },
  };
}

const behaviours = {
  Behaviour,
  CompleteBehaviour,
};

describe('Activity', () => {
  describe('properties', () => {
    it('isEnd is truthy when no outbound flows', () => {
      const sequenceFlows = [];
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      let activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      expect(activity).to.have.property('isEnd', true);

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      expect(activity).to.have.property('isEnd', false);
    });

    it('isMultiInstance indicates multi instance', () => {
      const sequenceFlows = [];
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      let activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      expect(activity).to.have.property('isMultiInstance', false);

      activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
          behaviour: {
            loopCharacteristics: {},
          },
        },
        context,
      );

      expect(activity).to.have.property('isMultiInstance', true);
    });

    it('isForCompensation indicates compensation behaviour', () => {
      const associations = [];
      const context = getContext({
        getInboundAssociations() {
          return associations;
        },
      });

      let activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      expect(activity).to.have.property('isForCompensation', false);

      activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
          behaviour: {
            isForCompensation: true,
          },
        },
        context,
      );

      expect(activity).to.have.property('isForCompensation', true);
    });

    it('attachedTo return null if not boundary event', () => {
      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        testHelpers.emptyContext(),
      );

      expect(activity).to.have.property('attachedTo', null);
    });
  });

  describe('run on inbound', () => {
    it('starts run when inbound sequence flow is taken', () => {
      const sequenceFlows = [];
      const context = getContext({
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      const enter = activity.waitFor('enter');

      activity.activate();
      sequenceFlow.take();

      expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 0);

      return enter;
    });

    it('publishes activity enter with taken flow', () => {
      const sequenceFlows = [];
      const context = getContext({
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

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
      const context = getContext({
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

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
      const context = getContext({
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      activity.activate();

      sequenceFlow.take();
      sequenceFlow.take();

      expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 1);
      expect(activity.broker.getQueue('inbound-q')).to.have.property('consumerCount', 0);
    });

    it('immediate activity starts next run when completed with first', () => {
      const sequenceFlows = [];
      const context = getContext({
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.CompleteBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      activity.activate();

      sequenceFlow.take();
      sequenceFlow.take();

      expect(activity.counters).to.have.property('taken', 2);
    });

    it('postponed activity starts next run when completed with first', () => {
      const sequenceFlows = [];
      const context = getContext({
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const executeMessages = [];
      function CollectBehaviour() {
        return {
          execute(message) {
            executeMessages.push(message);
          },
        };
      }

      const activity = new Activity(
        CollectBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      activity.activate();

      sequenceFlow.take();
      sequenceFlow.take();

      expect(executeMessages).to.have.length(1);
      expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 1);
      activity.broker.publish('execution', 'execute.completed', executeMessages.pop().content);

      expect(executeMessages).to.have.length(1);
      expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 0);
    });

    it('postponed activity starts next run when first two were discarded', () => {
      const sequenceFlows = [];
      const context = getContext({
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const executeMessages = [];
      function CollectBehaviour() {
        return {
          execute(message) {
            executeMessages.push(message);
          },
        };
      }

      const activity = new Activity(
        CollectBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      activity.activate();

      sequenceFlow.discard();
      sequenceFlow.discard();
      sequenceFlow.take();

      expect(executeMessages).to.have.length(1);
      expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 0);
    });

    it('discards next run when completed with first', () => {
      const sequenceFlows = [];
      const context = getContext({
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.CompleteBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      activity.activate();

      sequenceFlow.take();
      sequenceFlow.discard();
      sequenceFlow.discard();
      sequenceFlow.discard();

      expect(activity.counters).to.have.property('taken', 1);
      expect(activity.counters).to.have.property('discarded', 3);
    });

    it('forwards message from inbound to execution', () => {
      const sequenceFlows = [];
      const context = getContext({
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      let executeMessage;
      function SpecialBehaviour({ broker }) {
        return {
          execute(msg) {
            executeMessage = msg;
            broker.publish('execution', 'execute.completed', { ...msg.content });
          },
        };
      }

      const activity = new Activity(
        SpecialBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      activity.activate();
      sequenceFlow.take({ message: 1 });

      expect(executeMessage).to.be.ok;
      expect(executeMessage).to.have.property('content').with.property('message', 1);
    });

    it('removes run on inbound listener when deactivated on leave', () => {
      const sequenceFlows = [];
      const context = getContext({
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.CompleteBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      activity.activate();

      activity.broker.subscribeOnce('event', 'activity.leave', () => {
        activity.deactivate();
      });

      sequenceFlow.take();
      sequenceFlow.take();

      expect(activity.counters).to.have.property('taken', 1);

      expect(activity.broker.cancel('_run-on-inbound'), 'run on inbound trigger active').to.be.false;
    });

    it('cancels run queue consumer when completed with flow take', () => {
      const sequenceFlows = [];
      const context = getContext({
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.CompleteBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      activity.activate();

      activity.broker.subscribeOnce('event', 'activity.leave', () => {
        activity.deactivate();
      });

      sequenceFlow.take();

      expect(activity.counters).to.have.property('taken', 1);

      const runQ = activity.broker.getQueue('run-q');

      expect(runQ, 'run queue messages').to.have.property('messageCount', 0);
      expect(runQ, 'run queue consumer active').to.have.property('consumerCount', 0);
    });

    describe('parallel gateway join', () => {
      it('publishes activity enter with taken flows', () => {
        const sequenceFlows = [];
        const context = getContext({
          getInboundSequenceFlows() {
            return sequenceFlows;
          },
        });
        const sequenceFlow1 = new SequenceFlow({ id: 'flow1', sourceId: 'task1', parent: { id: 'process1' } }, context);
        const sequenceFlow2 = new SequenceFlow({ id: 'flow2', sourceId: 'task2', parent: { id: 'process1' } }, context);

        sequenceFlows.push(sequenceFlow1, sequenceFlow2);

        const activity = new Activity(
          behaviours.Behaviour,
          {
            id: 'activity',
            isParallelGateway: true,
            parent: {
              id: 'process1',
            },
          },
          context,
        );

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
        const context = getContext({
          getInboundSequenceFlows() {
            return sequenceFlows;
          },
        });
        const sequenceFlow1 = new SequenceFlow({ id: 'flow1', sourceId: 'task1', parent: { id: 'process1' } }, context);
        const sequenceFlow2 = new SequenceFlow({ id: 'flow2', sourceId: 'task2', parent: { id: 'process1' } }, context);

        sequenceFlows.push(sequenceFlow1, sequenceFlow2);

        const activity = new Activity(
          behaviours.Behaviour,
          {
            id: 'activity',
            isParallelGateway: true,
            parent: {
              id: 'process1',
            },
          },
          context,
        );

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
        const context = getContext({
          getInboundSequenceFlows() {
            return sequenceFlows;
          },
        });
        const sequenceFlow1 = new SequenceFlow({ id: 'flow1', sourceId: 'task1', parent: { id: 'process1' } }, context);
        const sequenceFlow2 = new SequenceFlow({ id: 'flow2', sourceId: 'task2', parent: { id: 'process1' } }, context);

        sequenceFlows.push(sequenceFlow1, sequenceFlow2);

        const activity = new Activity(
          behaviours.Behaviour,
          {
            id: 'activity',
            isParallelGateway: true,
            parent: {
              id: 'process1',
            },
          },
          context,
        );

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
        const context = getContext({
          getInboundSequenceFlows() {
            return sequenceFlows;
          },
        });
        const sequenceFlow1 = new SequenceFlow({ id: 'flow1', sourceId: 'task1', parent: { id: 'process1' } }, context);
        const sequenceFlow2 = new SequenceFlow({ id: 'flow2', sourceId: 'task2', parent: { id: 'process1' } }, context);

        sequenceFlows.push(sequenceFlow1, sequenceFlow2);

        const activity = new Activity(
          behaviours.Behaviour,
          {
            id: 'activity',
            isParallelGateway: true,
            parent: {
              id: 'process1',
            },
          },
          context,
        );

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
        const context = getContext({
          getInboundSequenceFlows() {
            return sequenceFlows;
          },
        });
        const sequenceFlow1 = new SequenceFlow({ id: 'flow1', sourceId: 'task1', parent: { id: 'process1' } }, context);
        const sequenceFlow2 = new SequenceFlow({ id: 'flow2', sourceId: 'task2', parent: { id: 'process1' } }, context);

        sequenceFlows.push(sequenceFlow1, sequenceFlow2);

        const activity = new Activity(
          behaviours.Behaviour,
          {
            id: 'activity',
            isParallelGateway: true,
            parent: {
              id: 'process1',
            },
          },
          context,
        );

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
        expect(message.content.inbound).to.have.length(4);
        expect(message.content.inbound[0]).to.have.property('id', 'flow1');
        expect(message.content.inbound[1]).to.have.property('id', 'flow1');
        expect(message.content.inbound[2]).to.have.property('id', 'flow1');
        expect(message.content.inbound[3]).to.have.property('id', 'flow2');

        expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 0);
      });

      it('takes next when all inbound flows have been evaluated', async () => {
        const sequenceFlows = [];
        const context = getContext({
          getInboundSequenceFlows() {
            return sequenceFlows;
          },
        });
        const sequenceFlow1 = new SequenceFlow(
          { id: 'flow1', targetId: 'activity', sourceId: 'task1', parent: { id: 'process1' } },
          context,
        );
        const sequenceFlow2 = new SequenceFlow(
          { id: 'flow2', targetId: 'activity', sourceId: 'task2', parent: { id: 'process1' } },
          context,
        );

        sequenceFlows.push(sequenceFlow1, sequenceFlow2);

        const activity = new Activity(
          behaviours.CompleteBehaviour,
          {
            id: 'activity',
            isParallelGateway: true,
            parent: {
              id: 'process1',
            },
          },
          context,
        );

        activity.activate();

        let message;
        activity.broker.subscribeTmp(
          'event',
          'activity.enter',
          (_, msg) => {
            message = msg;
          },
          { noAck: true },
        );

        let leave = activity.waitFor('leave');

        sequenceFlow1.take();
        sequenceFlow1.take();
        sequenceFlow1.take();
        sequenceFlow2.take();
        sequenceFlow2.take();

        expect(message).to.be.ok;
        expect(message.content.inbound).to.have.length(4);
        expect(message.content.inbound[0]).to.have.property('id', 'flow1');
        expect(message.content.inbound[1]).to.have.property('id', 'flow1');
        expect(message.content.inbound[2]).to.have.property('id', 'flow1');
        expect(message.content.inbound[3]).to.have.property('id', 'flow2');

        expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 1);

        await leave;

        leave = activity.waitFor('leave');

        sequenceFlow1.discard();

        await leave;

        expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 0);
      });
    });
  });

  describe('run()', () => {
    it('completes run when execution completed message is received', () => {
      const sequenceFlows = [];
      const context = getContext({
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      const leave = activity.waitFor('leave');

      activity.run();

      activity.broker.publish('execution', 'execution.completed', {});

      return leave;
    });

    it('assigns execution completed message to run end message', async () => {
      const sequenceFlows = [];
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      const leave = activity.waitFor('leave');

      activity.run();

      activity.broker.publish('execution', 'execution.completed', { output: 1 });

      const leaveApi = await leave;

      expect(leaveApi.content).to.have.property('output', 1);
    });

    it('cancels run consumer when completed', async () => {
      const sequenceFlows = [];
      const context = getContext({
        getInboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      const leave = activity.waitFor('leave');

      activity.run();

      activity.broker.publish('execution', 'execution.completed', {});

      await leave;

      expect(activity.broker.getQueue('run-q')).to.have.property('consumerCount', 0);
    });

    it('throws if called when already running', () => {
      const activity = getActivity(undefined, behaviours.Behaviour);

      activity.run();
      expect(() => activity.run()).to.throw(/activity .+? is already running/);
    });
  });

  describe('discard()', () => {
    it('discards run', () => {
      const sequenceFlows = [];
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      const leave = activity.waitFor('leave');

      activity.discard();

      expect(sequenceFlow.counters).to.have.property('discard', 1);

      return leave;
    });

    it('discards execution if executing', () => {
      const sequenceFlows = [];
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      function SpecialBehaviour(parent) {
        return {
          execute() {
            parent.discard();
          },
        };
      }

      const activity = new Activity(
        SpecialBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      const leave = activity.waitFor('leave');
      activity.run();

      expect(sequenceFlow.counters).to.have.property('discard', 1);

      return leave;
    });

    it('runs discard if not executing', () => {
      const sequenceFlows = [];
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      function SpecialBehaviour() {
        return {
          execute() {},
        };
      }

      const activity = new Activity(
        SpecialBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      const leave = activity.waitFor('leave');
      activity.discard();

      expect(sequenceFlow.counters).to.have.property('discard', 1);

      return leave;
    });

    it('discards on enter', async () => {
      const sequenceFlows = [];
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.CompleteBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      activity.broker.subscribeOnce('event', 'activity.enter', () => {
        activity.discard();
      });
      const leave = activity.waitFor('leave');

      activity.run();

      await leave;

      expect(sequenceFlow.counters).to.have.property('discard', 1);

      const runQ = activity.broker.getQueue('run-q');

      expect(runQ).to.have.property('messageCount', 0);
      expect(runQ).to.have.property('consumerCount', 0);
    });

    it('discards on end', async () => {
      const sequenceFlows = [];
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.CompleteBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      const end = activity.waitFor('end');
      const leave = activity.waitFor('leave');

      activity.run();

      await end;
      activity.discard();

      await leave;

      expect(sequenceFlow.counters).to.have.property('discard', 1);
    });

    it('next run can be discarded by discard', async () => {
      const activity = getActivity(undefined, behaviours.Behaviour);

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
    });

    it('next run can be discarded by api', async () => {
      let executeMessage;
      function SpecialBehaviour() {
        return {
          execute(msg) {
            executeMessage = msg;
          },
        };
      }
      const activity = getActivity(undefined, SpecialBehaviour);

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
    });
  });

  describe('stop()', () => {
    it('stops all activity', () => {
      const activity = getActivity(undefined, behaviours.Behaviour);

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

      expect(activity.broker.getExchange('api')).to.have.property('bindingCount', 0);
      expect(activity.broker.getExchange('event')).to.have.property('bindingCount', 0);

      expect(activity.broker.getExchange('run')).to.have.property('bindingCount', 1);
      expect(activity.broker.getExchange('execution')).to.have.property('bindingCount', 2);

      expect(activity.broker.consumerCount, 'no consumers').to.equal(0);
    });

    it('publishes stop when stopped', (done) => {
      const activity = getActivity(undefined, behaviours.Behaviour);

      activity.once('stop', () => {
        expect(activity.stopped).to.be.true;
        expect(activity.status).to.equal('executing');

        const runQ = activity.broker.getQueue('run-q');
        expect(runQ).to.have.property('messageCount', 1);

        expect(runQ.peek()).to.have.property('fields').with.property('redelivered', true);

        expect(activity.broker.consumerCount, 'no consumers').to.equal(0);

        done();
      });

      activity.run();
      activity.stop();
    });

    it('resolves stop when stopped', async () => {
      const activity = getActivity(undefined, behaviours.Behaviour);

      const stopped = activity.waitFor('stop');

      activity.run();
      activity.stop();

      await stopped;

      expect(activity.stopped).to.be.true;
      expect(activity.status).to.equal('executing');

      const runQ = activity.broker.getQueue('run-q');
      expect(runQ).to.have.property('messageCount', 1);
      expect(runQ.peek()).to.have.property('fields').with.property('redelivered', true);

      expect(activity.broker.consumerCount, 'no consumers').to.equal(0);
    });

    it('next run can be stopped', async () => {
      const activity = getActivity(undefined, behaviours.Behaviour);

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
      function SpecialBehaviour() {
        return {
          execute(msg) {
            executeMessage = msg;
          },
        };
      }
      const activity = getActivity(undefined, SpecialBehaviour);

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

    it('stop on event publishes activity.stop', () => {
      function SpecialBehaviour({ broker }) {
        return {
          execute({ content }) {
            broker.publish('event', 'activity.wait', { ...content });
          },
        };
      }
      const activity = getActivity(undefined, SpecialBehaviour);

      let stopMessage;
      activity.broker.subscribeOnce('event', 'activity.stop', (_, msg) => {
        stopMessage = msg;
      });
      activity.broker.subscribeOnce('event', 'activity.wait', () => {
        activity.stop();
      });

      activity.run();

      expect(stopMessage).to.be.ok;
      expect(stopMessage).to.have.property('properties').with.property('persistent', false);
      expect(stopMessage).to.have.property('content').with.property('parent').with.property('id', activity.parent.id);

      expect(activity.broker.getExchange('api')).to.have.property('bindingCount', 0);
      expect(activity.broker.getQueue('execution-q')).to.have.property('consumerCount', 0);
      expect(activity.broker.getQueue('format-run-q')).to.have.property('consumerCount', 0);
    });

    it('stops once', () => {
      const activity = getActivity(undefined, behaviours.Behaviour);

      activity.run();

      const messages = [];
      activity.broker.subscribeTmp(
        'event',
        'activity.stop',
        (_, msg) => {
          messages.push(msg);
        },
        { noAck: true, consumerTag: '_test-tag' },
      );

      activity.stop();
      activity.stop();

      expect(activity.stopped).to.be.true;

      activity.broker.cancel('_test-tag');

      expect(activity.broker.consumerCount, 'no consumers').to.equal(0);
      expect(messages, 'stop events').to.have.length(1);
    });
  });

  describe('init()', () => {
    it('publishes init event', () => {
      const activity = getActivity(
        {
          id: 'start',
        },
        behaviours.Behaviour,
      );

      const initialized = activity.waitFor('init');
      activity.init();
      return initialized;
    });

    it('runs with execution id from init', async () => {
      let executionId;
      function SpecialBehaviour() {
        return {
          execute({ content }) {
            executionId = content.executionId;
          },
        };
      }
      const activity = getActivity(undefined, SpecialBehaviour);

      const initialized = activity.waitFor('init');
      activity.init();
      activity.run();
      const init = await initialized;

      expect(init.content.executionId).to.be.ok;
      expect(init.content.executionId).to.equal(executionId);
    });

    it('can be called twice and so forth', () => {
      const activity = getActivity(
        {
          id: 'start',
        },
        behaviours.Behaviour,
      );

      const messages = [];
      activity.broker.subscribeTmp(
        'event',
        'activity.#',
        (_, msg) => {
          messages.push(msg);
        },
        { noAck: true },
      );

      activity.init();
      activity.init();
      activity.init();

      expect(messages).to.have.length(3);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.init');
      expect(messages[0].content).to.have.property('executionId').that.is.ok;
      expect(messages[1].fields).to.have.property('routingKey', 'activity.init');
      expect(messages[1].content).to.have.property('executionId').that.is.ok.and.equal(messages[0].content.executionId);
      expect(messages[2].fields).to.have.property('routingKey', 'activity.init');
    });
  });

  describe('error', () => {
    it('throws if execute error is NOT caught', () => {
      function SpecialBehaviour({ broker }) {
        return {
          execute(executeMessage) {
            broker.publish('execution', 'execute.error', { ...executeMessage.content, error: new Error('unstable') }, { type: 'error' });
          },
        };
      }
      const activity = getActivity(undefined, SpecialBehaviour);

      expect(() => activity.run()).to.throw('unstable');
    });

    it('throws if behaviour execute throws', () => {
      function SpecialBehaviour() {
        return {
          execute() {
            throw new Error('unstable');
          },
        };
      }

      const activity = getActivity(undefined, SpecialBehaviour);

      expect(() => activity.run()).to.throw('unstable');
    });

    it.skip('throws if activity event error is NOT caught', () => {
      function SpecialBehaviour({ broker }) {
        return {
          execute(executeMessage) {
            broker.publish(
              'event',
              'activity.error',
              { ...executeMessage.content, error: new Error('unstable') },
              { type: 'error', mandatory: true },
            );
          },
        };
      }

      const activity = getActivity(undefined, SpecialBehaviour);

      expect(() => activity.run()).to.throw('unstable');
    });

    it('continues execution if execute error is caught', async () => {
      function SpecialBehaviour({ broker }) {
        return {
          execute(executeMessage) {
            broker.publish(
              'execution',
              'execute.error',
              { ...executeMessage.content, error: new Error('unstable') },
              { type: 'error', mandatory: true },
            );
          },
        };
      }

      const activity = getActivity(undefined, SpecialBehaviour);

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
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.CompleteBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      const leave = activity.waitFor('leave');

      activity.activate();
      activity.run();

      expect(sequenceFlow.counters).to.have.property('take', 1);

      return leave;
    });

    it('forwards execute completed message message', async () => {
      const sequenceFlows = [];
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      function SpecialBehaviour({ broker }) {
        return {
          execute({ content }) {
            broker.publish('execution', 'execute.completed', { ...content, message: 1 });
          },
        };
      }

      const activity = new Activity(
        SpecialBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

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
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow1 = new SequenceFlow(
        { id: 'flow1', sourceId: 'source1', targetId: 'target1', parent: { id: 'process1' } },
        context,
      );
      const sequenceFlow2 = new SequenceFlow(
        { id: 'flow2', sourceId: 'source2', targetId: 'target2', parent: { id: 'process1' } },
        context,
      );
      sequenceFlows.push(sequenceFlow1, sequenceFlow2);

      const activity = new Activity(
        behaviours.CompleteBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      const leave = activity.waitFor('leave');

      activity.activate();
      activity.run();

      expect(sequenceFlow1.counters).to.have.property('take', 1);
      expect(sequenceFlow2.counters).to.have.property('take', 1);

      return leave;
    });

    it('respects outbound actions during execution', () => {
      const sequenceFlows = [];
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow1 = new SequenceFlow(
        { id: 'flow1', sourceId: 'source1', targetId: 'target1', parent: { id: 'process1' } },
        context,
      );
      const sequenceFlow2 = new SequenceFlow(
        { id: 'flow2', sourceId: 'source2', targetId: 'target2', parent: { id: 'process1' } },
        context,
      );
      sequenceFlows.push(sequenceFlow1, sequenceFlow2);

      function SpecialBehaviour({ broker }) {
        return {
          execute({ content }) {
            broker.publish('execution', 'execute.completed', {
              ...content,
              outbound: [
                {
                  id: 'flow1',
                  action: 'take',
                },
                {
                  id: 'flow2',
                  action: 'discard',
                },
              ],
            });
          },
        };
      }

      const activity = new Activity(
        SpecialBehaviour,
        {
          id: 'activity',
          type: 'bpmn:ExclusiveGateway',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      const leave = activity.waitFor('leave');

      activity.activate();
      activity.run();

      expect(sequenceFlow1.counters).to.have.property('take', 1);
      expect(sequenceFlow2.counters).to.have.property('discard', 1);

      return leave;
    });

    it('discards outbound when discarded', () => {
      const sequenceFlows = [];
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow = new SequenceFlow({ id: 'flow', parent: { id: 'process1' } }, context);
      sequenceFlows.push(sequenceFlow);

      const activity = new Activity(
        behaviours.CompleteBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      const leave = activity.waitFor('leave');

      activity.discard();

      expect(sequenceFlow.counters).to.have.property('discard', 1);

      return leave;
    });

    it('respects all outbound discarded during execution', () => {
      const sequenceFlows = [];
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow1 = new SequenceFlow(
        { id: 'flow1', sourceId: 'source1', targetId: 'target1', parent: { id: 'process1' } },
        context,
      );
      const sequenceFlow2 = new SequenceFlow(
        { id: 'flow2', sourceId: 'source2', targetId: 'target2', parent: { id: 'process1' } },
        context,
      );
      sequenceFlows.push(sequenceFlow1, sequenceFlow2);

      function SpecialBehaviour({ broker }) {
        return {
          execute({ content }) {
            broker.publish('execution', 'execute.completed', {
              ...content,
              outbound: [
                {
                  id: 'flow1',
                  action: 'discard',
                },
                {
                  id: 'flow2',
                  action: 'discard',
                },
              ],
            });
          },
        };
      }

      const activity = new Activity(
        SpecialBehaviour,
        {
          id: 'activity',
          type: 'bpmn:ExclusiveGateway',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      const leave = activity.waitFor('leave');

      activity.activate();
      activity.run();

      expect(sequenceFlow1.counters).to.have.property('discard', 1);
      expect(sequenceFlow2.counters).to.have.property('discard', 1);

      return leave;
    });

    it('uses last action from evaluated flows during execution', () => {
      const sequenceFlows = [];
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow1 = new SequenceFlow(
        { id: 'flow1', sourceId: 'source1', targetId: 'target1', parent: { id: 'process1' } },
        context,
      );
      const sequenceFlow2 = new SequenceFlow(
        { id: 'flow2', sourceId: 'source2', targetId: 'target2', parent: { id: 'process1' } },
        context,
      );
      sequenceFlows.push(sequenceFlow1, sequenceFlow2);

      function SpecialBehaviour({ broker }) {
        return {
          execute({ content }) {
            broker.publish('execution', 'execute.completed', {
              ...content,
              outbound: [
                {
                  id: 'flow1',
                  action: 'discard',
                },
                {
                  id: 'flow2',
                  action: 'discard',
                },
                {
                  id: 'flow1',
                  action: 'take',
                },
              ],
            });
          },
        };
      }

      const activity = new Activity(
        SpecialBehaviour,
        {
          id: 'activity',
          type: 'bpmn:ExclusiveGateway',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      const leave = activity.waitFor('leave');

      activity.activate();
      activity.run();

      expect(sequenceFlow1.counters).to.have.property('take', 1);
      expect(sequenceFlow2.counters).to.have.property('discard', 1);

      return leave;
    });

    it('discards flows and adds activity id to discard sequence when discarded', () => {
      const sequenceFlows = [];
      const context = getContext({
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow1 = new SequenceFlow(
        { id: 'flow1', sourceId: 'activity', targetId: 'target1', parent: { id: 'process1' } },
        context,
      );
      const sequenceFlow2 = new SequenceFlow(
        { id: 'flow2', sourceId: 'activity', targetId: 'target2', parent: { id: 'process1' } },
        context,
      );

      sequenceFlows.push(sequenceFlow1, sequenceFlow2);

      const messages = [];
      sequenceFlow1.broker.subscribeOnce('event', 'flow.discard', (_, { content }) => {
        messages.push(content);
      });
      sequenceFlow2.broker.subscribeOnce('event', 'flow.discard', (_, { content }) => {
        messages.push(content);
      });

      function SpecialBehaviour({ broker }) {
        return {
          execute({ content }) {
            broker.publish('execution', 'execute.completed', {
              ...content,
              outbound: [
                {
                  id: 'flow1',
                  action: 'discard',
                },
                {
                  id: 'flow2',
                  action: 'discard',
                },
              ],
            });
          },
        };
      }

      const activity = new Activity(
        SpecialBehaviour,
        {
          id: 'activity',
          type: 'bpmn:ExclusiveGateway',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

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
      const context = getContext({
        getInboundSequenceFlows() {
          return inboundFlows;
        },
        getOutboundSequenceFlows() {
          return outboundFlows;
        },
      });

      const sequenceFlow0 = new SequenceFlow({ id: 'flow0', sourceId: 'start', targetId: 'activity', parent: { id: 'process1' } }, context);
      inboundFlows.push(sequenceFlow0);

      const sequenceFlow1 = new SequenceFlow(
        { id: 'flow1', sourceId: 'activity', targetId: 'target1', parent: { id: 'process1' } },
        context,
      );
      const sequenceFlow2 = new SequenceFlow(
        { id: 'flow2', sourceId: 'activity', targetId: 'target2', parent: { id: 'process1' } },
        context,
      );
      outboundFlows.push(sequenceFlow1, sequenceFlow2);

      const messages = [];
      sequenceFlow1.broker.subscribeOnce('event', 'flow.discard', (_, { content }) => {
        messages.push(content);
      });
      sequenceFlow2.broker.subscribeOnce('event', 'flow.discard', (_, { content }) => {
        messages.push(content);
      });

      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:ExclusiveGateway',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

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
      const context = getContext({
        getInboundSequenceFlows() {
          return inboundFlows;
        },
        getOutboundSequenceFlows() {
          return outboundFlows;
        },
      });

      const sequenceFlow1 = new SequenceFlow({ id: 'flow1', sourceId: 'start1', parent: { id: 'process1' } }, context);
      const sequenceFlow2 = new SequenceFlow({ id: 'flow2', sourceId: 'task', parent: { id: 'process1' } }, context);

      inboundFlows.push(sequenceFlow1, sequenceFlow2);

      const sequenceFlow3 = new SequenceFlow(
        { id: 'flow3', sourceId: 'activity', targetId: 'target1', parent: { id: 'process1' } },
        context,
      );
      const sequenceFlow4 = new SequenceFlow(
        { id: 'flow4', sourceId: 'activity', targetId: 'target2', parent: { id: 'process1' } },
        context,
      );
      outboundFlows.push(sequenceFlow3, sequenceFlow4);

      const messages = [];
      sequenceFlow3.broker.subscribeOnce('event', 'flow.discard', (_, { content }) => {
        messages.push(content);
      });
      sequenceFlow4.broker.subscribeOnce('event', 'flow.discard', (_, { content }) => {
        messages.push(content);
      });

      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          isParallelGateway: true,
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      const leave = activity.waitFor('leave');

      activity.activate();
      sequenceFlow1.discard();
      sequenceFlow2.discard({ discardSequence: ['start2'] });

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
      const context = getContext({
        loadExtensions() {
          return {
            activate(msg) {
              activateMessage = msg;
            },
          };
        },
      });

      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      expect(activity.extensions).to.be.ok;

      activity.run();

      expect(activateMessage).to.be.ok;
      expect(activateMessage.fields).to.have.property('routingKey', 'run.enter');
    });

    it('activates extensions on discard', () => {
      const attachedTo = ActivityBroker();
      attachedTo.id = 'task';

      let activateMessage;
      const context = getContext({
        loadExtensions() {
          return {
            activate(msg) {
              activateMessage = msg;
            },
            deactivate() {},
          };
        },
      });

      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      activity.discard();

      expect(activateMessage).to.be.ok;
      expect(activateMessage.fields).to.have.property('routingKey', 'run.discard');
    });

    it('activates extensions on resume', () => {
      const attachedTo = ActivityBroker();
      attachedTo.id = 'task';

      let activateMessage;
      const context = getContext({
        loadExtensions() {
          return {
            count: 1,
            activate(msg) {
              activateMessage = msg;
            },
            deactivate() {},
          };
        },
      });

      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      activity.run();
      activity.stop();

      activity.resume();

      expect(activateMessage).to.be.ok;
      expect(activateMessage.fields).to.have.property('routingKey', 'run.execute');
    });
  });

  describe('attached to activity', () => {
    it('starts run when attached to enters', () => {
      const attachedTo = {
        id: 'task',
        parent: {
          id: 'process1',
        },
        broker: ActivityBroker().broker,
      };

      const context = getContext({
        getActivityById(id) {
          if (id === 'task') return attachedTo;
        },
      });

      const activity = new Activity(
        behaviours.Behaviour,
        {
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
        },
        context,
      );

      activity.activate();

      const enter = activity.waitFor('enter');
      attachedTo.broker.publish('event', 'activity.enter', { id: attachedTo.id });

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

      const context = getContext({
        getActivityById(id) {
          if (id === 'task') return attachedTo;
        },
      });

      const activity = new Activity(
        behaviours.Behaviour,
        {
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
        },
        context,
      );

      activity.activate();

      let message;
      activity.broker.subscribeOnce('event', 'activity.enter', (_, msg) => {
        message = msg;
      });

      attachedTo.broker.publish('event', 'activity.enter', { id: 'task', type: 'bpmn:ServiceTask' });

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

      const context = getContext({
        getActivityById(id) {
          if (id === 'task') return attachedTo;
        },
      });

      const activity = new Activity(
        behaviours.Behaviour,
        {
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
        },
        context,
      );

      activity.activate();

      let message;
      activity.broker.subscribeOnce('event', 'activity.discard', (_, msg) => {
        message = msg;
      });

      attachedTo.broker.publish('event', 'activity.discard', { id: 'task', type: 'bpmn:ServiceTask', discardSequence: ['start'] });

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
      const context = getContext({
        getActivityById(id) {
          if (id === 'task') return attachedTo;
        },
        getOutboundSequenceFlows() {
          return sequenceFlows;
        },
      });

      const sequenceFlow1 = new SequenceFlow(
        { id: 'flow1', sourceId: 'activity', targetId: 'target1', parent: { id: 'process1' } },
        context,
      );
      const sequenceFlow2 = new SequenceFlow(
        { id: 'flow2', sourceId: 'activity', targetId: 'target2', parent: { id: 'process1' } },
        context,
      );
      sequenceFlows.push(sequenceFlow1, sequenceFlow2);

      const messages = [];
      sequenceFlow1.broker.subscribeOnce('event', 'flow.discard', (_, { content }) => {
        messages.push(content);
      });
      sequenceFlow2.broker.subscribeOnce('event', 'flow.discard', (_, { content }) => {
        messages.push(content);
      });

      const activity = new Activity(
        behaviours.Behaviour,
        {
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
        },
        context,
      );

      activity.activate();
      const leave = activity.waitFor('leave');

      attachedTo.broker.publish('event', 'activity.discard', { id: 'task', type: 'bpmn:ServiceTask', discardSequence: ['start'] });

      expect(messages).to.have.length(2);
      expect(messages[0]).to.have.property('discardSequence').that.eql(['start', 'activity']);
      expect(messages[1]).to.have.property('discardSequence').that.eql(['start', 'activity']);

      return leave;
    });

    it('queues attached to starts if already running', () => {
      const attachedTo = {
        id: 'task',
        broker: ActivityBroker(this).broker,
      };
      const context = getContext({
        getActivityById(id) {
          if (id === 'task') return attachedTo;
        },
      });

      const activity = new Activity(
        behaviours.Behaviour,
        {
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
        },
        context,
      );

      activity.activate();

      let message;
      activity.broker.subscribeOnce('event', 'activity.enter', (_, msg) => {
        message = msg;
      });

      attachedTo.broker.publish('event', 'activity.enter', { id: 'task', type: 'bpmn:ServiceTask' });
      attachedTo.broker.publish('event', 'activity.enter', { id: 'task', type: 'bpmn:ServiceTask' });

      expect(message).to.be.ok;
      expect(message.content.inbound).to.have.length(1);
      expect(message.content.inbound[0]).to.have.property('id', 'task');

      expect(activity.broker.getQueue('inbound-q')).to.have.property('messageCount', 1);
      expect(activity.broker.getQueue('inbound-q')).to.have.property('consumerCount', 0);
    });
  });

  describe('waitFor()', () => {
    it('returns promise that resolves when event occur', () => {
      const activity = getActivity(undefined, TaskBehaviour);
      const leave = activity.waitFor('leave');

      activity.run();

      return leave;
    });

    it('waiting for error resolves to activity api with error in content', async () => {
      function SpecialBehaviour({ broker }) {
        return {
          execute(executeMessage) {
            broker.publish(
              'event',
              'activity.error',
              { ...executeMessage.content, error: new Error('unstable') },
              { type: 'error', mandatory: true },
            );
          },
        };
      }

      const activity = getActivity(undefined, SpecialBehaviour);

      const error = activity.waitFor('error');

      activity.run();

      const api = await error;
      expect(api.content.error.message).to.equal('unstable');
    });

    it('rejects if activity error is published', (done) => {
      function SpecialBehaviour({ broker }) {
        return {
          execute(executeMessage) {
            broker.publish(
              'event',
              'activity.error',
              { ...executeMessage.content, error: new Error('unstable') },
              { type: 'error', mandatory: true },
            );
          },
        };
      }

      const activity = getActivity(undefined, SpecialBehaviour);

      activity.waitFor('leave').catch((err) => {
        expect(err.message).to.equal('unstable');
        done();
      });

      activity.run();
    });

    it('rejects if execute error is published', (done) => {
      function SpecialBehaviour({ broker }) {
        return {
          execute(executeMessage) {
            broker.publish('execution', 'execute.error', { ...executeMessage.content, error: new Error('unstable') });
          },
        };
      }

      const activity = getActivity(undefined, SpecialBehaviour);

      activity.waitFor('leave').catch((err) => {
        expect(err.message).to.equal('unstable');
        done();
      });

      activity.run();
    });
  });

  describe('getState()', () => {
    it('returns expected state when not running', () => {
      const activity = getActivity(undefined, behaviours.Behaviour);
      const state = activity.getState();

      expect(state.status).to.be.undefined;
      expect(state.counters).to.eql({ discarded: 0, taken: 0 });
      expect(state).to.have.property('broker').that.is.not.ok;
      expect(state.execution).to.be.undefined;
    });

    it('returns expected state when running', () => {
      function SpecialBehaviour() {
        return {
          execute() {},
          getState() {
            return {
              behaviourState: true,
            };
          },
        };
      }

      const activity = getActivity(undefined, SpecialBehaviour);
      activity.run();
      const state = activity.getState();

      expect(state).to.have.property('status', 'executing');
      expect(state).to.have.property('execution').with.property('completed', false);
      expect(state.execution).to.have.property('behaviourState', true);
      expect(state.counters).to.eql({ discarded: 0, taken: 0 });
      expect(state).to.have.property('broker').with.property('queues');
    });

    it('returns expected state when stopped', () => {
      const activity = getActivity(undefined, behaviours.Behaviour);

      activity.run();
      activity.stop();

      const state = activity.getState();

      expect(state.counters).to.eql({ discarded: 0, taken: 0 });
      expect(state.status).to.equal('executing');
      expect(state).to.have.property('broker').with.property('queues');
    });

    it('returns expected state when completed', () => {
      const activity = getActivity(undefined, behaviours.CompleteBehaviour);

      activity.run();

      const state = activity.getState();

      expect(state.status).to.be.undefined;
      expect(state.counters).to.eql({ discarded: 0, taken: 1 });
      expect(state).to.have.property('broker').that.is.not.ok;
    });

    it('returns expected state when completed twice', () => {
      const activity = getActivity(undefined, TaskBehaviour);

      activity.run();
      activity.run();

      const state = activity.getState();

      expect(state.status).to.be.undefined;
      expect(state.counters).to.eql({ discarded: 0, taken: 2 });
      expect(state).to.have.property('broker').that.is.not.ok;
    });

    it('returns expected state when discarded', () => {
      const activity = getActivity(undefined, TaskBehaviour);

      activity.discard();

      const state = activity.getState();

      expect(state.status).to.be.undefined;
      expect(state.counters).to.eql({ discarded: 1, taken: 0 });
      expect(state).to.have.property('broker').that.is.not.ok;
    });

    it('returns expected state when discarded and completed', () => {
      const activity = getActivity(undefined, TaskBehaviour);

      activity.discard();
      activity.run();

      const state = activity.getState();

      expect(state.status).to.be.undefined;
      expect(state.counters).to.eql({ discarded: 1, taken: 1 });
      expect(state).to.have.property('broker').that.is.not.ok;
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
      function SpecialBehaviour() {
        return {
          execute() {},
          getState() {
            return {
              behaviourState: true,
            };
          },
          recover(executionState) {
            activityState = executionState;
          },
        };
      }
      const activity = getActivity(undefined, SpecialBehaviour);
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
      function CustomBehaviour1() {
        return {
          execute() {},
          getState() {
            return {
              behaviourState: true,
            };
          },
        };
      }
      const activity = getActivity(undefined, CustomBehaviour1);
      activity.run();
      activity.stop();

      const state = activity.getState();

      function CustomBehaviour2() {
        return {
          execute() {},
          recover(executionState) {
            activityState = executionState;
          },
        };
      }

      const recoveredActivity = getActivity(undefined, CustomBehaviour2);

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
      expect(activity.counters).to.eql({ discarded: 0, taken: 0 });

      const state = activity.getState();
      state.counters.taken = 1;

      const recoveredActivity = getActivity(undefined, SignalTaskBehaviour);
      recoveredActivity.recover(state);

      expect(recoveredActivity.status).to.equal('executing');
      expect(recoveredActivity.counters).to.eql({ discarded: 0, taken: 1 });

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
      expect(activity.counters).to.eql({ discarded: 0, taken: 1 });
    });

    it('resumes recovered activity with state', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);

      activity.run();

      activity.stop();
      expect(activity.counters).to.eql({ discarded: 0, taken: 0 });

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
      expect(recoveredActivity.counters).to.eql({ discarded: 0, taken: 1 });
    });

    it('resumes recovered activity with running state', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);

      activity.run();

      expect(activity.counters).to.eql({ discarded: 0, taken: 0 });

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
      expect(recoveredActivity.counters).to.eql({ discarded: 0, taken: 1 });
    });

    it('throws if resume is called when activity is running', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);
      activity.run();

      expect(() => {
        activity.resume();
      }).to.throw('cannot resume running activity');
    });

    it('ignored if already consuming run queue', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);
      activity.run();
      activity.stop();

      activity.activate();
      activity.resume();
    });

    it('resumes if taken once, recovered, and activated', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);
      activity.activate();
      activity.inbound[0].take();

      const state = activity.getState();

      expect(activity.status).to.equal('executing');

      const recovered = getActivity(undefined, SignalTaskBehaviour).recover(state);

      recovered.activate();
      recovered.resume();
    });

    it('resumes if taken twice, recovered, and activated', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);
      activity.activate();
      activity.inbound[0].take();
      activity.inbound[0].take();

      const state = activity.getState();

      expect(activity.status).to.equal('executing');

      const recovered = getActivity(undefined, SignalTaskBehaviour).recover(state);

      recovered.activate();
      recovered.resume();
    });

    it('resumes if taken twice, recovered, and activated', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);
      activity.activate();
      activity.inbound[0].take();
      activity.inbound[0].take();

      const state = activity.getState();

      expect(activity.status).to.equal('executing');

      const recovered = getActivity(undefined, SignalTaskBehaviour).recover(state);

      recovered.activate();
      recovered.resume();

      recovered.getApi().signal();
      expect(recovered.counters).to.have.property('taken', 1);

      recovered.getApi().signal();
      expect(recovered.counters).to.have.property('taken', 2);

      recovered.getApi().signal();
      expect(recovered.counters).to.have.property('taken', 2);
    });

    it('resume if not running activates activity', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);
      activity.resume();

      expect(activity.isRunning).to.be.false;
    });

    it('resume on resume if not running activates activity once', () => {
      const activity = getActivity(undefined, SignalTaskBehaviour);
      activity.resume();
      activity.resume();

      expect(activity.isRunning).to.be.false;
    });
  });

  describe('evaluateOutbound()', () => {
    it('calls callback if no outbound flows', (done) => {
      const context = getContext({
        getOutboundSequenceFlows() {
          return [];
        },
      });

      const activity = new Activity(
        behaviours.CompleteBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      activity.evaluateOutbound(
        {
          content: {},
        },
        false,
        done,
      );
    });
  });

  describe('inbound associations', () => {
    it('starts compensation task run when inbound association is taken', () => {
      const associations = [];
      const context = getContext({
        getInboundAssociations() {
          return associations;
        },
      });

      const association = new Association({ id: 'association', parent: { id: 'process1' } }, context);
      associations.push(association);

      const activity = new Activity(
        behaviours.CompleteBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
          behaviour: {
            isForCompensation: true,
          },
        },
        context,
      );

      activity.activate();

      association.take();

      expect(activity.counters).to.have.property('taken', 1);
    });

    it('runs compensation task twice if association is taken twice', () => {
      const associations = [];
      const context = getContext({
        getInboundAssociations() {
          return associations;
        },
      });

      const association = new Association({ id: 'association', parent: { id: 'process1' } }, context);
      associations.push(association);

      const activity = new Activity(
        behaviours.CompleteBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
          behaviour: {
            isForCompensation: true,
          },
        },
        context,
      );

      activity.activate();

      association.take();
      association.take();

      expect(activity.counters).to.have.property('taken', 2);
    });

    it('removes run on inbound listener when deactivated on leave', () => {
      const associations = [];
      const context = getContext({
        getInboundAssociations() {
          return associations;
        },
      });

      const association = new Association({ id: 'association', parent: { id: 'process1' } }, context);
      associations.push(association);

      const activity = new Activity(
        behaviours.CompleteBehaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
          behaviour: {
            isForCompensation: true,
          },
        },
        context,
      );

      activity.activate();

      activity.broker.subscribeOnce('event', 'activity.leave', () => {
        activity.deactivate();
      });

      association.take();
      association.take();

      expect(activity.counters).to.have.property('taken', 1);

      expect(activity.broker.cancel('_run-on-inbound'), 'run on inbound trigger active').to.be.false;
    });
  });

  describe('stepping with next()', () => {
    it('ignored if environment step is falsy', () => {
      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        getContext(),
      );

      activity.run();
      activity.next();
    });

    it('ignored if not running', () => {
      const context = getContext();
      context.environment.settings.step = true;
      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      activity.next();
      expect(activity.isRunning).to.false;
    });

    it('ignored if executing', () => {
      const context = getContext();
      context.environment.settings.step = true;
      const activity = new Activity(
        behaviours.Behaviour,
        {
          id: 'activity',
          type: 'bpmn:Task',
          parent: {
            id: 'process1',
          },
        },
        context,
      );

      activity.run();
      expect(activity).to.have.property('status', 'entered');
      activity.next();
      expect(activity).to.have.property('status', 'started');
      activity.next();
      expect(activity).to.have.property('status', 'executing');
      activity.next();
      expect(activity).to.have.property('status', 'executing');
      activity.next();
    });
  });
});

function getActivity(override = {}, OBehaviour = TaskBehaviour) {
  const activity = new Activity(
    OBehaviour,
    {
      id: 'activity',
      type: 'test:activity',
      name: 'Test activity',
      parent: {
        id: 'process1',
      },
      ...override,
    },
    getContext(),
  );
  return activity;
}

function getContext(override) {
  const environment = new Environment({ Logger: testHelpers.Logger });
  return {
    environment,
    getActivityExtensions() {
      return {};
    },
    getInboundSequenceFlows(id) {
      if (id !== 'activity') return [];
      return [new SequenceFlow({ id: 'flow', sourceId: 'start', targetId: 'activity', parent: { id: 'process1' } }, { environment })];
    },
    getOutboundMessageFlows() {
      return [];
    },
    getOutboundSequenceFlows() {
      return [];
    },
    loadExtensions() {
      return {
        activate() {},
        deactivate() {},
      };
    },
    getInboundAssociations() {},
    ...override,
  };
}
