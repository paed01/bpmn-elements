import Environment from '../../src/Environment.js';
import factory from '../helpers/factory.js';
import MessageFlow from '../../src/flows/MessageFlow.js';
import testHelpers from '../helpers/testHelpers.js';
import {ActivityBroker} from '../../src/EventBroker.js';

describe('MessageFlow', () => {
  it('requires target, source, and context with environment and getActivityById', () => {
    const activity = ActivityBroker();
    const context = {
      environment: new Environment(),
      getActivityById() {
        return activity;
      },
    };
    const flow = new MessageFlow({
      id: 'message',
      parent: {},
      source: {
        id: 'task',
      },
      target: {
        id: 'task1',
      },
    }, context);

    expect(flow).to.have.property('type', 'messageflow');
  });

  it('listens for run end, and message messages from source activity', () => {
    const activity = ActivityBroker();
    const context = {
      environment: new Environment(),
      getActivityById() {
        return activity;
      },
    };
    const flow = new MessageFlow({
      id: 'message',
      type: 'messageflow',
      parent: {},
      source: {
        id: 'task',
      },
      target: {
        id: 'task1',
      },
    }, context);

    flow.activate();

    expect(activity.broker).to.have.property('consumerCount', 2);
  });

  it('when source activity ends a message is sent with forwarded message, source, and target', async () => {
    const context = await testHelpers.context(factory.resource('lanes.bpmn').toString());
    const activity = context.getActivityById('task1');
    activity.once('activity.execution.completed', () => {
      activity.broker.publish('format', 'run.end', {message: {id: 'message_1'}});
    });

    const [flow] = context.getMessageFlows('mainProcess');

    flow.activate();

    const messages = [];
    flow.broker.subscribeTmp('event', 'message.outbound', (_, msg) => {
      messages.push(msg);
    }, {noAck: true});

    activity.run();

    expect(messages.length).to.equal(1);
    const content = messages[0].content;
    expect(messages[0].content).to.have.property('message').that.eql({
      id: 'message_1',
    });
    expect(content).to.have.property('source').that.eql({
      processId: 'mainProcess',
      id: 'task1',
    });
    expect(content).to.have.property('target').that.eql({
      processId: 'participantProcess',
      id: 'messageStartEvent',
    });
  });

  it('iterates counter when message is sent', async () => {
    const context = await testHelpers.context(factory.resource('lanes.bpmn').toString());
    const activity = context.getActivityById('task1');
    activity.once('activity.execution.completed', () => {
      activity.broker.publish('format', 'run.end', {message: {id: 'message_1'}});
    });

    const [flow] = context.getMessageFlows('mainProcess');

    flow.activate();

    activity.broker.publish('event', 'activity.end', {});
    activity.broker.publish('event', 'activity.end', {});
    activity.broker.publish('event', 'activity.end', {});

    expect(flow.counters).to.have.property('messages', 3);
  });

  it('getApi() returns message Api', () => {
    const activity = ActivityBroker();
    const context = {
      environment: new Environment(),
      getActivityById() {
        return activity;
      },
    };

    const flow = new MessageFlow({
      id: 'message',
      type: 'messageflow',
      parent: {},
      source: {
        id: 'task',
      },
      target: {
        id: 'task1',
      },
    }, context);

    const api = flow.getApi();
    expect(api).to.have.property('id', 'message');
  });

  it('getApi(message) returns message Api', () => {
    const activity = ActivityBroker();
    const context = {
      environment: new Environment(),
      getActivityById() {
        return activity;
      },
    };

    const flow = new MessageFlow({
      id: 'message',
      type: 'messageflow',
      parent: {},
      source: {
        id: 'task',
      },
      target: {
        id: 'task1',
      },
    }, context);

    const api = flow.getApi({ content: {id: 'foo'} });
    expect(api).to.have.property('id', 'foo');
  });
});
