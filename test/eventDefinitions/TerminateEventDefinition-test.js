import Environment from '../../src/Environment';
import TerminateEventDefinition from '../../src/eventDefinitions/TerminateEventDefinition';
import {ActivityBroker} from '../../src/EventBroker';

describe('TerminateEventDefinition', () => {
  let event;
  beforeEach(() => {
    event = {
      environment: new Environment(),
      broker: ActivityBroker(this).broker,
    };
  });

  it('publishes process terminate on parent broker and completes', () => {
    const terminateDefinition = TerminateEventDefinition(event, {
      type: 'bpmn:MessageEventDefinition',
    });

    const messages = [];
    event.broker.subscribeTmp('event', 'process.*', (_, msg) => {
      messages.push(msg);
    }, {noAck: true});
    event.broker.subscribeTmp('execution', '#', (_, msg) => {
      messages.push(msg);
    }, {noAck: true});

    terminateDefinition.execute({
      content: {
        id: 'end',
        executionId: 'end_0_0',
        parent: {
          id: 'end',
          executionId: 'end_0',
          type: 'bpmn:EndEvent',
          path: [{
            id: 'theProcess',
            executionId: 'theProcess_0',
          }]
        }
      }
    });

    expect(messages).to.have.length(2);
    expect(messages[0].fields).to.have.property('routingKey', 'process.terminate');
    expect(messages[0].content).to.have.property('state', 'terminate');
    expect(messages[0].content).to.have.property('parent');
    expect(messages[0].content.parent).to.have.property('id', 'theProcess');
    expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');

    expect(messages[1].fields).to.have.property('routingKey', 'execute.completed');
  });
});
