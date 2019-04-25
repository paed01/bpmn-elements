import BpmnModdle from 'bpmn-moddle';
import testHelpers from './helpers/testHelpers';

const moddle = new BpmnModdle();

const eventActivities = [
  'bpmn:StartEvent',
  'bpmn:EndEvent',
  'bpmn:IntermediateCatchEvent'
];

const decisionGateways = [
  'bpmn:ExclusiveGateway',
  'bpmn:InclusiveGateway'
];

const gateways = ['bpmn:ParallelGateway'].concat(decisionGateways);

const taskActivities = [
  'bpmn:Task',
  'bpmn:SendTask',
  'bpmn:ScriptTask',
  'bpmn:ServiceTask',
  'bpmn:ManualTask',
  'bpmn:UserTask',
  'bpmn:ReceiveTask',
  'bpmn:SubProcess'
];

describe('activity', () => {
  eventActivities.concat(gateways).concat(taskActivities).forEach((activityType) => {
    describe(activityType, () => {
      let simpleDefinition, singleFlowDefinition;
      before(async () => {
        simpleDefinition = await SimpleDefinition(activityType);
        singleFlowDefinition = await SingleFlowDefinition(activityType);
      });

      it('run() publish messages in the expected sequence', async () => {
        const processContext = await testHelpers.context(simpleDefinition);
        const activity = processContext.getActivityById('activity');

        const messages = [], assertMessage = AssertMessage(processContext, messages);
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') {
            return api.signal();
          }
          messages.push(message);
        }, {noAck: true});

        const completed = activity.waitFor('leave');
        activity.activate();
        activity.run();
        await completed;

        expect(activity).to.have.property('isRunning', false);

        assertMessage('activity.enter');
        assertMessage('activity.start');
        assertMessage('activity.end');
        assertMessage('activity.leave');
      });

      it('run() after run() resets messages', async () => {
        const processContext = await testHelpers.context(simpleDefinition);
        const activity = processContext.getActivityById('activity');

        const messages = [], assertMessage = AssertMessage(processContext, messages);
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') {
            return api.signal();
          }
          messages.push(message);
        }, {noAck: true});

        const start = activity.waitFor('start');
        activity.run();

        await start;

        const leave = activity.waitFor('leave');
        activity.run();

        await leave;

        assertMessage('activity.enter');
        assertMessage('activity.start');
        assertMessage('activity.enter');
        assertMessage('activity.start');
        assertMessage('activity.end');
        assertMessage('activity.leave');
      });

      it('discard() on enter discards outbound', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');
        expect(activity.outbound.length).to.equal(2);

        const messages = [], assertMessage = AssertMessage(context, messages, true);

        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          messages.push(message);
          assertApi(activity, message);
        }, {noAck: true});

        activity.broker.subscribeOnce('event', 'activity.enter', (_, message) => {
          assertApi(activity, message).discard();
        });

        const completed = activity.waitFor('leave');
        activity.activate();
        activity.run();

        await completed;

        assertMessage('activity.enter');
        assertMessage('activity.discard');
        assertMessage('activity.leave');

        expect(activity.outbound.every((flow) => flow.counters.discard)).to.be.ok;
      });

      it('discard() on start discards outbound', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');

        const messages = [], assertMessage = AssertMessage(context, messages, true);
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          messages.push(message);
          assertApi(activity, message);
        }, {noAck: true});

        activity.broker.subscribeOnce('event', 'activity.start', (_, message) => {
          assertApi(activity, message).discard();
        });

        const completed = activity.waitFor('leave');
        activity.activate();
        activity.run();
        await completed;

        assertMessage('activity.enter');
        assertMessage('activity.start');
        assertMessage('activity.discard');
        assertMessage('activity.leave');

        expect(activity.outbound.length).to.equal(2);
        expect(activity.outbound.every((flow) => flow.counters.discard)).to.be.ok;
      });

      it('discard() on discard is ignored', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');

        const messages = [], assertMessage = AssertMessage(context, messages, true);
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true});

        activity.broker.subscribeOnce('event', 'activity.start', (_, message) => {
          assertApi(activity, message).discard();
        }, {noAck: true});

        activity.broker.subscribeOnce('event', 'activity.discard', (_, message) => {
          assertApi(activity, message).discard();
        });

        const completed = activity.waitFor('leave');
        activity.activate();
        activity.run();
        await completed;

        assertMessage('activity.enter');
        assertMessage('activity.start');
        assertMessage('activity.discard');
        assertMessage('activity.leave');

        expect(activity.outbound.length).to.equal(2);
        expect(activity.outbound.every((flow) => flow.counters.discard)).to.be.ok;
      });

      it('discard() on end discards outbound', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');

        const messages = [], assertMessage = AssertMessage(context, messages, true);
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true});

        activity.broker.subscribeOnce('event', 'activity.end', (_, message) => {
          assertApi(activity, message).discard();
        }, {noAck: true});

        const completed = activity.waitFor('leave');
        activity.activate();
        activity.run();
        await completed;

        assertMessage('activity.enter');
        assertMessage('activity.start');
        assertMessage('activity.end');
        assertMessage('activity.discard');
        assertMessage('activity.leave');

        expect(activity.outbound.length).to.equal(2);
        expect(activity.outbound.every((flow) => flow.counters.discard)).to.be.ok;
      });

      it('discard() on leave is ignored', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');

        const messages = [], assertMessage = AssertMessage(context, messages, true);
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true});

        activity.broker.subscribeOnce('event', 'activity.leave', (routingKey, message) => {
          assertApi(activity, message).discard();
        }, {noAck: true});

        const completed = activity.waitFor('leave');
        activity.activate();
        activity.run();
        await completed;

        expect(activity).to.have.property('isRunning', false);

        assertMessage('activity.enter');
        assertMessage('activity.start');
        assertMessage('activity.end');
        assertMessage('activity.leave');

        expect(activity.outbound.length).to.equal(2);
        expect(activity.outbound.every((flow) => flow.counters.discard)).to.not.be.ok;
      });

      it('stop() on enter stops execution', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');

        const messages = [];
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          messages.push(message);
        }, {noAck: true});

        activity.broker.subscribeTmp('event', 'activity.enter', () => {
          activity.stop();
        });

        const stopped = activity.waitFor('stop');
        activity.activate();
        activity.run();
        await stopped;

        expect(activity).to.have.property('isRunning', false);

        const assertMessage = AssertMessage(context, messages, true);
        assertMessage('activity.enter');
        assertMessage('activity.stop');
        expect(messages).to.have.length(0);
      });

      it('stop() on start stops execution', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');

        const messages = [];
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          messages.push(message);
        }, {noAck: true});

        activity.broker.subscribeTmp('event', 'activity.start', () => {
          activity.stop();
        });

        const stopped = activity.waitFor('stop');
        activity.activate();
        activity.run();
        await stopped;

        expect(activity).to.have.property('isRunning', false);

        const assertMessage = AssertMessage(context, messages, true);
        assertMessage('activity.enter');
        assertMessage('activity.start');
        assertMessage('activity.stop');
        expect(messages, 'no more messages').to.have.length(0);
      });

      it('resume stopped on enter continuous execution', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');

        const messages = [];
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true});

        activity.broker.subscribeOnce('event', 'activity.enter', () => {
          activity.stop();
        });

        const stopped = activity.waitFor('stop');
        activity.run();

        await stopped;

        const assertMessage = AssertMessage(context, messages, true);
        assertMessage('activity.enter');
        assertMessage('activity.stop');
        expect(messages, 'no more messages').to.have.length(0);

        const leave = activity.waitFor('leave');
        activity.resume();
        await leave;

        assertMessage('activity.start');
        assertMessage('activity.end');
        assertMessage('activity.leave');
        expect(messages, 'no more messages').to.have.length(0);
      });

      it('resume recovered on enter continuous execution', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');

        const messages = [];
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true});

        activity.broker.subscribeOnce('event', 'activity.enter', () => {
          activity.stop();
        });

        const stopped = activity.waitFor('stop');
        activity.run();

        await stopped;

        const state = activity.getState();
        expect(activity).to.have.property('stopped', true);
        expect(activity).to.have.property('isRunning', false);
        expect(state).to.have.property('stopped', true);

        const assertMessage = AssertMessage(context, messages, true);
        assertMessage('activity.enter');
        assertMessage('activity.stop');
        expect(messages, 'no more messages').to.have.length(0);

        activity.recover(state);

        const leave = activity.waitFor('leave');
        activity.resume();
        await leave;

        assertMessage('activity.start');
        assertMessage('activity.end');
        assertMessage('activity.leave');
        expect(messages, 'no more messages').to.have.length(0);
      });

      it('resume recovered new instance on enter continuous execution', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        let activity = context.getActivityById('activity');

        const messages = [];
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true});

        activity.broker.subscribeOnce('event', 'activity.enter', () => {
          activity.stop();
        });

        const stopped = activity.waitFor('stop');
        activity.run();

        await stopped;

        const state = activity.getState();
        expect(activity).to.have.property('stopped', true);
        expect(activity).to.have.property('isRunning', false);
        expect(state).to.have.property('stopped', true);

        const assertMessage = AssertMessage(context, messages, true);
        assertMessage('activity.enter');
        assertMessage('activity.stop');
        expect(messages, 'no more messages').to.have.length(0);

        activity = context.clone().getActivityById('activity');

        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true});

        activity.recover(state);

        const leave = activity.waitFor('leave');
        activity.resume();
        await leave;

        assertMessage('activity.start');
        assertMessage('activity.end');
        assertMessage('activity.leave');
        expect(messages, 'no more messages').to.have.length(0);
      });

      it('resume stopped on start continuous execution', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');

        const messages = [];
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true});

        activity.broker.subscribeTmp('event', 'activity.start', function stop() {
          activity.broker.unsubscribe('activity.start', stop);
          activity.stop();
        });

        const stopped = activity.waitFor('stop');
        activity.activate();
        activity.run();
        await stopped;

        const assertMessage = AssertMessage(context, messages, true);
        assertMessage('activity.enter');
        assertMessage('activity.start');
        assertMessage('activity.stop');
        expect(messages, 'no more messages').to.have.length(0);

        const left = activity.waitFor('leave');

        activity.resume();

        await left;

        assertMessage('activity.end');
        assertMessage('activity.leave');
        expect(messages, 'no more messages').to.have.length(0);
      });

      it('resume recovered on start continuous execution', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');

        const messages = [];
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true});

        activity.broker.subscribeTmp('event', 'activity.start', function stop() {
          activity.broker.unsubscribe('activity.start', stop);
          activity.stop();
        });

        const stopped = activity.waitFor('stop');
        activity.activate();
        activity.run();
        await stopped;

        const state = activity.getState();


        const assertMessage = AssertMessage(context, messages, true);
        assertMessage('activity.enter');
        assertMessage('activity.start');
        assertMessage('activity.stop');
        expect(messages, 'no more messages').to.have.length(0);

        const left = activity.waitFor('leave');

        activity.recover(state);
        activity.resume();

        await left;

        assertMessage('activity.end');
        assertMessage('activity.leave');
        expect(messages, 'no more messages').to.have.length(0);
      });

      it('resume recovered new instance on start continuous execution', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        let activity = context.getActivityById('activity');

        const messages = [];
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true});

        activity.broker.subscribeTmp('event', 'activity.start', function stop() {
          activity.broker.unsubscribe('activity.start', stop);
          activity.stop();
        });

        const stopped = activity.waitFor('stop');
        activity.activate();
        activity.run();
        await stopped;

        const state = activity.getState();

        const assertMessage = AssertMessage(context, messages, true);
        assertMessage('activity.enter');
        assertMessage('activity.start');
        assertMessage('activity.stop');
        expect(messages, 'no more messages').to.have.length(0);

        activity = context.clone().getActivityById('activity');
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true});

        const left = activity.waitFor('leave');
        activity.recover(state);
        activity.resume();

        await left;

        assertMessage('activity.end');
        assertMessage('activity.leave');
        expect(messages, 'no more messages').to.have.length(0);
      });


      it('resume stopped on end leaves activity', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');

        const messages = [];
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true, importance: 10});

        activity.broker.subscribeOnce('event', 'activity.end', () => {
          activity.stop();
        }, {importance: 1});

        const stopped = activity.waitFor('stop');
        activity.activate();
        activity.run();
        await stopped;

        const assertMessage = AssertMessage(context, messages, true);
        assertMessage('activity.enter');
        assertMessage('activity.start');
        assertMessage('activity.end');
        assertMessage('activity.stop');
        expect(messages, 'no more messages').to.have.length(0);

        const left = activity.waitFor('leave');

        activity.resume();

        await left;

        assertMessage('activity.leave');

        expect(messages, 'no more messages').to.have.length(0);
      });

      it('resume stopped on end leaves activity', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');

        const messages = [];
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true, importance: 10});

        activity.broker.subscribeOnce('event', 'activity.end', () => {
          activity.stop();
        }, {importance: 1});

        const stopped = activity.waitFor('stop');
        activity.activate();
        activity.run();
        await stopped;

        const assertMessage = AssertMessage(context, messages, true);
        assertMessage('activity.enter');
        assertMessage('activity.start');
        assertMessage('activity.end');
        assertMessage('activity.stop');
        expect(messages, 'no more messages').to.have.length(0);

        const left = activity.waitFor('leave');

        activity.resume();

        await left;

        assertMessage('activity.leave');

        expect(messages, 'no more messages').to.have.length(0);
      });

      it('resume recovered on end leaves activity', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');

        const messages = [];
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true, importance: 10});

        activity.broker.subscribeOnce('event', 'activity.end', () => {
          activity.stop();
        }, {importance: 1});

        const stopped = activity.waitFor('stop');
        activity.activate();
        activity.run();
        await stopped;

        const state = activity.getState();

        const assertMessage = AssertMessage(context, messages, true);
        assertMessage('activity.enter');
        assertMessage('activity.start');
        assertMessage('activity.end');
        assertMessage('activity.stop');
        expect(messages, 'no more messages').to.have.length(0);

        const left = activity.waitFor('leave');

        activity.recover(state);
        activity.resume();

        await left;

        assertMessage('activity.leave');

        expect(messages, 'no more messages').to.have.length(0);
      });

      it('resume recovered new instance on end leaves activity', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        let activity = context.getActivityById('activity');

        const messages = [];
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true, importance: 10});

        activity.broker.subscribeOnce('event', 'activity.end', () => {
          activity.stop();
        }, {importance: 1});

        const stopped = activity.waitFor('stop');
        activity.activate();
        activity.run();
        await stopped;

        const state = activity.getState();

        const assertMessage = AssertMessage(context, messages, true);
        assertMessage('activity.enter');
        assertMessage('activity.start');
        assertMessage('activity.end');
        assertMessage('activity.stop');
        expect(messages, 'no more messages').to.have.length(0);

        activity = context.clone().getActivityById('activity');
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          const api = assertApi(activity, message);
          if (routingKey === 'activity.wait') return api.signal();
          messages.push(message);
        }, {noAck: true, importance: 10});

        const left = activity.waitFor('leave');

        activity.recover(state);
        activity.resume();

        await left;

        assertMessage('activity.leave');

        expect(messages, 'no more messages').to.have.length(0);
      });

      it('resume stopped while discarded leaves activity', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');

        const messages = [];
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          messages.push(message);
          if (routingKey === 'activity.wait') return assertApi(activity, message).signal();
        }, {noAck: true});

        activity.broker.subscribeOnce('event', 'activity.discard', () => {
          activity.stop();
        });

        const stopped = activity.waitFor('stop');
        activity.activate();
        activity.inbound[0].discard();

        await stopped;

        const assertMessage = AssertMessage(context, messages, true);
        assertMessage('activity.discard');
        assertMessage('activity.stop');
        expect(messages, 'no more messages').to.have.length(0);

        const left = activity.waitFor('leave');

        activity.resume();

        await left;

        assertMessage('activity.leave');

        expect(messages, 'no more messages').to.have.length(0);
      });

      it('resume recovered while discarded leaves activity', async () => {
        const context = await testHelpers.context(singleFlowDefinition);
        const activity = context.getActivityById('activity');

        const messages = [];
        activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
          messages.push(message);
          if (routingKey === 'activity.wait') return assertApi(activity, message).signal();
        }, {noAck: true});

        activity.broker.subscribeOnce('event', 'activity.discard', () => {
          activity.stop();
        });

        const stopped = activity.waitFor('stop');
        activity.activate();
        activity.inbound[0].discard();

        await stopped;

        const state = activity.getState();

        const assertMessage = AssertMessage(context, messages, true);
        assertMessage('activity.discard');
        assertMessage('activity.stop');
        expect(messages, 'no more messages').to.have.length(0);

        const left = activity.waitFor('leave');

        activity.recover(state);
        activity.resume();

        await left;

        assertMessage('activity.leave');

        expect(messages, 'no more messages').to.have.length(0);
      });
    });
  });

  describe('on single inbound', () => {
    taskActivities.concat(gateways).forEach((activityType) => {
      describe(activityType, () => {
        let activity, context;
        beforeEach(async () => {
          const source = await SingleFlowDefinition(activityType);
          context = await testHelpers.context(source);
          activity = context.getActivityById('activity');
        });

        it('executes on inbound taken', async () => {
          const messages = [];
          activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
            if (routingKey === 'activity.wait') return assertApi(activity, message).signal();
            messages.push(message);
          }, {noAck: true});

          const completed = activity.waitFor('leave');

          activity.activate();
          activity.inbound[0].take();

          await completed;

          const assertMessage = AssertMessage(context, messages, true);
          assertMessage('activity.enter');
          assertMessage('activity.start');
          assertMessage('activity.end');
          assertMessage('activity.leave');
          expect(messages, 'no more messages').to.have.length(0);
        });

        it('discards if inbound discarded', async () => {
          const messages = [];
          activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
            if (routingKey === 'activity.wait') return assertApi(activity, message).signal();
            messages.push(message);
          }, {noAck: true});

          const completed = activity.waitFor('leave');

          activity.activate();
          activity.inbound[0].discard();

          await completed;

          const assertMessage = AssertMessage(context, messages, true);
          assertMessage('activity.discard');
          assertMessage('activity.leave');
          expect(messages, 'no more messages').to.have.length(0);
        });
      });
    });
  });

  describe('on multiple inbound', () => {
    eventActivities.concat(taskActivities).concat(decisionGateways).forEach((activityType) => {
      describe(activityType, () => {
        let activity, context;
        beforeEach(async () => {
          const source = await MultipleFlowDefinition(activityType);
          context = await testHelpers.context(source);
          activity = context.getActivityById('activity');
        });

        it('executes on first inbound taken', async () => {
          const messages = [];
          activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
            if (routingKey === 'activity.wait') return assertApi(activity, message).signal();
            messages.push(message);
          }, {noAck: true});

          const completed = activity.waitFor('leave');

          activity.activate();
          activity.inbound[0].take();

          await completed;

          const assertMessage = AssertMessage(context, messages, true);
          assertMessage('activity.enter');
          assertMessage('activity.start');
          assertMessage('activity.end');
          assertMessage('activity.leave');
          expect(messages, 'no more messages').to.have.length(0);
        });

        it('discards if first inbound discarded', async () => {
          const messages = [];
          activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
            messages.push(message);
            if (routingKey === 'activity.wait') return assertApi(activity, message).signal();
          }, {noAck: true});

          const completed = activity.waitFor('leave');

          activity.activate();
          activity.inbound[0].discard();

          await completed;

          const assertMessage = AssertMessage(context, messages, true);
          assertMessage('activity.discard');
          assertMessage('activity.leave');
          expect(messages, 'no more messages').to.have.length(0);
        });
      });
    });
  });

  describe('multi instance loop', () => {
    taskActivities.forEach((activityType) => {
      describe(activityType, () => {
        let serialSource, parallelSource;
        before(async () => {
          serialSource = await LoopDefinition(activityType, true);
          parallelSource = await LoopDefinition(activityType, false);
        });

        it('serial loop publish messages in the expected sequence', async () => {
          const context = await testHelpers.context(serialSource);
          const activity = context.getActivityById('activity');

          const messages = [];
          activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
            if (routingKey !== 'activity.wait') return messages.push(message);
            assertApi(activity, message).signal();
          }, {noAck: true});

          let executeCount = 0;
          activity.broker.subscribeTmp('execution', 'execute.#', (routingKey, message) => {
            executeCount++;
            if (executeCount > 20) throw new Error(`Circuitbreaker ${routingKey}`);

            if (['execute.wait', 'execute.signal'].includes(routingKey)) return;

            messages.push(message);
          }, {noAck: true});

          const completed = activity.waitFor('leave');
          activity.activate();
          activity.run();

          await completed;

          const assertMessage = AssertMessage(context, messages, true);
          assertMessage('activity.enter');
          assertMessage('activity.start');
          const msg = assertMessage('execute.start');

          expect(msg.content).to.have.property('isMultiInstance', true);

          assertMessage('execute.iteration.next');
          assertMessage('execute.start');
          assertMessage('execute.completed');
          assertMessage('execute.iteration.completed');
          assertMessage('execute.iteration.next');
          assertMessage('execute.start');
          assertMessage('execute.completed');
          assertMessage('execute.iteration.completed');
          assertMessage('execute.iteration.next');
          assertMessage('execute.start');
          assertMessage('execute.completed');
          assertMessage('execute.iteration.completed');
          assertMessage('execute.completed');
          assertMessage('activity.end');
          assertMessage('activity.leave');
          expect(messages, 'no more messages').to.have.length(0);
        });

        it('serial loop publish messages with expected api', async () => {
          const context = await testHelpers.context(serialSource);
          const activity = context.getActivityById('activity');

          const messages = [];
          activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
            assertApi(activity, message);
            if (routingKey !== 'activity.wait') return messages.push(message);
            assertApi(activity, message).signal();
          }, {noAck: true});

          activity.broker.subscribeTmp('execution', 'execute.#', (routingKey, message) => {
            assertApi(activity, message);
            messages.push(message);
          }, {noAck: true});

          const completed = activity.waitFor('leave');
          activity.activate();
          activity.run();

          await completed;
        });

        it('parallel loop completes executions', async () => {
          const context = await testHelpers.context(parallelSource);
          const activity = context.getActivityById('activity');

          const messages = [];
          activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
            if (routingKey !== 'activity.wait') return messages.push(message);
            assertApi(activity, message).signal();
          }, {noAck: true});

          let executeCount = 0;
          activity.broker.subscribeTmp('execution', 'execute.#', (routingKey, message) => {
            if (['execute.wait', 'execute.signal'].includes(routingKey)) return;

            executeCount++;
            if (executeCount > 20) throw new Error(`Circuitbreaker ${routingKey}`);

            messages.push(message);
          }, {noAck: true});

          const completed = activity.waitFor('leave');
          activity.activate();
          activity.run();

          await completed;

          const assertMessage = AssertMessage(context, messages, false);
          assertMessage('activity.enter');
          assertMessage('activity.start');
          assertMessage('execute.completed');
          assertMessage('execute.completed');
          assertMessage('execute.completed');
          assertMessage('activity.end');
          assertMessage('activity.leave');
          expect(messages, 'no more messages').to.have.length(0);
        });

        it('discard() loop execution on start skips to leave', async () => {
          const context = await testHelpers.context(serialSource);
          const activity = context.getActivityById('activity');

          const messages = [];
          activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
            const api = assertApi(activity, message);
            if (routingKey === 'activity.start') {
              messages.push(message);
              return api.discard();
            }

            if (routingKey !== 'activity.wait') return messages.push(message);
            api.signal();
          }, {noAck: true});

          const completed = activity.waitFor('leave');
          activity.activate();
          activity.run();

          await completed;

          const assertMessage = AssertMessage(context, messages, true);
          assertMessage('activity.enter');
          assertMessage('activity.start');
          assertMessage('activity.discard');
          assertMessage('activity.leave');
          expect(messages, 'no more messages').to.have.length(0);
        });
      });
    });
  });

  describe('resume loop', () => {
    taskActivities.forEach((activityType) => {
      [true, false].forEach((isSequential) => {
        const loopType = isSequential ? 'serial' : 'parallel';

        describe(`${loopType} ${activityType} loop`, () => {
          let loopSource;

          before(async () => {
            loopSource = await LoopDefinition(activityType, isSequential);
          });

          it('resume stopped while iteration execute completes loop execution', async () => {
            const context = await testHelpers.context(loopSource);
            const activity = context.getActivityById('activity');

            const messages = [];
            activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
              if (routingKey !== 'activity.wait') return messages.push(message);
              assertApi(activity, message).signal();
            }, {noAck: true});

            let executeCount = 0;
            activity.broker.subscribeTmp('execution', 'execute.#', (routingKey, message) => {
              executeCount++;
              if (executeCount > 20) throw new Error(`Circuitbreaker ${routingKey}`);
              if (['execute.wait', 'execute.signal'].includes(routingKey)) return;
              messages.push(message);
            }, {noAck: true});

            activity.broker.subscribeOnce('event', 'activity.start', () => {
              activity.stop();
            }, {noAck: true});

            const stopped = activity.waitFor('stop');
            activity.activate();
            activity.run();

            await stopped;

            const assertMessage = AssertMessage(context, messages, false);
            assertMessage('activity.enter');
            assertMessage('activity.start');
            assertMessage('activity.stop');
            expect(messages).to.have.length(0);

            const completed = activity.waitFor('leave');

            activity.resume();

            await completed;

            assertMessage('execute.completed');
            assertMessage('execute.completed');
            assertMessage('execute.completed');
            assertMessage('activity.end');
            assertMessage('activity.leave');
          });

          it('resume recovered while iteration execute completes loop execution', async () => {
            const context = await testHelpers.context(loopSource);
            const activity = context.getActivityById('activity');

            const messages = [];
            activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
              if (routingKey !== 'activity.wait') return messages.push(message);
              assertApi(activity, message).signal();
            }, {noAck: true});

            let executeCount = 0;
            activity.broker.subscribeTmp('execution', 'execute.#', (routingKey, message) => {
              executeCount++;
              if (executeCount > 20) throw new Error(`Circuitbreaker ${routingKey}`);
              if (['execute.wait', 'execute.signal'].includes(routingKey)) return;
              messages.push(message);
            }, {noAck: true});

            activity.broker.subscribeOnce('event', 'activity.start', () => {
              activity.stop();
            }, {noAck: true});

            const stopped = activity.waitFor('stop');
            activity.activate();
            activity.run();

            await stopped;

            const state = activity.getState();

            const assertMessage = AssertMessage(context, messages, false);
            assertMessage('activity.enter');
            assertMessage('activity.start');
            assertMessage('activity.stop');
            expect(messages).to.have.length(0);

            const completed = activity.waitFor('leave');

            activity.recover(state);
            activity.resume();

            await completed;

            assertMessage('execute.completed');
            assertMessage('execute.completed');
            assertMessage('execute.completed');
            assertMessage('activity.end');
            assertMessage('activity.leave');
          });

          it('resume recovered new instance completes loop execution', async () => {
            const context = await testHelpers.context(loopSource);
            let activity = context.getActivityById('activity');

            const messages = [];
            activity.broker.subscribeTmp('event', 'activity.*', onActivityEvent, {noAck: true});

            let executeCount = 0;
            activity.broker.subscribeTmp('execution', 'execute.#', onExecuteMsg, {noAck: true});

            activity.broker.subscribeOnce('event', 'activity.start', () => {
              activity.stop();
            }, {noAck: true});

            const stopped = activity.waitFor('stop');
            activity.activate();
            activity.run();

            await stopped;

            const state = activity.getState();

            const assertMessage = AssertMessage(context, messages, false);
            assertMessage('activity.enter');
            assertMessage('activity.start');
            assertMessage('activity.stop');
            expect(messages).to.have.length(0);

            activity = context.clone().getActivityById('activity');
            activity.broker.subscribeTmp('event', 'activity.*', onActivityEvent, {noAck: true});
            activity.broker.subscribeTmp('execution', 'execute.#', onExecuteMsg, {noAck: true});
            const left = activity.waitFor('leave');

            activity.recover(state);
            activity.resume();

            await left;

            assertMessage('execute.completed');
            assertMessage('execute.completed');
            assertMessage('execute.completed');
            assertMessage('activity.end');
            assertMessage('activity.leave');

            function onActivityEvent(routingKey, message) {
              if (routingKey !== 'activity.wait') return messages.push(message);
              assertApi(activity, message).signal();
            }

            function onExecuteMsg(routingKey, message) {
              executeCount++;
              if (executeCount > 20) throw new Error(`Circuitbreaker ${routingKey}`);
              if (['execute.wait', 'execute.signal'].includes(routingKey)) return;
              messages.push(message);
            }
          });

          it('resume after activity end completes run', async () => {
            const context = await testHelpers.context(loopSource);
            const activity = context.getActivityById('activity');

            const messages = [];
            activity.broker.subscribeTmp('event', 'activity.*', (routingKey, message) => {
              if (routingKey === 'activity.wait') {
                const api = assertApi(activity, message);
                return api.signal();
              }

              messages.push(message);
            }, {noAck: true});

            let executeCount = 0;
            activity.broker.subscribeTmp('execution', 'execute.#', (routingKey, message) => {
              executeCount++;
              if (executeCount > 20) throw new Error(`Circuitbreaker ${routingKey}`);
              if (['execute.wait', 'execute.signal'].includes(routingKey)) return;
              messages.push(message);
            }, {noAck: true});

            let state;
            activity.broker.subscribeOnce('event', 'activity.end', () => {
              activity.stop();
              state = activity.getState();
            }, {noAck: true});

            const stopped = activity.waitFor('stop');
            activity.activate();
            activity.run();

            await stopped;

            const assertMessage = AssertMessage(context, messages, false);
            assertMessage('activity.enter');
            assertMessage('activity.start');
            assertMessage('execute.completed');
            assertMessage('execute.completed');
            assertMessage('execute.completed');
            assertMessage('activity.end');
            assertMessage('activity.stop');
            expect(messages.length).to.equal(0);

            const completed = activity.waitFor('leave');

            activity.recover(state);

            activity.resume();

            await completed;

            assertMessage('activity.leave');
            expect(messages).to.have.length(0);
          });
        });
      });
    });
  });
});

async function SimpleDefinition(activityType) {
  const source = `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions id="task-definitions" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
  </definitions>`;

  const {definitions} = await fromXML(source);
  const dataObject = moddle.create('bpmn:DataObject', { id: 'myData' });
  const dataObjectRef = moddle.create('bpmn:DataObjectReference', { id: 'myDataRef', dataObjectRef: dataObject });

  const activityInput = moddle.create('bpmn:DataInput', {id: 'activityInput'});
  const activityOutput = moddle.create('bpmn:DataOutput', {id: 'activityOutput'});

  const inputRef = moddle.create('bpmn:DataInputAssociation', {
    id: 'dataInputAssociation',
    targetRef: dataObjectRef,
    sourceRef: [activityInput],
  });
  const outputRef = moddle.create('bpmn:DataOutputAssociation', {
    id: 'dataOutputAssociation',
    targetRef: dataObjectRef,
    sourceRef: [activityOutput],
  });

  const activity = moddle.create(activityType, {
    id: 'activity',
    dataInputAssociations: [inputRef],
    dataOutputAssociations: [outputRef],
    ioSpecification: moddle.create('bpmn:InputOutputSpecification', {
      dataInputs: [activityInput],
      dataOutputs: [activityOutput],
    }),
  });

  const bpmnProcess = moddle.create('bpmn:Process', {
    id: 'Process_1',
    isExecutable: true,
    flowElements: [activity, dataObject, dataObjectRef],
  });

  definitions.get('rootElements').push(bpmnProcess);

  return toXml(definitions);
}

async function SingleFlowDefinition(activityType) {
  const source = `
  <?xml version="1.0" encoding="UTF-8"?>
  <bpmn2:definitions id="task-definitions" xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
  </bpmn2:definitions>`;

  const {definitions} = await fromXML(source);

  const flowElements = [
    moddle.create('bpmn:StartEvent', {id: 'start'}),
    moddle.create(activityType, { id: 'activity' }),
    moddle.create('bpmn:EndEvent', {id: 'end1'}),
    moddle.create('bpmn:EndEvent', {id: 'end2'})
  ];

  const [start, activity, end1, end2] = flowElements;

  const flows = [
    moddle.create('bpmn:SequenceFlow', {id: 'flow1', sourceRef: start, targetRef: activity}),
    moddle.create('bpmn:SequenceFlow', {id: 'flow2', sourceRef: activity, targetRef: end1}),
    moddle.create('bpmn:SequenceFlow', {id: 'flow3', sourceRef: activity, targetRef: end2})
  ];
  const [, flow2, flow3] = flows;

  if (decisionGateways.includes(activityType)) {
    activity.set('default', flow2);
    const conditionExpression = moddle.create('bpmn:FormalExpression', {
      body: '${variables.take}',
    });
    flow3.set('conditionExpression', conditionExpression);
  }

  const bpmnProcess = moddle.create('bpmn:Process', {
    id: 'Process_1',
    isExecutable: true,
    flowElements: flowElements.concat(flows),
  });

  definitions.get('rootElements').push(bpmnProcess);

  return toXml(definitions);
}

async function MultipleFlowDefinition(activityType) {
  const source = `
  <?xml version="1.0" encoding="UTF-8"?>
  <bpmn2:definitions id="task-definitions" xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
  </bpmn2:definitions>`;

  const {definitions} = await fromXML(source);

  const flowElements = [
    moddle.create('bpmn:StartEvent', {id: 'start'}),
    moddle.create('bpmn:ExclusiveGateway', {id: 'decision'}),
    moddle.create(activityType, { id: 'activity' }),
    moddle.create('bpmn:EndEvent', {id: 'end1'}),
    moddle.create('bpmn:EndEvent', {id: 'end2'})
  ];

  const [start, decision, activity, end1, end2] = flowElements;

  const flows = [
    moddle.create('bpmn:SequenceFlow', {id: 'flow1', sourceRef: start, targetRef: decision}),
    moddle.create('bpmn:SequenceFlow', {id: 'flow2', sourceRef: decision, targetRef: activity}),
    moddle.create('bpmn:SequenceFlow', {id: 'flow3', sourceRef: decision, targetRef: activity}),
    moddle.create('bpmn:SequenceFlow', {id: 'flow4', sourceRef: activity, targetRef: end1}),
    moddle.create('bpmn:SequenceFlow', {id: 'flow5', sourceRef: activity, targetRef: end2})
  ];
  const [, flow2, flow3, flow4, flow5] = flows;

  decision.set('default', flow2);
  const decisionExpression = moddle.create('bpmn:FormalExpression', {
    body: '${variables.take}',
  });
  flow3.set('conditionExpression', decisionExpression);

  if (decisionGateways.includes(activityType)) {
    activity.set('default', flow4);
    const conditionExpression = moddle.create('bpmn:FormalExpression', {
      body: '${variables.take}',
    });
    flow5.set('conditionExpression', conditionExpression);
  }

  const bpmnProcess = moddle.create('bpmn:Process', {
    id: 'Process_1',
    isExecutable: true,
    flowElements: flowElements.concat(flows),
  });

  definitions.get('rootElements').push(bpmnProcess);

  return toXml(definitions);
}

async function LoopDefinition(activityType, isSequential) {
  const source = `
  <?xml version="1.0" encoding="UTF-8"?>
  <bpmn2:definitions id="task-definitions" xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
  </bpmn2:definitions>`;

  const {definitions} = await fromXML(source);

  const loopCharacteristics = moddle.create('bpmn:MultiInstanceLoopCharacteristics', {
    isSequential,
    loopCardinality: moddle.create('bpmn:FormalExpression', { body: '3' }),
  });

  const flowElements = [
    moddle.create('bpmn:StartEvent', {id: 'start'}),
    moddle.create(activityType, {
      id: 'activity',
      loopCharacteristics,
    }),
    moddle.create('bpmn:EndEvent', {id: 'end'})
  ];

  const [start, activity, end] = flowElements;

  const flows = [
    moddle.create('bpmn:SequenceFlow', {id: 'flow1', sourceRef: start, targetRef: activity}),
    moddle.create('bpmn:SequenceFlow', {id: 'flow2', sourceRef: activity, targetRef: end})
  ];

  const bpmnProcess = moddle.create('bpmn:Process', {
    id: 'Process_1',
    isExecutable: true,
    flowElements: flowElements.concat(flows),
  });

  definitions.get('rootElements').push(bpmnProcess);

  return toXml(definitions);
}

function fromXML(source) {
  return new Promise((resolve, reject) => {
    moddle.fromXML(source, (err, definitions, moddleContext) => {
      if (err) return reject(err);
      return resolve({
        definitions,
        moddleContext,
      });
    });
  });
}

function toXml(definitions) {
  return new Promise((resolve, reject) => {
    moddle.toXML(definitions, (err, source) => {
      if (err) return reject(err);
      return resolve(source);
    });
  });
}

function assertApi(activity, message, compareState) {
  const {content, fields} = message;
  const {routingKey} = fields;
  const activityApi = activity.getApi(message);

  if (content && content.isLoopContext) {
    expect(activityApi).to.have.property('id').that.match(/^activity(_.+|$)/);
  } else {
    expect(activityApi).to.have.property('id', 'activity');
  }

  expect(activityApi, routingKey).to.have.property('type', activity.type);
  expect(activityApi, routingKey).to.have.property('cancel').that.is.a('function');
  expect(activityApi, routingKey).to.have.property('discard').that.is.a('function');
  expect(activityApi, routingKey).to.have.property('signal').that.is.a('function');

  if (compareState) {
    expect(activityApi.getState()).to.deep.include(compareState);
  }

  return activityApi;
}

function AssertMessage(processContext, messages, inSequence) {
  return function assertMessage(routingKey, activityId, compareState) {
    if (!messages.length) {
      if (activityId) throw new Error(`${routingKey} <${activityId}> not found`);
      throw new Error(`${routingKey} not found`);
    }

    const message = messages.shift();

    if (!inSequence) {
      if (message.fields.routingKey !== routingKey) return assertMessage(routingKey, activityId);
      if (activityId && message.content.id !== activityId) return assertMessage(routingKey, activityId);
    }

    expect(message.fields).to.have.property('routingKey', routingKey);
    if (activityId) expect(message.content).to.have.property('id', activityId);

    if (!compareState) return message;

    const activity = processContext.getActivityById(id);
    const {source, context, id} = message.content;
    const activityApi = activity.getApi(source, context);

    expect(activityApi.getState(), `${routingKey} ${activityId} state`).to.deep.include(compareState);

    return message;
  };
}
