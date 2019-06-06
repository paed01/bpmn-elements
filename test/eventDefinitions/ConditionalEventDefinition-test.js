import ConditionalEventDefinition from '../../src/eventDefinitions/ConditionalEventDefinition';
import Environment from '../../src/Environment';
import testHelpers from '../helpers/testHelpers';
import {ActivityBroker} from '../../src/EventBroker';
import {ActivityApi} from '../../src/Api';

describe('ConditionalEventDefinition', () => {
  let event, task;
  beforeEach(() => {
    const environment = Environment({ Logger: testHelpers.Logger });
    task = {
      id: 'task',
      type: 'bpmn:Task',
      broker: ActivityBroker(this).broker,
      environment,
    };
    event = {
      id: 'event',
      type: 'bpmn:Event',
      broker: ActivityBroker(this).broker,
      environment,
    };
  });

  describe('bound', () => {
    it('publishes condition message with undefined result if expression is empty', () => {
      event.attachedTo = task;

      const condition = ConditionalEventDefinition(event, {
        type: 'bpmn:ConditionalEventDefinition',
        behaviour: {},
      });

      let message;
      event.broker.subscribeOnce('event', 'activity.condition', (_, msg) => {
        message = msg;
      });

      event.broker.subscribeOnce('execution', '#', () => {
        throw new Error('Shouldn´t publish on execution exchange');
      });

      condition.execute({
        fields: {},
        content: {
          executionId: 'event_0_0',
          index: 0,
          parent: {
            id: 'event',
            executionId: 'event_0',
          },
        },
      });

      task.broker.publish('execution', 'execute.completed', {id: 'task', executionId: 'task_0'});

      expect(message).to.be.ok;
      expect(message).to.have.property('content').with.property('conditionResult').to.be.undefined;
      expect(message.content).to.have.property('index', 0);
    });

    it('publishes condition message with condition result as output if condition is met', () => {
      event.attachedTo = task;

      const condition = ConditionalEventDefinition(event, {
        type: 'bpmn:ConditionalEventDefinition',
        behaviour: {
          expression: '${content.output.value}'
        },
      });

      let conditionMessage;
      event.broker.subscribeOnce('event', 'activity.condition', (_, msg) => {
        conditionMessage = msg;
      });

      let completedMessage;
      event.broker.subscribeOnce('execution', '#', (_, msg) => {
        completedMessage = msg;
      });

      condition.execute({
        fields: {},
        content: {
          executionId: 'event_0_0',
          index: 0,
          parent: {
            id: 'event',
            executionId: 'event_0',
          },
        },
      });

      task.broker.publish('execution', 'execute.completed', {
        id: 'task',
        executionId: 'task_0',
        output: {
          value: {data: 1}
        }
      });

      expect(conditionMessage).to.be.ok;
      expect(conditionMessage).to.have.property('content').with.property('conditionResult').that.eql({data: 1});
      expect(conditionMessage.content).to.have.property('index', 0);

      expect(completedMessage).to.be.ok;
      expect(completedMessage).to.have.property('fields').with.property('routingKey', 'execute.completed');
      expect(completedMessage).to.have.property('content').with.property('output').that.eql({data: 1});
      expect(completedMessage.content).to.have.property('index', 0);
    });
  });

  describe('wait', () => {
    it('publishes condition message with undefined result if expression is empty', () => {
      const condition = ConditionalEventDefinition(event, {
        type: 'bpmn:ConditionalEventDefinition',
        behaviour: {},
      });

      let message;
      event.broker.subscribeOnce('event', 'activity.condition', (_, msg) => {
        message = msg;
      });

      event.broker.subscribeOnce('execution', '#', () => {
        throw new Error('Shouldn´t publish on execution exchange');
      });

      const executeMessage = {
        fields: {},
        content: {
          executionId: 'event_0_0',
          index: 0,
          parent: {
            id: 'event',
            executionId: 'event_0',
          },
        },
      };

      condition.execute(executeMessage);

      ActivityApi(event.broker, executeMessage, event.environment).signal({value: {data: 1}});

      expect(message).to.be.ok;
      expect(message).to.have.property('content').with.property('conditionResult').to.be.undefined;
      expect(message.content).to.have.property('index', 0);
    });

    it('publishes condition message with condition result as output if condition is met', () => {
      const condition = ConditionalEventDefinition(event, {
        type: 'bpmn:ConditionalEventDefinition',
        behaviour: {
          expression: '${content.message.value}'
        },
      });

      const conditionMessages = [];
      event.broker.subscribeTmp('event', 'activity.condition', (_, msg) => {
        conditionMessages.push(msg);
      }, {noAck: true});

      let completedMessage;
      event.broker.subscribeOnce('execution', '#', (_, msg) => {
        completedMessage = msg;
      });

      const executeMessage = {
        fields: {},
        content: {
          executionId: 'event_0_0',
          index: 0,
          parent: {
            id: 'event',
            executionId: 'event_0',
          },
        },
      };

      condition.execute(executeMessage);

      expect(conditionMessages.length).to.equal(1);
      expect(conditionMessages[0]).to.have.property('content').with.property('conditionResult').that.is.undefined;

      ActivityApi(event.broker, executeMessage, event.environment).signal({value: {data: 1}});

      expect(conditionMessages.length).to.equal(2);
      expect(conditionMessages[1].content).to.have.property('index', 0);
      expect(conditionMessages[1]).to.have.property('content').with.property('conditionResult').that.eql({data: 1});

      expect(completedMessage).to.be.ok;
      expect(completedMessage).to.have.property('fields').with.property('routingKey', 'execute.completed');
      expect(completedMessage).to.have.property('content').with.property('output').that.eql({data: 1});
      expect(completedMessage.content).to.have.property('index', 0);
    });

    it('discard closes consumers and publish discard message', () => {
      const condition = ConditionalEventDefinition(event, {
        type: 'bpmn:ConditionalEventDefinition',
        behaviour: {
          expression: '${content.output.value}'
        },
      });

      expect(event.broker.getExchange('api').bindingCount).to.equal(0);

      const executeMessage = {
        fields: {},
        content: {
          executionId: 'event_0_0',
          index: 0,
          parent: {
            id: 'event',
            executionId: 'event_0',
          },
        },
      };

      condition.execute(executeMessage);

      expect(event.broker.getExchange('api').bindingCount).to.equal(2);

      let discardMessage;
      event.broker.subscribeOnce('execution', '#', (_, msg) => {
        discardMessage = msg;
      });

      ActivityApi(event.broker, executeMessage, event.environment).discard();

      expect(event.broker.getExchange('api').bindingCount).to.equal(0);

      expect(discardMessage).to.be.ok;
      expect(discardMessage).to.have.property('fields').with.property('routingKey', 'execute.discard');
      expect(discardMessage.content).to.have.property('index', 0);
    });
  });

  describe('condition met', () => {
    it('wait condition closes consumers', () => {
      const condition = ConditionalEventDefinition(event, {
        type: 'bpmn:ConditionalEventDefinition',
        behaviour: {
          expression: '${content.message.value}'
        },
      });

      expect(event.broker.getExchange('api').bindingCount).to.equal(0);

      const executeMessage = {
        fields: {},
        content: {
          executionId: 'event_0_0',
          index: 0,
          parent: {
            id: 'event',
            executionId: 'event_0',
          },
        },
      };

      condition.execute(executeMessage);

      expect(event.broker.getExchange('api').bindingCount).to.equal(2);

      ActivityApi(event.broker, executeMessage, event.environment).signal({value: true});

      expect(event.broker.getExchange('api').bindingCount).to.equal(0);
    });

    it('bound condition completed close consumers', () => {
      event.attachedTo = task;

      const condition = ConditionalEventDefinition(event, {
        type: 'bpmn:ConditionalEventDefinition',
        behaviour: {
          expression: '${content.output.value}'
        },
      });

      expect(task.broker.getExchange('execution').bindingCount).to.equal(1);
      expect(event.broker.getExchange('api').bindingCount).to.equal(0);

      const executeMessage = {
        fields: {},
        content: {
          executionId: 'event_0_0',
          index: 0,
          parent: {
            id: 'event',
            executionId: 'event_0',
          },
        },
      };

      condition.execute(executeMessage);

      expect(task.broker.getExchange('execution').bindingCount).to.equal(2);
      expect(event.broker.getExchange('api').bindingCount).to.equal(1);

      task.broker.publish('execution', 'execute.completed', {
        id: 'task',
        executionId: 'task_0',
        output: {
          value: {data: 1}
        }
      });

      expect(task.broker.getExchange('execution').bindingCount).to.equal(1);
      expect(event.broker.getExchange('api').bindingCount).to.equal(0);
    });
  });

  describe('stop', () => {
    it('wait condition stop closes consumers', () => {
      const condition = ConditionalEventDefinition(event, {
        type: 'bpmn:ConditionalEventDefinition',
        behaviour: {
          expression: '${content.output.value}'
        },
      });

      expect(event.broker.getExchange('api').bindingCount).to.equal(0);

      const executeMessage = {
        fields: {},
        content: {
          executionId: 'event_0_0',
          index: 0,
          parent: {
            id: 'event',
            executionId: 'event_0',
          },
        },
      };

      condition.execute(executeMessage);

      expect(event.broker.getExchange('api').bindingCount).to.equal(2);

      ActivityApi(event.broker, executeMessage, event.environment).stop();

      expect(event.broker.getExchange('api').bindingCount).to.equal(0);
    });

    it('bound condition stop closes consumers', () => {
      event.attachedTo = task;

      const condition = ConditionalEventDefinition(event, {
        type: 'bpmn:ConditionalEventDefinition',
        behaviour: {
          expression: '${content.output.value}'
        },
      });

      expect(task.broker.getExchange('execution').bindingCount).to.equal(1);
      expect(event.broker.getExchange('api').bindingCount).to.equal(0);

      const executeMessage = {
        fields: {},
        content: {
          executionId: 'event_0_0',
          index: 0,
          parent: {
            id: 'event',
            executionId: 'event_0',
          },
        },
      };

      condition.execute(executeMessage);

      expect(task.broker.getExchange('execution').bindingCount).to.equal(2);
      expect(event.broker.getExchange('api').bindingCount).to.equal(1);

      ActivityApi(event.broker, executeMessage, event.environment).stop();

      expect(task.broker.getExchange('execution').bindingCount).to.equal(1);
      expect(event.broker.getExchange('api').bindingCount).to.equal(0);
    });
  });
});
