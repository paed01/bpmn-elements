import Environment from '../../src/Environment';
import SignalEventDefinition from '../../src/eventDefinitions/SignalEventDefinition';
import testHelpers from '../helpers/testHelpers';
import Signal from '../../src/activity/Signal';
import {ActivityBroker} from '../../src/EventBroker';
import {Logger} from '../helpers/testHelpers';

describe('SignalEventDefinition', () => {
  let event;
  beforeEach(() => {
    event = {
      id: 'event',
      environment: Environment({Logger}),
      broker: ActivityBroker(this).broker,
      getActivityById(id) {
        if (id !== 'Signal_0') return;
        return Signal({id}, testHelpers.emptyContext());
      }
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

    it('completes and clears listeners if event is a start event and signaled before execution', () => {
      const catchSignal = SignalEventDefinition({...event, isStart: true}, {
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

    it('publishes signal with input from execution message', () => {
      event.isThrowing = true;

      const definition = SignalEventDefinition(event, {
        type: 'bpmn:SignalEventDefinition',
        behaviour: {
          signalRef: {
            id: 'Signal_0',
          }
        }
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.signal', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          input: {
            myMessage: 1,
          },
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
      expect(messages[0].content).to.have.property('message').that.deep.include({
        id: 'Signal_0',
        type: 'Signal',
        myMessage: 1,
      });
    });

    it('without signal reference publishes anonymous message', () => {
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
      expect(messages[0].fields).to.have.property('routingKey', 'activity.signal');
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content.parent).to.have.property('id', 'theProcess');
      expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');

      expect(messages[0].content.message).to.not.have.property('id');
      expect(messages[0].content.message).to.have.property('name', 'anonymous');
    });

    it('with unknown signal reference publishes message with unknown signal id', () => {
      event.isThrowing = true;

      const definition = SignalEventDefinition(event, {
        type: 'bpmn:SignalEventDefinition',
        behaviour: {
          signalRef: {
            id: 'Unknown_Signal',
          }
        },
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.signal', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          id: 'event_1',
          executionId: 'event_1_0',
          index: 0,
          input: {
            myMessage: 1,
          },
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

      expect(messages[0].content).to.have.property('message').that.deep.include({
        id: 'Unknown_Signal',
        myMessage: 1,
      });
    });
  });
});
