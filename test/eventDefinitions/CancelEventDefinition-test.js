import CancelEventDefinition from '../../src/eventDefinitions/CancelEventDefinition.js';
import Environment from '../../src/Environment.js';
import { ActivityBroker } from '../../src/EventBroker.js';
import { Logger } from '../helpers/testHelpers.js';

describe('CancelEventDefinition', () => {
  describe('catching bound event', () => {
    let event;
    beforeEach(() => {
      const environment = new Environment({ Logger });
      event = {
        id: 'event',
        environment,
        broker: ActivityBroker(this).broker,
      };
    });

    it('publishes wait event on parent broker', () => {
      const catchEvent = new CancelEventDefinition(event, {
        type: 'bpmn:CancelEventDefinition',
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

      catchEvent.execute({
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

    it('expects cancel with cancelled routing key', () => {
      const catchEvent = new CancelEventDefinition(event, {
        type: 'bpmn:CancelEventDefinition',
      });
      expect(catchEvent.executionId, 'executionId').to.be.undefined;

      const messages = [];
      event.broker.subscribeTmp(
        'event',
        'activity.wait',
        (_, msg) => {
          messages.push(msg);
        },
        { noAck: true }
      );

      catchEvent.execute({
        fields: {},
        content: {
          id: 'event_1',
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event_1',
            executionId: 'event_1',
            path: [
              {
                id: 'transaction',
                executionId: 'transaction_0',
              },
            ],
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content).to.have.property('expect', 'cancel');
    });

    it('completes when attached to activity is cancelled', () => {
      const catchEvent = new CancelEventDefinition(event, {
        type: 'bpmn:CancelEventDefinition',
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

      catchEvent.execute({
        fields: {},
        content: {
          id: 'event_1',
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event_1',
            executionId: 'event_1',
            path: [
              {
                id: 'transaction',
                executionId: 'transaction_0',
              },
            ],
          },
        },
      });

      event.broker.publish('execution', 'execute.cancelled.event_1_0', {});

      expect(messages).to.have.length(1);
      expect(messages[0].content).to.have.property('executionId', 'event_1_0');

      event.broker.cancel('_test-tag');
      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes and clears listeners if stopped by api', () => {
      const catchEvent = new CancelEventDefinition(event, {
        type: 'bpmn:CancelEventDefinition',
      });

      catchEvent.execute({
        fields: {},
        content: {
          id: 'event_1',
          attachedTo: 'atomic',
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event',
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

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes and clears listeners if parent is stopped by api', () => {
      const catchEvent = new CancelEventDefinition(event, {
        type: 'bpmn:CancelEventDefinition',
      });

      catchEvent.execute({
        fields: {},
        content: {
          id: 'event_1',
          attachedTo: 'atomic',
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event_1',
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

      event.broker.publish('execution', 'execute.cancelled.event_1_0', { id: 'atomic', isTransaction: true });
      event.broker.publish('api', 'activity.stop.event_1', {}, { type: 'stop' });

      expect(event.broker).to.have.property('consumerCount', 0);
    });
  });

  describe('throwing', () => {
    let event;
    beforeEach(() => {
      const environment = new Environment({ Logger });
      event = {
        id: 'event',
        type: 'endevent',
        environment,
        broker: ActivityBroker(this).broker,
      };
    });

    it('publishes Cancel event on parent broker with resolved message', () => {
      event.isThrowing = true;

      const definition = new CancelEventDefinition(event, {
        type: 'bpmn:CancelEventDefinition',
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

      definition.execute({
        fields: {},
        content: {
          id: 'event_1',
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event',
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
      expect(messages[0].fields).to.have.property('routingKey', 'activity.cancel');
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content.parent).to.have.property('id', 'theProcess');
      expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');
    });
  });
});
