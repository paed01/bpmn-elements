import Environment from '../../src/Environment.js';
import Escalation from '../../src/activity/Escalation.js';
import EscalationEventDefinition from '../../src/eventDefinitions/EscalationEventDefinition.js';
import {ActivityBroker} from '../../src/EventBroker.js';
import {Logger} from '../helpers/testHelpers.js';

describe('EscalationEventDefinition', () => {
  let event;
  beforeEach(() => {
    event = {
      id: 'event',
      environment: new Environment({Logger}),
      broker: ActivityBroker(this).broker,
    };
  });

  describe('catching', () => {
    it('publishes wait event on parent broker', () => {
      const catchSignal = new EscalationEventDefinition(event, {
        type: 'bpmn:EscalationEventDefinition',
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
              executionId: 'theProcess_0',
            }],
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.wait');
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content.parent).to.have.property('id', 'theProcess');
      expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');
    });

    it('completes and clears listeners when escalation is caught', () => {
      const catchSignal = new EscalationEventDefinition(event, {
        type: 'bpmn:EscalationEventDefinition',
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
              executionId: 'theProcess_0',
            }],
          },
        },
      });

      event.broker.publish('api', 'activity.escalate.event_1', {});
      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes and clears listeners if escalated before execution', () => {
      const catchSignal = new EscalationEventDefinition(event, {
        type: 'bpmn:EscalationEventDefinition',
      });

      event.broker.publish('api', 'activity.escalate.event_1', {});

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
              executionId: 'theProcess_0',
            }],
          },
        },
      });

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes on escalate message element id match', () => {
      const catchSignal = new EscalationEventDefinition({
        ...event,
        getActivityById() {
          return new Escalation({
            id: 'Escalate_0',
            name: 'Awake King',
          }, {environment: new Environment()});
        },
      }, {
        type: 'bpmn:EscalationEventDefinition',
        behaviour: {
          escalationRef: {
            id: 'Escalate_0',
          },
        },
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
              executionId: 'theProcess_0',
            }],
          },
        },
      });

      event.broker.publish('api', 'activity.escalate.event_1', {
        message: {
          id: 'Escalate_0',
        },
      });

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('ignores api message if escalate message element id mismatch', () => {
      const catchSignal = new EscalationEventDefinition({
        ...event,
        getActivityById() {
          return new Escalation({
            id: 'Escalate_0',
            name: 'Awake King',
          }, {environment: new Environment()});
        },
      }, {
        type: 'bpmn:EscalationEventDefinition',
        behaviour: {
          escalationRef: {
            id: 'Escalate_0',
          },
        },
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      event.broker.publish('api', 'activity.escalate.event_1', {
        message: {
          id: 'Escalate_1',
        },
      });

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
              executionId: 'theProcess_0',
            }],
          },
        },
      });

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(0);

      expect(event.broker).to.have.property('consumerCount').that.is.above(1);
    });

    it('completes and clears listeners if discarded', () => {
      const catchSignal = new EscalationEventDefinition(event, {
        type: 'bpmn:EscalationEventDefinition',
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
              executionId: 'theProcess_0',
            }],
          },
        },
      });

      event.broker.publish('api', 'activity.discard.event_1_0', {}, {type: 'discard'});

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('stops and clears listeners if stopped', () => {
      const catchSignal = new EscalationEventDefinition(event, {
        type: 'bpmn:EscalationEventDefinition',
      });

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
              executionId: 'theProcess_0',
            }],
          },
        },
      });

      event.broker.publish('api', 'activity.stop.event_1_0', {}, {type: 'stop'});

      event.broker.cancel('_test-tag');

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes if called with api message type escalate', () => {
      const definition = new EscalationEventDefinition(event, {
        type: 'bpmn:EscalationEventDefinition',
      });

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
              executionId: 'theProcess_0',
            }],
          },
        },
      });

      event.broker.publish('api', 'activity.sometype.event_1_0', {}, {type: 'escalate'});

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'execute.completed');
      expect(messages[0].content).to.have.property('executionId', 'event_1_0');
      expect(messages[0].content.parent).to.have.property('id', 'event');
      expect(messages[0].content.parent).to.have.property('executionId', 'event_1');
    });
  });

  describe('throwing', () => {
    it('publishes escalation event on parent broker', () => {
      event.isThrowing = true;

      const definition = new EscalationEventDefinition(event, {
        type: 'bpmn:EscalationEventDefinition',
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
              executionId: 'theProcess_0',
            }],
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.escalate');
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content.parent).to.have.property('id', 'theProcess');
      expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');
    });
  });
});
