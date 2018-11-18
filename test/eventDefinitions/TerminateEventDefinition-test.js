import Environment from '../../src/Environment';
import TerminateEventDefinition from '../../src/eventDefinitions/TerminateEventDefinition';
import {ActivityBroker} from '../../src/EventBroker';

describe('TerminateEventDefinition', () => {
  let event;
  beforeEach(() => {
    event = {
      environment: Environment(),
      broker: ActivityBroker(this).broker,
    };
  });

  it('publishes process terminate on parent broker and completes', () => {
    const definition = TerminateEventDefinition(event, {
      type: 'bpmn:MessageEventDefinition',
    });

    const messages = [];
    event.broker.subscribeTmp('event', 'process.*', (_, msg) => {
      messages.push(msg);
    }, {noAck: true});
    event.broker.subscribeTmp('execution', '#', (_, msg) => {
      messages.push(msg);
    }, {noAck: true});

    definition.execute({content: {executionId: 'def-execution-id'}});

    expect(messages).to.have.length(2);
    expect(messages[0].fields).to.have.property('routingKey', 'process.terminate');
    expect(messages[0].content).to.have.property('state', 'terminate');
    expect(messages[1].fields).to.have.property('routingKey', 'execute.completed');
  });
});
