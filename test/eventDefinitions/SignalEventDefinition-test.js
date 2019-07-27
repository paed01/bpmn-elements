import SignalEventDefinition from '../../src/eventDefinitions/SignalEventDefinition';
import Environment from '../../src/Environment';
import {ActivityBroker} from '../../src/EventBroker';
import {Logger} from '../helpers/testHelpers';

describe('SignalEventDefinition', () => {
  let event;
  beforeEach(() => {
    event = {
      id: 'event',
      environment: Environment({Logger}),
      broker: ActivityBroker(this).broker,
    };
  });

  describe('catching', () => {
    it('publishes wait event on parent broker', () => {
      const catchSignal = SignalEventDefinition(event, {
        type: 'bpmn:SignalEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      catchSignal.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
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
      const catchSignal = SignalEventDefinition(event, {
        type: 'bpmn:SignalEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      catchSignal.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.publish('api', 'activity.signal.event_1', {});
      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes and clears listeners if signaled before execution', () => {
      const catchSignal = SignalEventDefinition(event, {
        type: 'bpmn:SignalEventDefinition',
      });

      event.broker.publish('api', 'activity.signal.event_1', {});

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      catchSignal.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes and clears listeners if discarded', () => {
      const catchSignal = SignalEventDefinition(event, {
        type: 'bpmn:SignalEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.discard', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      catchSignal.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.publish('api', 'activity.discard.event_1_0', {}, {type: 'discard'});

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('stops and clears listeners if stopped', () => {
      const catchSignal = SignalEventDefinition(event, {
        type: 'bpmn:SignalEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      catchSignal.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.publish('api', 'activity.stop.event_1_0', {}, {type: 'stop'});

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(0);

      expect(event.broker).to.have.property('consumerCount', 0);
    });
  });

  describe('throwing', () => {
    it('publishes signal event on parent broker', () => {
      event.isThrowing = true;

      const definition = SignalEventDefinition(event, {
        type: 'bpmn:SignalEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'intermediate',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.signal');
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content.parent).to.have.property('id', 'theProcess');
      expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');
    });
  });
});
