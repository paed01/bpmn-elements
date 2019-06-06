import ConditionalEventDefinition from '../../src/eventDefinitions/ConditionalEventDefinition';
import Environment from '../../src/Environment';
import testHelpers from '../helpers/testHelpers';
import {ActivityBroker} from '../../src/EventBroker';

describe('ConditionalEventDefinition', () => {
  describe('expression', () => {
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
        type: 'bpmn:BoundaryEvent',
        broker: ActivityBroker(this).broker,
        environment,
        attachedTo: task
      };
    });

    it('publishes condition message with undefined result if expression is empty', () => {
      const definition = ConditionalEventDefinition(event, {
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

      definition.execute({
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
      const definition = ConditionalEventDefinition(event, {
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

      definition.execute({
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
      expect(completedMessage).to.have.property('content').with.property('output').that.eql({data: 1});
      expect(completedMessage.content).to.have.property('index', 0);
    });
  });
});
