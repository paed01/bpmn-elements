import CancelEventDefinition from '../../src/eventDefinitions/CancelEventDefinition';
import Environment from '../../src/Environment';
import {ActivityBroker} from '../../src/EventBroker';
import {Logger} from '../helpers/testHelpers';

describe('CancelEventDefinition', () => {
  describe('catching bound event', () => {
    let event;
    beforeEach(() => {
      const environment = new Environment({Logger});
      event = {
        id: 'event',
        environment,
        broker: ActivityBroker(this).broker,
      };
    });

    it('expects cancel with canceled routing key', () => {
      const catchEvent = new CancelEventDefinition(event, {
        type: 'bpmn:CancelEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.expect', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      catchEvent.execute({
        fields: {},
        content: {
          id: 'event_1',
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event_1',
            executionId: 'event_1',
            path: [{
              id: 'transaction',
              executionId: 'transaction_0'
            }]
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].content).to.have.property('executionId', 'event_1_0');
      expect(messages[0].content).to.have.property('exchangeKey', 'execute.canceled.event_1_0');
    });

    it('completes when cancel routing key is published', () => {
      const catchEvent = new CancelEventDefinition(event, {
        type: 'bpmn:CancelEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      catchEvent.execute({
        fields: {},
        content: {
          id: 'event_1',
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event_1',
            executionId: 'event_1',
            path: [{
              id: 'transaction',
              executionId: 'transaction_0'
            }]
          },
        },
      });

      event.broker.publish('execution', 'execute.canceled.event_1_0', {});

      expect(messages).to.have.length(1);
      expect(messages[0].content).to.have.property('executionId', 'event_1_0');
    });

    it('publish compensate event if cancel emanates from a transaction', () => {
      const catchEvent = new CancelEventDefinition(event, {
        type: 'bpmn:CancelEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.compensate', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      catchEvent.execute({
        fields: {},
        content: {
          id: 'event_1',
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event_1',
            executionId: 'event_1',
            path: [{
              id: 'transaction',
              executionId: 'transaction_0'
            }]
          },
        },
      });

      event.broker.publish('execution', 'execute.canceled.event_1_0', {id: 'atomic', isTransaction: true});

      expect(messages).to.have.length(1);
      expect(messages[0].content).to.have.property('id', 'atomic');
    });

    it('detaches if cancel emanates from a transaction and creates cancel exchange', () => {
      const catchEvent = new CancelEventDefinition(event, {
        type: 'bpmn:CancelEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.detach', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      catchEvent.execute({
        fields: {},
        content: {
          id: 'event_1',
          executionId: 'event_1_0',
          attachedTo: 'atomic',
          index: 0,
          parent: {
            id: 'event_1',
            executionId: 'event_1',
            path: [{
              id: 'transaction',
              executionId: 'transaction_0'
            }]
          },
        },
      });

      event.broker.publish('execution', 'execute.canceled.event_1_0', {id: 'atomic', isTransaction: true});

      expect(messages).to.have.length(1);
      expect(messages[0].content).to.have.property('id', 'event_1');

      expect(event.broker.getExchange('cancel')).to.be.ok;
    });

    it('completes when bound event detects that transaction is complete', () => {
      const catchEvent = new CancelEventDefinition(event, {
        type: 'bpmn:CancelEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

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
            path: [{
              id: 'transaction',
              executionId: 'transaction_0'
            }]
          },
        },
      });

      event.broker.publish('execution', 'execute.canceled.event_1_0', {id: 'atomic', isTransaction: true});
      event.broker.publish('cancel', 'activity.leave', {id: 'atomic'});

      expect(messages).to.have.length(1);
      expect(messages[0].content).to.have.property('id', 'event_1');
    });

    it('ignores leave message if not matching attachedTo', () => {
      const catchEvent = new CancelEventDefinition(event, {
        type: 'bpmn:CancelEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

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
            path: [{
              id: 'transaction',
              executionId: 'transaction_0'
            }]
          },
        },
      });

      event.broker.publish('execution', 'execute.canceled.event_1_0', {id: 'atomic', isTransaction: true});
      event.broker.publish('cancel', 'activity.leave', {id: 'end'});

      expect(messages).to.have.length(0);
    });

    it('completes and clears listeners when transaction is complete', () => {
      const catchEvent = new CancelEventDefinition(event, {
        type: 'bpmn:CancelEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag-1'});

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
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.publish('execution', 'execute.canceled.event_1_0', {id: 'atomic', isTransaction: true});
      event.broker.publish('cancel', 'activity.leave', {id: 'atomic'});

      event.broker.cancel('_test-tag-1');

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
            id: 'event_1',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.publish('execution', 'execute.canceled.event_1_0', {id: 'atomic', isTransaction: true});
      event.broker.publish('api', 'activity.stop.event_1_0', {}, {type: 'stop'});

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
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.publish('execution', 'execute.canceled.event_1_0', {id: 'atomic', isTransaction: true});
      event.broker.publish('api', 'activity.stop.event_1', {}, {type: 'stop'});

      expect(event.broker).to.have.property('consumerCount', 0);
    });
  });

  describe('throwing', () => {
    let event;
    beforeEach(() => {
      const environment = new Environment({Logger});
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
      event.broker.subscribeTmp('event', 'activity.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          id: 'event_1',
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
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
