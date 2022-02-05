import Environment from '../../src/Environment';
import CompensateEventDefinition from '../../src/eventDefinitions/CompensateEventDefinition';
import testHelpers from '../helpers/testHelpers';
import Signal from '../../src/activity/Signal';
import {ActivityBroker} from '../../src/EventBroker';
import {Logger} from '../helpers/testHelpers';

describe('CompensateEventDefinition', () => {
  let event, context;
  beforeEach(() => {
    event = {
      id: 'event',
      environment: new Environment({Logger}),
      broker: ActivityBroker(this).broker,
      getActivityById(id) {
        if (id !== 'Signal_0') return;
        return Signal({id}, testHelpers.emptyContext());
      }
    };
    context = {
      getOutboundAssociations() {},
    };
  });

  describe('catching', () => {
    it('publishes detach execution message on parent broker', () => {
      const catchSignal = new CompensateEventDefinition(event, {
        type: 'bpmn:CompensateEventDefinition',
      }, context);
      expect(catchSignal.executionId, 'executionId').to.be.undefined;


      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      catchSignal.execute({
        fields: {},
        content: {
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
      expect(messages[0].fields).to.have.property('routingKey', 'execute.detach');
      expect(messages[0].content).to.have.property('executionId', 'event_1_0');
      expect(messages[0].content.parent).to.have.property('id', 'event');
      expect(messages[0].content.parent).to.have.property('executionId', 'event_1');
    });

    it('publishes activity detach event on parent broker', () => {
      const catchSignal = new CompensateEventDefinition(event, {
        type: 'bpmn:CompensateEventDefinition',
      }, context);

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
      expect(messages[0].fields).to.have.property('routingKey', 'activity.detach');
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content.parent).to.have.property('id', 'theProcess');
      expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');
    });

    it('starts collecting if compensate event appears before execution', () => {
      const catchSignal = new CompensateEventDefinition({...event, isStart: true}, {
        type: 'bpmn:CompensateEventDefinition',
      }, context);

      event.broker.publish('api', 'activity.compensate.event_1', {});

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.detach', (_, msg) => {
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

      expect(event.broker).to.have.property('consumerCount', 1);
    });

    it('completes if compensate api message is sent on activity detach', () => {
      const catchSignal = new CompensateEventDefinition({...event, isStart: true}, {
        type: 'bpmn:CompensateEventDefinition',
      }, context);

      event.broker.subscribeOnce('event', 'activity.detach', () => {
        event.broker.publish('api', 'activity.sometype.event_1_0', {}, {type: 'compensate'});
      }, {noAck: true, consumerTag: '_test-tag-1'});

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.detach', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag-2'});

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

      event.broker.cancel('_test-tag-1');
      event.broker.cancel('_test-tag-2');

      expect(event.broker).to.have.property('consumerCount', 1);
    });

    it('completes and clears listeners if discarded', () => {
      const catchSignal = new CompensateEventDefinition(event, {
        type: 'bpmn:CompensateEventDefinition',
      }, context);

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
      const catchSignal = new CompensateEventDefinition(event, {
        type: 'bpmn:CompensateEventDefinition',
      }, context);

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

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('starts collecting if called with api message type compensate', () => {
      const definition = new CompensateEventDefinition(event, {
        type: 'bpmn:CompensateEventDefinition',
      }, context);

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
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

      event.broker.publish('api', 'activity.sometype.event_1_0', {}, {type: 'compensate'});

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'execute.detach');
      expect(messages[0].content).to.have.property('executionId', 'event_1_0');
      expect(messages[0].content.parent).to.have.property('id', 'event');
      expect(messages[0].content.parent).to.have.property('executionId', 'event_1');
    });

    it('starts collecting once if called with api message type compensate twice', () => {
      const definition = new CompensateEventDefinition(event, {
        type: 'bpmn:CompensateEventDefinition',
      }, context);

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
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

      event.broker.publish('api', 'activity.sometype.event_1_0', {}, {type: 'compensate'});
      event.broker.publish('api', 'activity.sometype.event_1_0', {}, {type: 'compensate'});

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'execute.detach');
      expect(messages[0].content).to.have.property('executionId', 'event_1_0');
      expect(messages[0].content.parent).to.have.property('id', 'event');
      expect(messages[0].content.parent).to.have.property('executionId', 'event_1');
    });
  });

  describe('throwing', () => {
    it('publishes compensate event on parent broker', () => {
      event.isThrowing = true;

      const definition = new CompensateEventDefinition(event, {
        type: 'bpmn:CompensateEventDefinition',
      }, context);

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
      expect(messages[0].fields).to.have.property('routingKey', 'activity.compensate');
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content.parent).to.have.property('id', 'theProcess');
      expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');
    });
  });
});
