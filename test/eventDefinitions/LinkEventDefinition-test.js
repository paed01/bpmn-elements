import LinkEventDefinition from '../../src/eventDefinitions/LinkEventDefinition.js';
import Environment from '../../src/Environment.js';
import { ActivityBroker } from '../../src/EventBroker.js';
import { Logger } from '../helpers/testHelpers.js';

describe('LinkEventDefinition', () => {
  let event;
  beforeEach(() => {
    event = {
      id: 'event',
      environment: new Environment({ Logger }),
      broker: ActivityBroker(this).broker,
    };
  });

  describe('catching', () => {
    it('publishes wait event on parent broker', () => {
      const catchSignal = new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      const messages = [];
      event.broker.subscribeTmp(
        'event',
        'activity.*',
        (_, msg) => {
          messages.push(msg);
        },
        { noAck: true }
      );

      catchSignal.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [
              {
                id: 'theProcess',
                executionId: 'theProcess_0',
              },
            ],
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.wait');
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content.parent).to.have.property('id', 'theProcess');
      expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');
    });

    it('completes and clears listeners when signal is caught', () => {
      const catchSignal = new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      const messages = [];
      event.broker.subscribeTmp(
        'execution',
        'execute.completed',
        (_, msg) => {
          messages.push(msg);
        },
        { noAck: true, consumerTag: '_test-tag' }
      );

      catchSignal.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [
              {
                id: 'theProcess',
                executionId: 'theProcess_0',
              },
            ],
          },
        },
      });

      event.broker.publish('api', 'activity.link.event_1', { message: { linkName: 'LINKA' } });
      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes and clears listeners if signaled before execution', () => {
      const catchSignal = new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      event.broker.publish('api', 'activity.link.event_1', { message: { linkName: 'LINKA' } });

      const messages = [];
      event.broker.subscribeTmp(
        'execution',
        'execute.completed',
        (_, msg) => {
          messages.push(msg);
        },
        { noAck: true, consumerTag: '_test-tag' }
      );

      catchSignal.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [
              {
                id: 'theProcess',
                executionId: 'theProcess_0',
              },
            ],
          },
        },
      });

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes and clears listeners if discarded', () => {
      const catchSignal = new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      const messages = [];
      event.broker.subscribeTmp(
        'execution',
        'execute.discard',
        (_, msg) => {
          messages.push(msg);
        },
        { noAck: true, consumerTag: '_test-tag' }
      );

      catchSignal.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [
              {
                id: 'theProcess',
                executionId: 'theProcess_0',
              },
            ],
          },
        },
      });

      event.broker.publish('api', 'activity.discard.event_1_0', {}, { type: 'discard' });

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('stops and clears listeners if stopped', () => {
      const catchSignal = new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      const messages = [];
      event.broker.subscribeTmp(
        'execution',
        'execute.#',
        (_, msg) => {
          messages.push(msg);
        },
        { noAck: true, consumerTag: '_test-tag' }
      );

      catchSignal.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [
              {
                id: 'theProcess',
                executionId: 'theProcess_0',
              },
            ],
          },
        },
      });

      event.broker.publish('api', 'activity.stop.event_1_0', {}, { type: 'stop' });

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(0);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('ignores link message on link name mismatch', () => {
      const catchSignal = new LinkEventDefinition(event, {
        behaviour: { name: 'LINKA' },
      });

      const messages = [];
      event.broker.subscribeTmp(
        'execution',
        'execute.completed',
        (_, msg) => {
          messages.push(msg);
        },
        { noAck: true, consumerTag: '_test-tag' }
      );

      catchSignal.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [
              {
                id: 'theProcess',
                executionId: 'theProcess_0',
              },
            ],
          },
        },
      });

      event.broker.cancel('_test-tag');

      event.broker.publish('api', 'activity.link.event_1', { message: { linkName: 'LINKB' } });

      expect(messages).to.have.length(0);

      expect(event.broker).to.have.property('consumerCount').that.is.above(1);
    });
  });

  describe('throwing', () => {
    it('publishes signal event on parent broker', () => {
      event.isThrowing = true;

      const definition = new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      const messages = [];
      event.broker.subscribeTmp(
        'event',
        'activity.link',
        (_, msg) => {
          messages.push(msg);
        },
        { noAck: true }
      );

      definition.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'intermediate',
            executionId: 'event_1',
            path: [
              {
                id: 'theProcess',
                executionId: 'theProcess_0',
              },
            ],
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.link');
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content.parent).to.have.property('id', 'theProcess');
      expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');
    });

    it('publishes signal discard event on parent broker if parent is discarded', () => {
      event.isThrowing = true;

      new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      const messages = [];
      event.broker.subscribeTmp(
        'event',
        'activity.link.discard',
        (_, msg) => {
          messages.push(msg);
        },
        { noAck: true, consumerTag: '_test-tag' }
      );

      event.broker.publish('event', 'activity.discard', {
        executionId: 'event_1',
        parent: {
          id: 'theProcess',
          executionId: 'theProcess_0',
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content).to.have.property('state', 'discard');
      expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');

      event.broker.cancel('_test-tag');
      expect(event.broker, 'discard consumer only').to.have.property('consumerCount', 1);
    });
  });
});
