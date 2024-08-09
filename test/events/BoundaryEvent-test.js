import testHelpers from '../helpers/testHelpers.js';
import Environment from '../../src/Environment.js';
import ErrorEventDefinition from '../../src/eventDefinitions/ErrorEventDefinition.js';
import MessageEventDefinition from '../../src/eventDefinitions/MessageEventDefinition.js';
import SignalTask from '../../src/tasks/SignalTask.js';
import BoundaryEvent, { BoundaryEventBehaviour } from '../../src/events/BoundaryEvent.js';
import { ActivityBroker } from '../../src/EventBroker.js';

describe('BoundaryEvent', () => {
  describe('behaviour', () => {
    describe('cancel activity flag', () => {
      it('defaults to true', () => {
        const attachedTo = {
          id: 'task',
          broker: ActivityBroker(this).broker,
        };
        const behaviour = new BoundaryEventBehaviour({
          broker: ActivityBroker(this).broker,
          attachedTo,
        });

        expect(behaviour).to.have.property('cancelActivity', true);
      });

      it('returns behaviour value', () => {
        const attachedTo = {
          id: 'task',
          broker: ActivityBroker(this).broker,
        };
        const behaviour = new BoundaryEventBehaviour({
          broker: ActivityBroker(this).broker,
          attachedTo,
          behaviour: { cancelActivity: false },
        });

        expect(behaviour).to.have.property('cancelActivity', false);
      });
    });

    describe('without event definitions', () => {
      it('adds listener to attached to on execute', () => {
        const attachedTo = {
          id: 'task',
          broker: ActivityBroker(this).broker,
        };
        const behaviour = new BoundaryEventBehaviour(
          {
            id: 'event',
            broker: ActivityBroker(this).broker,
            attachedTo,
          },
          {
            getOutboundAssociations() {},
          },
        );

        expect(attachedTo.broker.getExchange('event')).to.have.property('bindingCount', 0);

        behaviour.execute({
          fields: {},
          content: {
            id: 'event',
            executionId: 'event_1',
            isRootScope: true,
          },
        });

        expect(attachedTo.broker.getExchange('event')).to.have.property('bindingCount', 1);
      });

      it('adds api listener on execute', () => {
        const attachedTo = {
          id: 'task',
          broker: ActivityBroker(this).broker,
        };
        const broker = ActivityBroker().broker;
        const behaviour = new BoundaryEventBehaviour(
          {
            id: 'event',
            broker,
            attachedTo,
          },
          {
            getOutboundAssociations() {},
          },
        );

        expect(broker.getExchange('api')).to.have.property('bindingCount', 0);

        behaviour.execute({
          fields: {},
          content: {
            id: 'event',
            executionId: 'event_1',
            isRootScope: true,
          },
        });

        expect(broker.getExchange('api')).to.have.property('bindingCount', 1);
      });

      it('discards event and cancels listeners on attachedTo leave', () => {
        const attachedTo = {
          id: 'task',
          broker: ActivityBroker(this).broker,
        };
        const broker = ActivityBroker().broker;
        const behaviour = new BoundaryEventBehaviour(
          {
            id: 'event',
            broker,
            attachedTo,
          },
          {
            getOutboundAssociations() {},
          },
        );

        behaviour.execute({
          fields: {},
          content: {
            id: 'event',
            executionId: 'event_1',
            isRootScope: true,
          },
        });

        let message;
        broker.subscribeOnce('execution', 'execute.#', (_, msg) => {
          message = msg;
        });
        attachedTo.broker.publish('event', 'activity.leave', { id: attachedTo.id });

        expect(message).to.be.ok;
        expect(message).to.have.property('fields').with.property('routingKey', 'execute.discard');
        expect(message).to.have.property('content').with.property('executionId', 'event_1');
        expect(message).to.have.property('content').with.property('isRootScope', true);

        expect(attachedTo.broker.getExchange('event')).to.have.property('bindingCount', 0);
        expect(broker.getExchange('api')).to.have.property('bindingCount', 0);
      });

      it('discards event and cancels listeners on attachedTo leave', () => {
        const attachedTo = {
          id: 'task',
          broker: ActivityBroker(this).broker,
        };
        const broker = ActivityBroker().broker;
        const behaviour = new BoundaryEventBehaviour(
          {
            id: 'event',
            broker,
            attachedTo,
          },
          {
            getOutboundAssociations() {},
          },
        );

        behaviour.execute({
          fields: {},
          content: {
            id: 'event',
            executionId: 'event_1',
            isRootScope: true,
          },
        });

        let message;
        broker.subscribeOnce('execution', 'execute.#', (_, msg) => {
          message = msg;
        });
        attachedTo.broker.publish('event', 'activity.leave', { id: attachedTo.id });

        expect(message).to.be.ok;
        expect(message).to.have.property('fields').with.property('routingKey', 'execute.discard');

        expect(attachedTo.broker.getExchange('execution')).to.have.property('bindingCount', 1);
        expect(broker.getExchange('api')).to.have.property('bindingCount', 0);
      });

      it('api stop cancels listeners', () => {
        const attachedTo = {
          id: 'task',
          broker: ActivityBroker(this).broker,
        };

        const broker = ActivityBroker().broker;
        const behaviour = new BoundaryEventBehaviour(
          {
            id: 'event',
            broker,
            attachedTo,
          },
          {
            getOutboundAssociations() {},
          },
        );

        behaviour.execute({
          fields: {},
          content: {
            id: 'event',
            executionId: 'event_1',
            isRootScope: true,
          },
        });

        broker.publish('api', 'activity.stop.event_1', {}, { type: 'stop' });

        expect(attachedTo.broker.getExchange('execution')).to.have.property('bindingCount', 1);
        expect(broker.getExchange('api')).to.have.property('bindingCount', 0);
        expect(broker.getExchange('execution')).to.have.property('bindingCount', 1);
      });

      it('cancel activity cancels listeners and discards attachedTo by api once on execution complete', () => {
        let discarded = 0;
        const attachedTo = {
          id: 'task',
          broker: ActivityBroker(this).broker,
        };

        attachedTo.getApi = ({ content }) => {
          return {
            discard() {
              discarded++;
              attachedTo.broker.publish('api', `activity.discard.${content.executionId}`);
            },
          };
        };

        const broker = ActivityBroker().broker;
        const behaviour = new BoundaryEventBehaviour(
          {
            id: 'event',
            broker,
            attachedTo,
            behaviour: {
              cancelActivity: true,
            },
            environment: new Environment(),
            logger: testHelpers.Logger('boundaryevent'),
          },
          {
            getOutboundAssociations() {},
          },
        );

        behaviour.execute({
          fields: {},
          content: {
            id: 'event',
            executionId: 'event_1',
            isRootScope: true,
            inbound: [
              {
                executionId: 'activity_1',
              },
            ],
          },
        });

        attachedTo.broker.subscribeOnce('api', 'activity.discard.activity_1', () => {
          attachedTo.broker.publish('event', 'activity.leave', { id: attachedTo.id });
        });

        broker.publish('execution', 'execute.bound.completed', {});

        expect(attachedTo.broker.getExchange('event')).to.have.property('bindingCount', 0);
        expect(broker.getExchange('api')).to.have.property('bindingCount', 0);

        expect(discarded, 'attachedTo discarded').to.equal(1);
      });
    });

    describe('with event definitions', () => {
      it('adds listener to attached to on execute', () => {
        const attachedTo = {
          id: 'task',
          broker: ActivityBroker(this).broker,
        };
        const broker = ActivityBroker().broker;
        const environment = new Environment({ Logger: testHelpers.Logger });
        const activity = {
          id: 'event',
          broker,
          environment,
          logger: environment.Logger('boundaryevent'),
          attachedTo,
          get eventDefinitions() {
            const self = this;
            return self._eds || (self._eds = [new ErrorEventDefinition(self, {}), new MessageEventDefinition(self, {})]);
          },
        };
        const behaviour = new BoundaryEventBehaviour(activity, {
          getOutboundAssociations() {},
        });
        expect(attachedTo.broker.getExchange('event')).to.have.property('bindingCount', 0);

        broker.subscribeTmp('event', 'execute.start', (_, msg) => behaviour.execute(msg));

        behaviour.execute({
          fields: {},
          content: {
            id: 'event',
            executionId: 'event_1',
            isRootScope: true,
            parent: {
              id: 'theProcess',
            },
          },
        });

        expect(attachedTo.broker.getExchange('execution')).to.have.property('bindingCount', 1);
      });

      it('discards event and cancels listeners on attachedTo end', () => {
        const attachedTo = {
          id: 'task',
          broker: ActivityBroker(this).broker,
        };
        const broker = ActivityBroker().broker;
        const environment = new Environment({ Logger: testHelpers.Logger });
        const behaviour = new BoundaryEventBehaviour(
          {
            id: 'event',
            broker,
            environment,
            logger: environment.Logger('boundaryevent'),
            attachedTo,
            behaviour: {
              eventDefinitions: [
                {
                  Behaviour: ErrorEventDefinition,
                },
              ],
            },
          },
          {
            getOutboundAssociations() {},
          },
        );

        behaviour.execute({
          fields: {},
          content: {
            id: 'event',
            executionId: 'event_1',
            isRootScope: true,
            parent: {
              id: 'theProcess',
            },
          },
        });

        let message;
        broker.subscribeOnce('execution', 'execute.#', (_, msg) => {
          message = msg;
        });
        attachedTo.broker.publish('event', 'activity.leave', { id: attachedTo.id });

        expect(message).to.be.ok;
        expect(message).to.have.property('fields').with.property('routingKey', 'execute.discard');

        expect(attachedTo.broker.getExchange('event')).to.have.property('bindingCount', 0);
        expect(broker.getExchange('api')).to.have.property('bindingCount', 0);
      });

      it('discards event and cancels listeners on attachedTo leave', () => {
        const attachedTo = {
          id: 'task',
          broker: ActivityBroker(this).broker,
        };
        const broker = ActivityBroker().broker;
        const environment = new Environment({ Logger: testHelpers.Logger });
        const behaviour = new BoundaryEventBehaviour(
          {
            id: 'event',
            broker,
            environment,
            logger: environment.Logger('boundaryevent'),
            attachedTo,
            behaviour: {
              eventDefinitions: [
                {
                  Behaviour: MessageEventDefinition,
                },
              ],
            },
          },
          {
            getOutboundAssociations() {},
          },
        );

        behaviour.execute({
          fields: {},
          content: {
            id: 'event',
            executionId: 'event_1',
            isRootScope: true,
            parent: {
              id: 'theProcess',
            },
          },
        });

        let message;
        broker.subscribeOnce('execution', 'execute.#', (_, msg) => {
          message = msg;
        });
        attachedTo.broker.publish('event', 'activity.leave', { id: attachedTo.id });

        expect(message).to.be.ok;
        expect(message).to.have.property('fields').with.property('routingKey', 'execute.discard');

        expect(attachedTo.broker.getExchange('execution')).to.have.property('bindingCount', 1);
        expect(broker.getExchange('api')).to.have.property('bindingCount', 0);
      });

      it('api stop cancels listeners', () => {
        const attachedTo = {
          id: 'task',
          broker: ActivityBroker(this).broker,
        };
        const broker = ActivityBroker().broker;
        const environment = new Environment({ Logger: testHelpers.Logger });
        const behaviour = new BoundaryEventBehaviour(
          {
            id: 'event',
            broker,
            environment,
            logger: environment.Logger('boundaryevent'),
            attachedTo,
            behaviour: {
              eventDefinitions: [
                {
                  Behaviour: ErrorEventDefinition,
                },
              ],
            },
          },
          {
            getOutboundAssociations() {},
          },
        );

        behaviour.execute({
          fields: {},
          content: {
            id: 'event',
            executionId: 'event_1',
            isRootScope: true,
            parent: {
              id: 'theProcess',
            },
          },
        });

        broker.publish('api', 'activity.stop.event_1', {}, { type: 'stop' });

        expect(attachedTo.broker.getExchange('execution')).to.have.property('bindingCount', 1);
        expect(broker.getExchange('api')).to.have.property('bindingCount', 0);
      });
    });

    describe('detached', () => {
      let behaviour, broker;
      beforeEach(() => {
        const attachedTo = {
          id: 'task',
          broker: ActivityBroker(this).broker,
        };
        broker = ActivityBroker().broker;
        const environment = new Environment({ Logger: testHelpers.Logger });
        behaviour = new BoundaryEventBehaviour(
          {
            id: 'event',
            broker,
            environment,
            logger: environment.Logger('boundaryevent'),
            attachedTo,
            behaviour: {
              eventDefinitions: [
                {
                  Behaviour: ErrorEventDefinition,
                },
              ],
            },
            removeInboundListeners() {},
          },
          {
            getOutboundAssociations() {},
          },
        );
      });

      it('clears listeners if stopped', () => {
        behaviour.execute({
          fields: {},
          content: {
            id: 'event',
            executionId: 'event_1',
            isRootScope: true,
            parent: {
              id: 'theProcess',
            },
          },
        });

        broker.publish('execution', 'execute.detach', {
          sourceExchange: 'execution',
          bindExchange: 'execution',
          sourcePattern: '#',
          executionId: 'event_0_1',
        });
        broker.publish(
          'api',
          'activity.stop.event_1',
          {},
          {
            type: 'stop',
          },
        );

        expect(broker).to.have.property('consumerCount', 0);
        expect(behaviour.attachedTo.broker).to.have.property('consumerCount', 0);
      });

      it('clears listeners if discarded', () => {
        behaviour.execute({
          fields: {},
          content: {
            id: 'event',
            executionId: 'event_1',
            isRootScope: true,
            parent: {
              id: 'theProcess',
            },
          },
        });

        broker.publish('execution', 'execute.detach', {
          sourceExchange: 'execution',
          bindExchange: 'execution',
          sourcePattern: '#',
        });
        broker.publish('api', 'activity.discard.event_1', {}, { type: 'discard' });

        expect(behaviour.attachedTo.broker).to.have.property('consumerCount', 0);
        expect(broker).to.have.property('consumerCount', 0);
      });
    });
  });

  describe('multiple boundary events attached to same task', () => {
    it('listens to the same task broker exchange', () => {
      const context = testHelpers.emptyContext({
        getActivityById(id) {
          return {
            id,
            parent: {
              id: 'theProcess',
            },
            ...(id !== 'task'
              ? {
                  type: 'boundaryevent',
                  Behaviour: BoundaryEvent,
                  behaviour: {
                    attachedTo: { id: 'task' },
                    eventDefinitions: [
                      {
                        type: 'messageeventdefinition',
                        Behaviour: MessageEventDefinition,
                      },
                    ],
                  },
                }
              : {
                  type: 'task',
                  Behaviour: SignalTask,
                }),
          };
        },
      });

      const attachedTo = context.getActivityById('task');
      expect(attachedTo.broker.getExchange('event').bindingCount).to.equal(0);

      const events = [context.getActivityById('bound1'), context.getActivityById('bound2'), context.getActivityById('bound3')];

      expect(events[0].broker.getQueue('inbound-q')).to.be.ok;
      expect(events[1].broker.getQueue('inbound-q')).to.not.equal(events[0].broker.getQueue('inbound-q'));

      for (const event of events) {
        expect(event.attachedTo, event.id + ' attached to').to.equal(attachedTo);

        event.activate();

        const inboundQ = event.broker.getQueue('inbound-q');
        expect(inboundQ.consumerCount, event.id + ' inbound-q consumer count').to.be.ok;
      }

      expect(attachedTo.broker.getExchange('event').bindingCount).to.equal(3);

      let enterMessage;
      attachedTo.broker.subscribeTmp(
        'event',
        'activity.enter',
        (_, msg) => {
          enterMessage = msg;
        },
        { noAck: true, priority: 10000 },
      );

      attachedTo.broker.publish('event', 'activity.enter', { id: 'task' });

      expect(enterMessage, 'enter message published').to.be.ok;

      for (const event of events) {
        expect(event.status, event.id).to.equal('executing');
      }
    });
  });

  describe('for real', () => {
    describe('without event definitions', () => {
      it('without event definitions discards when attached to completes', async () => {
        const source = `
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="theProcess" isExecutable="true">
            <serviceTask id="service" />
            <boundaryEvent id="emptyEvent" attachedToRef="service" />
          </process>
        </definitions>`;

        const context = await testHelpers.context(source);

        const task = context.getActivityById('service');
        const event = context.getActivityById('emptyEvent');

        const leave = event.waitFor('leave');

        event.activate();
        task.run();

        await leave;

        expect(event.counters).to.have.property('discarded', 1);
      });

      it('without event definitions discards when attached to is discarded', async () => {
        const source = `
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="theProcess" isExecutable="true">
            <serviceTask id="service" />
            <boundaryEvent id="emptyEvent" attachedToRef="service" />
          </process>
        </definitions>`;

        const context = await testHelpers.context(source);

        const task = context.getActivityById('service');
        const event = context.getActivityById('emptyEvent');

        const leave = event.waitFor('leave');

        event.activate();
        task.discard();

        await leave;

        expect(event.counters).to.have.property('discarded', 1);
      });
    });

    describe('with event definitions', () => {
      let context;
      beforeEach(async () => {
        const source = `
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="theProcess" isExecutable="true">
            <userTask id="task" />
            <boundaryEvent id="event" attachedToRef="task">
              <errorEventDefinition />
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">\${environment.variables.duration}</timeDuration>
              </timerEventDefinition>
            </boundaryEvent>
          </process>
        </definitions>`;
        context = await testHelpers.context(source);
        context.environment.variables.duration = 'PT2S';
      });

      it('discards all event definitions if attached activity completes', async () => {
        const task = context.getActivityById('task');
        const event = context.getActivityById('event');

        const messages = [];
        event.broker.subscribeTmp(
          'execution',
          'execute.*',
          (routingKey, message) => {
            messages.push(message);
          },
          { noAck: true },
        );

        const wait = task.waitFor('wait');
        const leave = event.waitFor('leave');

        event.activate();
        task.run();

        const api = await wait;
        api.signal();

        await leave;

        const discarded = messages.filter(({ fields }) => fields.routingKey === 'execute.discard');
        expect(discarded).to.have.length(3);
        expect(discarded.map(({ content }) => content.type)).to.have.same.members([
          'bpmn:BoundaryEvent',
          'bpmn:ErrorEventDefinition',
          'bpmn:TimerEventDefinition',
        ]);
      });

      it('discards incomplete event definitions if event completes', async () => {
        context.environment.variables.duration = 'PT0.01S';

        const task = context.getActivityById('task');
        const event = context.getActivityById('event');

        const messages = [];
        event.broker.subscribeTmp(
          'execution',
          'execute.*',
          (routingKey, message) => {
            messages.push(message);
          },
          { noAck: true },
        );

        const leave = event.waitFor('leave');

        event.activate();
        task.run();

        await leave;

        const discarded = messages.filter(({ fields }) => fields.routingKey === 'execute.discard');
        expect(discarded).to.have.length(1);
        expect(discarded.map(({ content }) => content.type)).to.have.same.members(['bpmn:ErrorEventDefinition']);
      });

      it('discards all if attached activity is discarded while executing', async () => {
        const task = context.getActivityById('task');
        const event = context.getActivityById('event');

        const messages = [];
        event.broker.subscribeTmp(
          'execution',
          'execute.*',
          (routingKey, message) => {
            messages.push(message);
          },
          { noAck: true },
        );

        const wait = task.waitFor('wait');
        const leave = event.waitFor('leave');

        event.activate();
        task.run();

        const api = await wait;
        api.discard();

        await leave;

        const discarded = messages.filter(({ fields }) => fields.routingKey === 'execute.discard');
        expect(discarded).to.have.length(3);
        expect(discarded.map(({ content }) => content.type)).to.have.same.members([
          'bpmn:BoundaryEvent',
          'bpmn:ErrorEventDefinition',
          'bpmn:TimerEventDefinition',
        ]);
      });
    });

    describe('with error event definition', () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <serviceTask id="service" implementation="\${environment.services.test}" />
          <boundaryEvent id="errorEvent" attachedToRef="service">
            <errorEventDefinition errorRef="Error_0w1hljb" />
          </boundaryEvent>
          <endEvent id="end" />
          <sequenceFlow id="toService" sourceRef="start" targetRef="service" />
          <sequenceFlow id="toEnd" sourceRef="service" targetRef="end" />
          <sequenceFlow id="toEndAfterError" sourceRef="errorEvent" targetRef="end" />
        </process>
        <error id="Error_0w1hljb" name="ServiceError" errorCode="\${content.message}" />
      </definitions>`;

      let context;
      beforeEach(async () => {
        context = await testHelpers.context(source);
      });

      it('completes when attached error is caught', async () => {
        context.environment.addService('test', (arg, next) => {
          next(new Error('FAIL'));
        });

        const task = context.getActivityById('service');
        const event = context.getActivityById('errorEvent');

        const leave = event.waitFor('leave');

        event.activate();
        task.run();

        await leave;

        expect(event.counters).to.have.property('taken', 1);
        expect(task.counters).to.have.property('discarded', 1);
      });

      it('leaves when error is caught', () => {
        context.environment.addService('test', (arg, next) => {
          next(new Error('FAIL'));
        });

        const task = context.getActivityById('service');
        const event = context.getActivityById('errorEvent');

        const messages = [];
        task.broker.subscribeOnce('event', 'activity.leave', (_, msg) => {
          messages.push(msg);
        });

        event.broker.subscribeOnce('event', 'activity.leave', (_, msg) => {
          messages.push(msg);
        });

        event.activate();
        task.run();

        expect(messages).to.have.length(2);

        expect(messages[0].content).to.have.property('id', 'errorEvent');
        expect(messages[1].content).to.have.property('id', 'service');
      });

      it('adds attachedTo id to discardSequence when attachedTo completes', async () => {
        context.environment.addService('test', (arg, next) => {
          next();
        });

        const task = context.getActivityById('service');
        const event = context.getActivityById('errorEvent');

        let discardMessage;

        event.outbound[0].broker.subscribeOnce('event', 'flow.discard', (_, message) => {
          discardMessage = message;
        });

        const leave = event.waitFor('leave');

        event.activate();
        task.run();

        await leave;

        expect(event.counters).to.have.property('discarded', 1);

        expect(discardMessage).to.be.ok;
        expect(discardMessage.content).to.have.property('discardSequence').that.eql(['service', 'errorEvent']);
      });

      it('adds attachedTo id to discardSequence if discarded during execution', async () => {
        let executing;
        const execute = new Promise((resolve) => {
          executing = resolve;
        });

        context.environment.addService('test', () => {
          executing();
        });

        const task = context.getActivityById('service');
        const event = context.getActivityById('errorEvent');

        let discardMessage;
        event.outbound[0].broker.subscribeOnce('event', 'flow.discard', (_, message) => {
          discardMessage = message;
        });

        const leave = event.waitFor('leave');

        event.activate();
        task.run();

        await execute;
        task.discard();

        await leave;

        expect(event.counters).to.have.property('discarded', 1);

        expect(discardMessage).to.be.ok;
        expect(discardMessage.content).to.have.property('discardSequence').that.eql(['service', 'errorEvent']);
      });

      it('is discarded if attached activity is discarded', async () => {
        const task = context.getActivityById('service');
        const event = context.getActivityById('errorEvent');

        const leave = event.waitFor('leave');

        event.activate();
        task.activate();
        task.inbound[0].discard();

        await leave;

        expect(event.counters).to.have.property('discarded', 1);
      });

      it('is discarded with attached inbound discard sequence when attached is discarded', async () => {
        const task = context.getActivityById('service');
        const event = context.getActivityById('errorEvent');

        let discardMessage, taskDiscardMessage;
        task.outbound[0].broker.subscribeOnce('event', 'flow.discard', (_, message) => {
          taskDiscardMessage = message;
        });
        event.outbound[0].broker.subscribeOnce('event', 'flow.discard', (_, message) => {
          discardMessage = message;
        });

        const leave = event.waitFor('leave');

        event.activate();
        task.activate();
        task.inbound[0].discard({ discardSequence: ['hittepa-1'] });

        await leave;

        expect(event.counters).to.have.property('discarded', 1);

        expect(taskDiscardMessage).to.be.ok;
        expect(taskDiscardMessage.content).to.have.property('discardSequence').that.eql(['hittepa-1', 'start', 'service']);
        expect(discardMessage).to.be.ok;
        expect(discardMessage.content).to.have.property('discardSequence').that.eql(['hittepa-1', 'start', 'errorEvent']);
      });
    });

    describe('non-interrupting with error event definition', () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="service" implementation="\${environment.services.test}" />
          <boundaryEvent id="errorEvent" attachedToRef="service" cancelActivity="false">
            <errorEventDefinition errorRef="Error_0w1hljb" />
          </boundaryEvent>
        </process>
        <error id="Error_0w1hljb" name="ServiceError" errorCode="\${message}" />
      </definitions>`;

      let context;
      beforeEach(async () => {
        context = await testHelpers.context(source);
      });

      it('completes when error is caught and attached activity is discarded by its own error', async () => {
        context.environment.addService('test', (arg, next) => {
          next(new Error('FAIL'));
        });

        const task = context.getActivityById('service');
        const event = context.getActivityById('errorEvent');

        const leave = event.waitFor('leave');

        event.activate();
        task.run();

        await leave;

        expect(event.counters).to.have.property('taken', 1);
        expect(task.counters).to.have.property('taken', 0);
        expect(task.counters).to.have.property('discarded', 1);
      });
    });

    describe('with interrupting timer event definition', () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <serviceTask id="service" implementation="\${environment.services.test}" />
          <boundaryEvent id="timeoutEvent" attachedToRef="service">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">\${environment.variables.duration}</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
          <endEvent id="end" />
          <sequenceFlow id="flow0" sourceRef="start" targetRef="service" />
          <sequenceFlow id="flow1" sourceRef="service" targetRef="end" />
          <sequenceFlow id="flow2" sourceRef="timeoutEvent" targetRef="end" />
        </process>
      </definitions>`;

      let context;
      beforeEach(async () => {
        context = await testHelpers.context(source);
        context.environment.variables.duration = 'PT0.01S';
        context.environment.addService('test', () => {});
      });

      it('completes when timeout occur', async () => {
        const task = context.getActivityById('service');
        const event = context.getActivityById('timeoutEvent');

        const leave = event.waitFor('leave');

        event.activate();
        task.run();

        await leave;

        expect(event.counters).to.have.property('taken', 1);
        expect(task.counters).to.have.property('discarded', 1);
      });

      it('discards attached activity when timeout occur', async () => {
        const task = context.getActivityById('service');
        const event = context.getActivityById('timeoutEvent');

        const attachedLeave = task.waitFor('leave');

        event.activate();
        task.run();

        await attachedLeave;

        expect(task.counters).to.have.property('discarded', 1);
      });

      it('is discarded if attached activity completes', async () => {
        context.environment.variables.duration = 'PT2S';
        context.environment.addService('test', (arg, next) => {
          next();
        });

        const task = context.getActivityById('service');
        const event = context.getActivityById('timeoutEvent');

        const attachedLeave = task.waitFor('leave');

        event.activate();
        task.run();

        await attachedLeave;

        expect(event.counters).to.have.property('discarded', 1);
      });

      it('is discarded if attached is discarded when executing', async () => {
        context.environment.variables.duration = 'PT2S';

        let executing;
        const execute = new Promise((resolve) => {
          executing = resolve;
        });

        context.environment.addService('test', () => {
          executing();
        });

        const task = context.getActivityById('service');
        const event = context.getActivityById('timeoutEvent');

        const attachedLeave = task.waitFor('leave');

        event.activate();
        task.run();

        await execute;
        task.discard();

        await attachedLeave;

        expect(event.counters).to.have.property('discarded', 1);
      });

      it('is discarded when attached is discarded', async () => {
        const task = context.getActivityById('service');
        const event = context.getActivityById('timeoutEvent');

        const leave = event.waitFor('leave');

        event.activate();
        task.activate();
        task.inbound[0].discard();

        await leave;

        expect(event.counters).to.have.property('discarded', 1);
      });
    });

    describe('with non-interrupting timer event definition', () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <serviceTask id="service" implementation="\${environment.services.test}" />
          <boundaryEvent id="timeoutEvent" attachedToRef="service" cancelActivity="false">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">\${environment.variables.duration}</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
          <endEvent id="end" />
          <sequenceFlow id="flow0" sourceRef="start" targetRef="service" />
          <sequenceFlow id="flow1" sourceRef="service" targetRef="end" />
          <sequenceFlow id="flow2" sourceRef="timeoutEvent" targetRef="end" />
        </process>
      </definitions>`;

      let context;
      beforeEach(async () => {
        context = await testHelpers.context(source);
        context.environment.variables.duration = 'PT0.01S';
        context.environment.addService('test', () => {});
      });

      it('completes when timeout occur', async () => {
        const task = context.getActivityById('service');
        const event = context.getActivityById('timeoutEvent');

        const leave = event.waitFor('leave');

        event.activate();
        task.run();

        await leave;

        expect(event.counters).to.have.property('taken', 1);
      });

      it('leaves attached activity running when timeout occur', async () => {
        let serviceComplete;
        context.environment.addService('test', (arg, next) => {
          serviceComplete = next;
        });

        const task = context.getActivityById('service');
        const event = context.getActivityById('timeoutEvent');

        const leave = event.waitFor('leave');
        const attachedLeave = task.waitFor('leave');

        event.activate();
        task.run();

        await leave;
        serviceComplete();

        await attachedLeave;

        expect(event.counters).to.have.property('taken', 1);
        expect(event.counters).to.have.property('discarded', 0);
        expect(task.counters).to.have.property('taken', 1);
      });

      it('is discarded if attached activity completes', async () => {
        context.environment.variables.duration = 'PT2S';
        context.environment.addService('test', (arg, next) => {
          next();
        });

        const task = context.getActivityById('service');
        const event = context.getActivityById('timeoutEvent');

        const attachedLeave = task.waitFor('leave');

        event.activate();
        task.run();

        await attachedLeave;

        expect(event.counters).to.have.property('discarded', 1);
      });

      it('is discarded when attached is discarded', async () => {
        const task = context.getActivityById('service');
        const event = context.getActivityById('timeoutEvent');

        const leave = event.waitFor('leave');

        event.activate();
        task.activate();
        task.inbound[0].discard();

        await leave;

        expect(event.counters).to.have.property('discarded', 1);
      });

      it('is discarded if attached is discarded while executing', async () => {
        context.environment.variables.duration = 'PT2S';

        let executing;
        const execute = new Promise((resolve) => {
          executing = resolve;
        });

        context.environment.addService('test', () => {
          executing();
        });

        const task = context.getActivityById('service');
        const event = context.getActivityById('timeoutEvent');

        const attachedLeave = task.waitFor('leave');

        event.activate();
        task.run();

        await execute;
        task.discard();

        await attachedLeave;

        expect(event.counters).to.have.property('discarded', 1);
      });
    });

    describe('with non-interrupting conditional event definition', () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <serviceTask id="service" implementation="\${environment.services.test}" />
          <boundaryEvent id="conditionalEvent" attachedToRef="service" cancelActivity="false">
            <conditionalEventDefinition>
              <condition xsi:type="tFormalExpression">\${content.message.conditionMet}</condition>
            </conditionalEventDefinition>
          </boundaryEvent>
          <endEvent id="end" />
          <sequenceFlow id="flow0" sourceRef="start" targetRef="service" />
          <sequenceFlow id="flow1" sourceRef="service" targetRef="end" />
          <sequenceFlow id="flow2" sourceRef="conditionalEvent" targetRef="end" />
        </process>
      </definitions>`;

      let context;
      beforeEach(async () => {
        context = await testHelpers.context(source);
        context.environment.addService('test', () => {});
      });

      it('completes if condition is met', async () => {
        const task = context.getActivityById('service');
        const event = context.getActivityById('conditionalEvent');

        const leave = event.waitFor('leave');

        event.activate();
        task.run();

        event.getApi().signal({ conditionMet: true });

        await leave;

        expect(event.counters).to.have.property('taken', 1);
        expect(task.counters).to.have.property('taken', 0);
      });

      it('ignored if condition is not met', async () => {
        const task = context.getActivityById('service');
        const event = context.getActivityById('conditionalEvent');

        const condtion = event.waitFor('activity.condition');

        event.activate();
        task.run();

        event.getApi().signal({ conditionMet: false });

        await condtion;

        expect(event.counters).to.have.property('discarded', 0);
        expect(task.counters).to.have.property('taken', 0);
      });

      it('is discarded when attached is discarded', async () => {
        const task = context.getActivityById('service');
        const event = context.getActivityById('conditionalEvent');

        const leave = event.waitFor('leave');

        event.activate();
        task.activate();
        task.inbound[0].discard();

        await leave;

        expect(event.counters).to.have.property('discarded', 1);
        expect(task.counters).to.have.property('discarded', 1);
      });

      it('is discarded if attached is discarded while executing', async () => {
        let executing;
        const execute = new Promise((resolve) => {
          executing = resolve;
        });

        context.environment.addService('test', () => {
          executing();
        });

        const task = context.getActivityById('service');
        const event = context.getActivityById('conditionalEvent');

        const attachedLeave = task.waitFor('leave');

        event.activate();
        task.run();

        await execute;
        task.discard();

        await attachedLeave;

        expect(event.counters).to.have.property('discarded', 1);
        expect(task.counters).to.have.property('discarded', 1);
      });
    });

    describe('with interrupting conditional event definition', () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <serviceTask id="service" implementation="\${environment.services.test}" />
          <boundaryEvent id="conditionalEvent" attachedToRef="service" cancelActivity="true">
            <conditionalEventDefinition>
              <condition xsi:type="tFormalExpression">\${content.message.conditionMet}</condition>
            </conditionalEventDefinition>
          </boundaryEvent>
          <endEvent id="end" />
          <sequenceFlow id="flow0" sourceRef="start" targetRef="service" />
          <sequenceFlow id="flow1" sourceRef="service" targetRef="end" />
          <sequenceFlow id="flow2" sourceRef="conditionalEvent" targetRef="end" />
        </process>
      </definitions>`;

      let context;
      beforeEach(async () => {
        context = await testHelpers.context(source);
        context.environment.addService('test', () => {});
      });

      it('completes if condition is met and discard attached', async () => {
        const task = context.getActivityById('service');
        const event = context.getActivityById('conditionalEvent');

        const leave = event.waitFor('leave');

        event.activate();
        task.run();

        event.getApi().signal({ conditionMet: true });

        await leave;

        expect(event.counters).to.have.property('taken', 1);
        expect(task.counters).to.have.property('discarded', 1);
      });

      it('takes attached and discards if condition is not met', async () => {
        let serviceComplete;
        context.environment.addService('test', (arg, next) => {
          serviceComplete = next;
        });

        const task = context.getActivityById('service');
        const event = context.getActivityById('conditionalEvent');

        const leave = event.waitFor('leave');

        event.activate();
        task.run();

        serviceComplete(null, { conditionMet: false });

        await leave;

        expect(event.counters).to.have.property('discarded', 1);
        expect(task.counters).to.have.property('taken', 1);
      });

      it('is discarded if attached inbound is discarded', async () => {
        const task = context.getActivityById('service');
        const event = context.getActivityById('conditionalEvent');

        const leave = event.waitFor('leave');

        event.activate();
        task.activate();
        task.inbound[0].discard();

        await leave;

        expect(event.counters).to.have.property('discarded', 1);
      });

      it('is discarded if attached is discarded while executing', async () => {
        let executing;
        const execute = new Promise((resolve) => {
          executing = resolve;
        });

        context.environment.addService('test', () => {
          executing();
        });

        const task = context.getActivityById('service');
        const event = context.getActivityById('conditionalEvent');

        const attachedLeave = task.waitFor('leave');

        event.activate();
        task.run();

        await execute;
        task.discard();

        await attachedLeave;

        expect(event.counters).to.have.property('discarded', 1);
      });
    });
  });
});
