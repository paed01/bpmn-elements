import Association from '../../src/flows/Association.js';
import BoundaryEvent from '../../src/events/BoundaryEvent.js';
import CompensateEventDefinition from '../../src/eventDefinitions/CompensateEventDefinition.js';
import IntermediateThrowEvent from '../../src/events/IntermediateThrowEvent.js';
import Task from '../../src/tasks/Task.js';
import testHelpers from '../helpers/testHelpers.js';

describe('CompensateEventDefinition', () => {
  describe('catching', () => {
    let event, definition, context;
    beforeEach(() => {
      context = testHelpers.emptyContext({
        getActivityById(id) {
          return {
            id,
            ...(id === 'event' ? {
              type: 'boundaryevent',
              Behaviour: BoundaryEvent,
              behaviour: {
                attachedTo: {id: 'task'},
                eventDefinitions: [{
                  type: 'compensateeventdefinition',
                  Behaviour: CompensateEventDefinition,
                }],
              },
            } : {
              type: 'task',
              Behaviour: Task,
            }),
          };
        },
        getOutboundAssociations() {
          return [{
            id: 'assoc',
            parent: { id: 'Bp_1' },
            sourceId: 'event',
            targetId: 'service',
            Behaviour: Association,
          }];
        },
      });
      event = context.getActivityById('event');
      definition = event.eventDefinitions[0];
    });

    it('catches compensate api message, completes and clears listeners', () => {
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

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '__test-subscr'});

      event.broker.publish('api', 'activity.sometype.event_1_0', {}, {type: 'compensate'});

      expect(messages).to.have.length(1);

      expect(messages[0].fields).to.have.property('routingKey', 'execute.completed');
      expect(messages[0].content).to.have.property('executionId', 'event_1_0');
      expect(messages[0].content.parent).to.have.property('id', 'event');
      expect(messages[0].content.parent).to.have.property('executionId', 'event_1');

      event.broker.cancel('__test-subscr');

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('catches parent compensate api message, completes and clears listeners', () => {
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

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '__test-subscr'});

      event.broker.publish('api', 'activity.sometype.event_1', {}, {type: 'compensate'});

      expect(messages).to.have.length(1);

      expect(messages[0].fields).to.have.property('routingKey', 'execute.completed');
      expect(messages[0].content).to.have.property('executionId', 'event_1_0');
      expect(messages[0].content.parent).to.have.property('id', 'event');
      expect(messages[0].content.parent).to.have.property('executionId', 'event_1');

      event.broker.cancel('__test-subscr');

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('takes outbound associations and completes on compensate', () => {
      const [association] = event.context.getOutboundAssociations('event');

      const messages = [];
      association.broker.subscribeTmp('event', '#', (_, msg) => messages.push(msg), {noAck: true});
      event.broker.subscribeTmp('execution', 'execute.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '__test-subscr'});

      event.run();

      event.attachedTo.broker.publish('execution', 'execute.completed', {id: 'task', executionId: 'task_0'});
      event.broker.publish('api', 'activity.compensate.event_0', {}, {type: 'compensate'});

      expect(messages).to.have.length(7);

      let message = messages.pop();
      expect(message.fields, 'event complete').to.have.property('routingKey', 'execute.completed');
      expect(message.content, 'event complete').to.have.property('isRootScope', true);

      message = messages.pop();
      expect(message.fields, 'compensate complete').to.have.property('routingKey', 'execute.completed');
      expect(message.content, 'compensate complete').to.have.property('isDefinitionScope', true);

      message = messages.pop();
      expect(message.fields, 'association take').to.have.property('routingKey', 'association.take');

      event.broker.cancel('__test-subscr');
      event.stop();

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('takes outbound associations as many times as attached task has completed', () => {
      const [association] = event.context.getOutboundAssociations('event');

      const messages = [];
      association.broker.subscribeTmp('event', '#', (_, msg) => messages.push(msg), {noAck: true});

      event.run();

      event.attachedTo.broker.publish('execution', 'execute.completed', {id: 'task', executionId: 'task_0'});
      event.attachedTo.broker.publish('execution', 'execute.completed', {id: 'task', executionId: 'task_1'});

      event.broker.publish('api', 'activity.compensate.event_0', {}, {type: 'compensate'});

      expect(messages).to.have.length(2);

      let message = messages.shift();
      expect(message.fields, 'association take').to.have.property('routingKey', 'association.take');
      expect(message.content.message.content, 'first take').to.have.property('executionId', 'task_0');

      message = messages.shift();
      expect(message.fields, 'association take').to.have.property('routingKey', 'association.take');
      expect(message.content.message.content, 'first take').to.have.property('executionId', 'task_1');
    });

    it('takes outbound associations as many times as attached task has completed and errored', () => {
      const [association] = event.context.getOutboundAssociations('event');

      const messages = [];
      association.broker.subscribeTmp('event', '#', (_, msg) => messages.push(msg), {noAck: true});

      event.run();

      event.attachedTo.broker.publish('execution', 'execute.error', {id: 'task', executionId: 'task_0'});
      event.attachedTo.broker.publish('execution', 'execute.completed', {id: 'task', executionId: 'task_1'});

      event.broker.publish('api', 'activity.compensate.event_0', {}, {type: 'compensate'});

      expect(messages).to.have.length(2);

      let message = messages.shift();
      expect(message.fields, 'first take').to.have.property('routingKey', 'association.take');
      expect(message.content.message.fields, 'first take').to.have.property('routingKey', 'execute.error');
      expect(message.content.message.content, 'first take').to.have.property('executionId', 'task_0');

      message = messages.shift();
      expect(message.fields, 'second take').to.have.property('routingKey', 'association.take');
      expect(message.content.message.fields, 'first take').to.have.property('routingKey', 'execute.completed');
      expect(message.content.message.content, 'second take').to.have.property('executionId', 'task_1');
    });

    it('ignores compensated task messages on compensated', () => {
      const [association] = event.context.getOutboundAssociations('event');

      const messages = [];
      association.broker.subscribeTmp('event', '#', (_, msg) => messages.push(msg), {noAck: true});
      event.run();

      event.attachedTo.broker.publish('execution', 'execute.completed', {id: 'task', executionId: 'task_0'});

      event.broker.publish('api', 'activity.compensate.event_0', {}, {type: 'compensate'});

      event.attachedTo.broker.publish('execution', 'execute.completed', {id: 'task', executionId: 'task_0'});

      expect(messages).to.have.length(1);

      event.broker.cancel('__test-subscr');
    });

    it('publishes detach execution message on parent broker when executed', () => {
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

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'execute.detach');
      expect(messages[0].content).to.have.property('executionId', 'event_1_0');
      expect(messages[0].content.parent).to.have.property('id', 'event');
      expect(messages[0].content.parent).to.have.property('executionId', 'event_1');
    });

    it('publishes activity detach event on parent broker', () => {
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
      expect(messages[0].fields).to.have.property('routingKey', 'activity.detach');
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content.parent).to.have.property('id', 'theProcess');
      expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');
    });

    it('completes if compensate api message appears before execution', () => {
      event.broker.publish('api', 'activity.compensate.event_1', {});

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      definition.execute({
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
      expect(messages[0].fields).to.have.property('routingKey', 'execute.completed');
      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes if compensate api message is sent on activity detach', () => {
      event.broker.subscribeOnce('event', 'activity.detach', () => {
        event.broker.publish('api', 'activity.sometype.event_1_0', {}, {type: 'compensate'});
      }, {noAck: true, consumerTag: '_test-tag-1'});

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.detach', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag-2'});

      definition.execute({
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

      event.broker.cancel('_test-tag-1');
      event.broker.cancel('_test-tag-2');

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes once on double compensate api messages', () => {
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

      event.broker.publish('api', 'activity.sometype.event_1_0', {}, {type: 'compensate'});
      event.broker.publish('api', 'activity.sometype.event_1_0', {}, {type: 'compensate'});

      expect(messages).to.have.length(2);
      expect(messages[0].fields).to.have.property('routingKey', 'execute.detach');
      expect(messages[1].fields).to.have.property('routingKey', 'execute.completed');
    });

    it('completes and clears listeners if discarded', () => {
      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.discard', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      definition.execute({
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

    it('stops and clears definition listeners if stopped', () => {
      definition.execute({
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

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('stops and clears event listeners if stopped', () => {
      event.run();

      event.broker.publish('api', 'activity.stop.' + event.executionId, {}, {type: 'stop'});

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('resumed boundary event sends detach event again', () => {
      event.run();
      event.stop();

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.detach', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      event.resume();

      expect(messages).to.have.length(1);
    });

    it('recovered and resumed boundary event sends detach event again', () => {
      event.run();
      event.stop();

      const state = event.getState();
      const recoveredEvent = context.clone().getActivityById('event');
      recoveredEvent.recover(state);

      const messages = [];
      recoveredEvent.broker.subscribeTmp('event', 'activity.detach', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      recoveredEvent.resume();

      expect(messages).to.have.length(1);
    });

    it('recovered and resumed compensate boundary event keeps attached target messages', () => {
      event.run();

      event.attachedTo.broker.publish('execution', 'execute.completed', {id: 'task', executionId: 'task_0'});

      event.stop();

      const state = event.getState();
      const recoveredEvent = context.clone().getActivityById('event');
      recoveredEvent.recover(state);

      const [association] = recoveredEvent.context.getOutboundAssociations('event');
      const messages = [];
      association.broker.subscribeTmp('event', '#', (_, msg) => messages.push(msg), {noAck: true});

      recoveredEvent.resume();

      recoveredEvent.broker.publish('api', 'transaction.compensate.1', {});

      expect(messages).to.have.length(1);
      const message = messages.pop();
      expect(message.content.message.content).to.have.property('executionId', 'task_0');
    });

    it('multiple attached runs only starts compensate boundary event once', () => {
      const messages = [];
      event.broker.subscribeTmp('event', 'activity.detach', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      event.activate();

      const attached = event.attachedTo;
      attached.run();
      attached.run();

      expect(event.broker.getQueue('compensate-q').messageCount).to.equal(2);
      expect(messages).to.have.length(1);
    });

    it('attached discarded is ignored', () => {
      const messages = [];
      event.broker.subscribeTmp('event', 'activity.detach', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      event.activate();

      const attached = event.attachedTo;
      attached.run();
      attached.discard();
      attached.run();

      expect(event.broker.getQueue('compensate-q').messageCount).to.equal(2);
      expect(messages).to.have.length(1);
    });
  });

  describe('throwing', () => {
    let event, definition, context;
    beforeEach(() => {
      context = testHelpers.emptyContext({
        getActivityById(id) {
          return {
            id,
            type: 'boundaryevent',
            Behaviour: IntermediateThrowEvent,
            behaviour: {
              eventDefinitions: [{
                type: 'compensateeventdefinition',
                Behaviour: CompensateEventDefinition,
              }],
            },
          };
        },
      });
      event = context.getActivityById('event');
      definition = event.eventDefinitions[0];
    });

    it('publishes compensate event on parent broker', () => {
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
              executionId: 'theProcess_0',
            }],
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
