import MessageEventDefinition from '../../src/eventDefinitions/MessageEventDefinition';
import Environment from '../../src/Environment';
import {ActivityApi} from '../../src/Api';
import {ActivityBroker} from '../../src/EventBroker';
import {Logger} from '../helpers/testHelpers';

describe('MessageEventDefinition', () => {
  let event;
  beforeEach(() => {
    event = {
      environment: Environment({Logger}),
    };
    event.broker = ActivityBroker(event).broker;
  });

  it('publishes wait event on parent broker', () => {
    const definition = MessageEventDefinition(event, {
      type: 'bpmn:MessageEventDefinition',
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
          id: 'bound',
          executionId: 'event_1',
        },
      },
    });

    expect(messages).to.have.length(1);
    expect(messages[0].fields).to.have.property('routingKey', 'activity.wait');
    expect(messages[0].content).to.have.property('executionId', 'event_1_0');
    expect(messages[0].content.parent).to.have.property('id', 'bound');
  });

  it('completes when signaled', (done) => {
    const definition = MessageEventDefinition(event, {
      type: 'bpmn:MessageEventDefinition',
    });

    let api;
    event.broker.subscribeOnce('event', 'activity.wait', (_, message) => {
      api = ActivityApi(event.broker, message);
    });

    definition.execute({
      fields: {},
      content: {
        executionId: 'event_1_0',
        index: 0,
        parent: {
          id: 'bound',
          executionId: 'event_1',
        },
      },
    });

    event.broker.subscribeOnce('execution', 'execute.completed', () => done());

    api.signal();
  });

  it('sends signal as and output when completed by signal', (done) => {
    const definition = MessageEventDefinition(event, {
      type: 'bpmn:MessageEventDefinition',
    });

    event.broker.subscribeOnce('execution', 'execute.completed', (_, message) => {
      expect(message.content).to.have.property('output').that.eql({data: 1});
      done();
    });

    event.broker.subscribeOnce('event', 'activity.wait', (_, message) => {
      ActivityApi(event.broker, message).signal({data: 1});
    });

    definition.execute({
      fields: {},
      content: {
        executionId: 'event_1_0',
        index: 0,
        parent: {
          id: 'bound',
          executionId: 'event_1',
        },
      },
    });
  });

  it('leaves no lingering listeners when completed by signal', (done) => {
    const definition = MessageEventDefinition(event, {
      type: 'bpmn:MessageEventDefinition',
    });

    event.broker.subscribeOnce('execution', 'execute.completed', () => {
      expect(event.broker.getExchange('api')).to.have.property('bindingCount', 0);
      expect(event.broker.getExchange('event')).to.have.property('bindingCount', 0);
      expect(event.broker.getQueue('messages')).to.have.property('consumerCount', 0);
      done();
    });

    event.broker.subscribeOnce('event', 'activity.wait', (_, message) => {
      ActivityApi(event.broker, message).signal();
    });

    definition.execute({
      fields: {},
      content: {
        executionId: 'event_1_0',
        index: 0,
        parent: {
          id: 'bound',
          executionId: 'event_1',
        },
      },
    });
  });

  it('leaves no lingering listeners if discarded', (done) => {
    const definition = MessageEventDefinition(event, {
      type: 'bpmn:MessageEventDefinition',
    });

    event.broker.subscribeOnce('event', 'activity.wait', (_, message) => {
      ActivityApi(event.broker, message).discard();
    });

    event.broker.subscribeOnce('execution', 'execute.discard', () => {
      expect(event.broker.getExchange('api')).to.have.property('bindingCount', 0);
      expect(event.broker.getExchange('event')).to.have.property('bindingCount', 0);
      expect(event.broker.getQueue('messages')).to.have.property('consumerCount', 0);
      done();
    });

    definition.execute({
      fields: {},
      content: {
        executionId: 'event_1_0',
        index: 0,
        parent: {
          id: 'bound',
          executionId: 'event_1',
        },
      },
    });
  });

  it('leaves no lingering listeners if stopped', (done) => {
    const definition = MessageEventDefinition(event, {
      type: 'bpmn:MessageEventDefinition',
    });

    event.broker.subscribeOnce('event', 'activity.wait', (_, message) => {
      ActivityApi(event.broker, message).stop();
      expect(event.broker.getExchange('api')).to.have.property('bindingCount', 0);
      expect(event.broker.getExchange('event')).to.have.property('bindingCount', 0);
      expect(event.broker.getQueue('messages')).to.have.property('consumerCount', 0);
      done();
    });

    definition.execute({
      fields: {},
      content: {
        executionId: 'event_1_0',
        index: 0,
        parent: {
          id: 'bound',
          executionId: 'event_1',
        },
      },
    });
  });

  it('listens on parent message queue', () => {
    const definition = MessageEventDefinition(event, {
      type: 'bpmn:MessageEventDefinition',
    });

    definition.execute({content: {executionId: 'def-execution-id'}});
    expect(event.broker.getQueue('messages')).to.have.property('consumerCount', 1);
  });

  it('completes if message is in message queue before execute', (done) => {
    const definition = MessageEventDefinition(event, {
      type: 'bpmn:MessageEventDefinition',
    });

    event.broker.sendToQueue('messages', {data: 1});

    event.broker.subscribeOnce('execution', 'execute.completed', (_, message) => {
      expect(message.content).to.have.property('output').that.eql({data: 1});
      done();
    });

    definition.execute({content: {executionId: 'def-execution-id'}});
  });

  it('doesn´t publish wait message if message is present before execute', (done) => {
    const definition = MessageEventDefinition(event, {
      type: 'bpmn:MessageEventDefinition',
    });

    const broker = event.broker;
    broker.sendToQueue('messages', {data: 1});

    broker.subscribeOnce('execution', 'execute.wait', () => {
      throw new Error('Shouldnt happen');
    });

    broker.subscribeOnce('execution', 'execute.completed', (_, message) => {
      expect(message.content).to.have.property('output').that.eql({data: 1});
      done();
    });

    definition.execute({content: {executionId: 'def-execution-id'}});

  });

  it('leaves no lingering api or message listeners if message is consumed', (done) => {
    const definition = MessageEventDefinition(event, {
      type: 'bpmn:MessageEventDefinition',
    });

    const broker = event.broker;
    broker.sendToQueue('messages', {data: 1});

    broker.subscribeOnce('execution', 'execute.completed', () => {
      expect(broker.getExchange('api')).to.have.property('bindingCount', 0);
      expect(broker.getQueue('messages')).to.have.property('consumerCount', 0);
      done();
    });

    definition.execute({content: {executionId: 'def-execution-id'}});
  });
});
