import Message from '../../src/activity/Message.js';
import ReceiveTask from '../../src/tasks/ReceiveTask.js';
import testHelpers from '../helpers/testHelpers.js';

describe('ReceiveTask', () => {
  let task;
  beforeEach(() => {
    task = ReceiveTask({
      id: 'task',
      parent: {
        id: 'theProcess',
      },
    }, testHelpers.emptyContext({
      getActivityById(id) {
        if (id !== 'message_1') return;
        return {
          id: 'message_1',
          type: 'bpmn:Message',
          name: 'My Message ${content.id}',
          Behaviour: Message,
        };
      },
    }));
  });

  it('publishes wait event on parent broker with resolved message', () => {
    const messages = [];
    task.behaviour.messageRef = {id: 'message_1'};

    task.broker.subscribeTmp('event', 'activity.wait', (_, msg) => {
      messages.push(msg);
    }, {noAck: true});

    task.run();

    expect(messages).to.have.length(1);
    expect(messages[0].fields).to.have.property('routingKey', 'activity.wait');
    expect(messages[0].content.parent).to.have.property('id', 'theProcess');

    expect(messages[0].content.message).to.have.property('id', 'message_1');
    expect(messages[0].content.message).to.have.property('name', 'My Message task');
  });

  it('ignores message and keeps listeners if message id doesn´t match', () => {
    const messages = [];
    task.behaviour.messageRef = {id: 'message_1'};

    task.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
      messages.push(msg);
    }, {noAck: true, consumerTag: '_test-tag'});

    task.run();

    const consumerCount = task.broker.consumerCount;
    expect(consumerCount).to.be.above(0);

    task.broker.publish('api', 'activity.message.task_1', {
      message: {
        id: 'message_2',
      },
    });

    expect(messages).to.have.length(0);

    expect(task.broker).to.have.property('consumerCount', consumerCount);
  });

  it('completes when expected message is caught', () => {
    const messages = [];
    task.behaviour.messageRef = {id: 'message_1'};

    task.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
      messages.push(msg);
    }, {noAck: true, consumerTag: '_test-tag-1'});

    task.broker.subscribeTmp('event', 'activity.catch', (_, msg) => {
      messages.push(msg);
    }, {noAck: true, consumerTag: '_test-tag-2'});

    task.run();

    task.broker.publish('api', 'process.message.event_1', {
      message: {
        id: 'message_1',
        msg: 'ping',
      },
    });

    task.broker.cancel('_test-tag-1');
    task.broker.cancel('_test-tag-2');

    expect(messages).to.have.length(2);
    expect(messages[0]).to.have.property('fields').with.property('routingKey', 'activity.catch');
    expect(messages[0].content).to.have.property('message').that.eql({
      id: 'message_1',
      msg: 'ping',
    });

    expect(messages[1]).to.have.property('fields').with.property('routingKey', 'execute.completed');
    expect(messages[1].content).to.have.property('output').that.eql({
      id: 'message_1',
      msg: 'ping',
    });

    task.run();
  });

  it('completes when anonymous message is caught', () => {
    const messages = [];
    task.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
      messages.push(msg);
    }, {noAck: true, consumerTag: '_test-tag'});

    task.run();

    task.broker.publish('api', 'process.message.pid_1', {});
    task.broker.cancel('_test-tag');

    expect(messages).to.have.length(1);

    task.run();
  });

  it('completes if messaged before execution', () => {
    task.behaviour.messageRef = {id: 'message_1'};

    task.broker.publish('api', 'definition.message.def_1', {
      message: task.getActivityById('message_1').resolve(),
    });

    const messages = [];
    task.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
      messages.push(msg);
    }, {noAck: true, consumerTag: '_test-tag'});

    task.run();

    expect(messages).to.have.length(1);

    task.run();

    expect(messages).to.have.length(1);
  });

  it('discards if discarded', () => {
    const messages = [];
    task.broker.subscribeTmp('execution', 'execute.discard', (_, msg) => {
      messages.push(msg);
    }, {noAck: true, consumerTag: '_test-tag'});

    task.run();

    task.getApi().discard();

    expect(messages).to.have.length(1);
  });

  it('completes if signaled', () => {
    const messages = [];
    task.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
      messages.push(msg);
    }, {noAck: true, consumerTag: '_test-tag'});

    task.run();

    task.getApi().signal();

    expect(messages).to.have.length(1);
  });

  it('stops and clears listeners if stopped', () => {
    const messages = [];
    task.broker.subscribeTmp('execution', 'execute.#', (_, msg) => {
      messages.push(msg);
    }, {noAck: true, consumerTag: '_test-tag'});

    task.run();
    task.getApi().stop();

    expect(messages).to.have.length(1);
    expect(messages[0].fields).to.have.property('routingKey', 'execute.start');

    task.broker.cancel('_test-tag');

    expect(task.broker).to.have.property('consumerCount', 0);
  });
});
