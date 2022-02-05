import EventDefinitionExecution from '../../src/eventDefinitions/EventDefinitionExecution';
import {ActivityBroker} from '../../src/EventBroker';
import {cloneContent} from '../../src/messageHelper';
import {Logger} from '../helpers/testHelpers';

describe('EventDefinitionExecution', () => {
  it('publishes root message with prevent complete instruction when executed', () => {
    const event = getActivity();

    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      Behaviour() {},
    }]);

    let message;
    event.broker.subscribeOnce('execution', 'execute.#', (_, msg) => {
      message = msg;
    });

    execution.execute({
      fields: {},
      content: {
        id: 'event',
        type: 'startevent',
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'process1',
          type: 'bpmn:Process',
          executionId: 'process1_1',
        },
      },
    });

    expect(message).to.be.ok;
    expect(message).to.have.property('content').with.property('isRootScope', true);
    expect(message.content).to.have.property('executionId', 'root-execution-id');
    expect(message.content).to.have.property('preventComplete', true);
  });

  it('publishes start definition message when executed', () => {
    const event = getActivity();

    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      Behaviour() {},
    }]);

    let message;
    event.broker.subscribeOnce('execution', 'execute.start', (_, msg) => {
      message = msg;
    });

    execution.execute({
      fields: {},
      content: {
        id: 'event',
        type: 'startevent',
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'process1',
          type: 'bpmn:Process',
          executionId: 'process1_1',
        },
      },
    });

    expect(message).to.be.ok;
    expect(message.content.isRootScope).to.be.undefined;
    expect(message.content).to.have.property('type', 'bpmn:MessageEventDefinition');
    expect(message.content).to.have.property('executionId').that.is.ok.and.not.equal('root-execution-id');
    expect(message.content).to.have.property('index', 0);
    expect(message.content).to.have.property('isDefinitionScope', true);
    expect(message.content).to.have.property('parent').that.eql({
      id: 'event',
      type: 'startevent',
      executionId: 'root-execution-id',
      path: [{
        id: 'process1',
        type: 'bpmn:Process',
        executionId: 'process1_1',
      }],
    });
  });

  it('publishes no start message if redelivered execute message', () => {
    const event = getActivity();
    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      Behaviour() {},
    }]);

    let message;
    event.broker.subscribeOnce('execution', 'execute.start', (_, msg) => {
      message = msg;
    });

    execution.execute({
      fields: {
        redelivered: true,
      },
      content: {
        id: event.id,
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });

    expect(message).to.not.be.ok;
  });

  it('executes event definition when executed with event definition start message', () => {
    const event = getActivity();

    let executeMessage;
    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      execute(msg) {
        executeMessage = msg;
      },
    }]);

    let startMessage;
    event.broker.subscribeOnce('execution', 'execute.start', (_, msg) => {
      startMessage = msg;
    });

    execution.execute({
      fields: {},
      content: {
        id: event.id,
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });

    expect(startMessage).to.be.ok;

    execution.execute(startMessage);

    expect(executeMessage).to.be.ok;
    expect(executeMessage.content.isRootScope).to.be.undefined;
    expect(executeMessage.content).to.have.property('type', 'bpmn:MessageEventDefinition');
    expect(executeMessage.content).to.have.property('executionId').that.is.ok.and.not.equal('root-execution-id');
    expect(executeMessage.content).to.have.property('index', 0);
    expect(executeMessage.content).to.have.property('isDefinitionScope', true);
  });

  it('starts all event definitions', () => {
    const event = getActivity();
    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      execute() {},
    }, {
      type: 'bpmn:TimerEventDefinition',
      execute() {},
    }]);

    const messages = [];
    event.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
      messages.push(msg);
    }, {noAck: true});

    execution.execute({
      fields: {},
      content: {
        id: event.id,
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });

    expect(messages).to.have.length(2);
    expect(messages[0].content.isRootScope).to.be.undefined;
    expect(messages[0].content).to.have.property('type', 'bpmn:MessageEventDefinition');
    expect(messages[0].content).to.have.property('executionId').that.is.ok.and.not.equal('root-execution-id');
    expect(messages[0].content).to.have.property('index', 0);
    expect(messages[0].content).to.have.property('isDefinitionScope', true);
    expect(messages[0].content).to.have.property('parent').with.property('id', event.id);
    expect(messages[0].content.parent).to.have.property('path').with.length(1);
    expect(messages[0].content.parent.path[0]).to.have.property('id', 'theProcess');

    expect(messages[1].content.isRootScope).to.be.undefined;
    expect(messages[1].content).to.have.property('type', 'bpmn:TimerEventDefinition');
    expect(messages[1].content).to.have.property('executionId').that.is.ok.and.not.equal('root-execution-id');
    expect(messages[1].content).to.have.property('index', 1);
    expect(messages[1].content).to.have.property('isDefinitionScope', true);
    expect(messages[1].content).to.have.property('parent').with.property('id', event.id);
    expect(messages[1].content.parent).to.have.property('path').with.length(1);
    expect(messages[1].content.parent.path[0]).to.have.property('id', 'theProcess');
  });

  it('publishes event definition complete message with output to update root scope', () => {
    const event = getActivity();
    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      execute() {},
    }]);

    let completeMessage;
    event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
      completeMessage = msg;
    }, {noAck: true});

    const messages = [];
    event.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
      messages.push(msg);
    }, {noAck: true});

    execution.execute({
      fields: {},
      content: {
        id: event.id,
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });

    event.broker.publish('execution', 'execute.completed', {
      ...cloneContent(messages[0].content),
      output: 1,
    });

    expect(completeMessage).to.be.ok;
    expect(completeMessage.content).to.have.property('executionId', 'root-execution-id');
    expect(completeMessage.content).to.have.property('isRootScope', true);
    expect(completeMessage.content).to.have.property('output', 1);
  });

  it('publishes event definition complete message with message to update root scope', () => {
    const event = getActivity();
    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      execute() {},
    }]);

    let completeMessage;
    event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
      completeMessage = msg;
    }, {noAck: true});

    const startMessages = [];
    event.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
      startMessages.push(msg);
    }, {noAck: true});

    execution.execute({
      fields: {},
      content: {
        id: event.id,
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });

    event.broker.publish('execution', 'execute.completed', {
      ...startMessages[0].content,
      message: 2,
    });

    expect(completeMessage).to.be.ok;
    expect(completeMessage.content).to.have.property('executionId', 'root-execution-id');
    expect(completeMessage.content).to.have.property('isRootScope', true);
    expect(completeMessage.content).to.have.property('message', 2);
  });

  it('completes execution when first event definition completes', () => {
    const event = getActivity();
    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:TimerEventDefinition',
      execute() {},
    }, {
      type: 'bpmn:MessageEventDefinition',
      execute() {},
    }]);

    let completeMessage;
    event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
      completeMessage = msg;
    }, {noAck: true});

    const messages = [];
    event.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
      messages.push(msg);
    }, {noAck: true});

    execution.execute({
      fields: {},
      content: {
        id: event.id,
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });

    event.broker.publish('execution', 'execute.completed', {
      ...cloneContent(messages[0].content),
      output: 1,
    });

    expect(completeMessage).to.be.ok;
    expect(completeMessage.content).to.have.property('output', 1);

    expect(completeMessage.content).to.have.property('parent').with.property('id', 'theProcess');
  });

  it('doesn´t start second event definition if first completes immediately', () => {
    const event = getActivity();

    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      execute(executeMessage) {
        return event.broker.publish('execution', 'execute.completed', {
          ...executeMessage.content,
          output: 1,
        });
      },
    }, {
      type: 'bpmn:MessageEventDefinition',
      execute(executeMessage) {
        return event.broker.publish('execution', 'execute.completed', {
          ...executeMessage.content,
          output: 2,
        });
      },
    }]);

    const messages = [];
    event.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
      messages.push(msg);
      execution.execute(msg);
    }, {noAck: true, consumerTag: 'test-consumer'});

    execution.execute({
      fields: {},
      content: {
        id: event.id,
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });

    expect(execution).to.have.property('completed', true);
    expect(messages).to.have.length(1);
  });

  it('doesn´t start second event definition if first is stopped immediately', () => {
    const event = getActivity();

    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      execute(executeMessage) {
        return event.broker.publish('execution', 'execute.completed', {
          ...executeMessage.content,
          output: 1,
        });
      },
    }, {
      type: 'bpmn:MessageEventDefinition',
      execute(executeMessage) {
        return event.broker.publish('execution', 'execute.completed', {
          ...executeMessage.content,
          output: 2,
        });
      },
    }]);

    const messages = [];
    event.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
      messages.push(msg);
      event.broker.publish('api', 'activity.stop.root-execution-id', {}, {type: 'stop'});
    }, {noAck: true, consumerTag: 'test-consumer'});

    execution.execute({
      fields: {},
      content: {
        id: event.id,
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });

    expect(execution).to.have.property('completed', false);
    expect(messages).to.have.length(1);
  });

  it('leaves no lingering listeners when complete', () => {
    const event = getActivity();

    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      execute(executeMessage) {
        return event.broker.publish('execution', 'execute.completed', {
          ...executeMessage.content,
          output: 1,
        });
      },
    }]);

    event.broker.subscribeOnce('execution', 'execute.start', (_, msg) => {
      execution.execute(msg);
    });

    execution.execute({
      fields: {},
      content: {
        id: event.id,
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });

    expect(execution).to.have.property('completed', true);
    expect(event.broker).to.have.property('consumerCount', 0);
  });

  it('redelivered messages, calls event definition behvaiour execute function', () => {
    const event = getActivity();

    let executeMessage;
    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      execute(msg) {
        executeMessage = msg;
      },
    }]);

    execution.execute({
      fields: {
        redelivered: true,
      },
      content: {
        id: event.id,
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });

    execution.execute({
      fields: {
        routingKey: 'execute.start',
        redelivered: true,
      },
      content: {
        executionId: 'event-definition-execution-id',
        isDefinitionScope: true,
        index: 0,
      },
    });

    expect(executeMessage).to.be.ok;
    expect(executeMessage.fields).to.have.property('routingKey', 'execute.start');
    expect(executeMessage.content).to.have.property('executionId', 'event-definition-execution-id');
  });

  it('redelivered start event definition message with index that is not found is ignored', () => {
    const event = getActivity();
    let executeMessage;
    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      execute(msg) {
        executeMessage = msg;
      },
    }]);

    execution.execute({
      fields: {
        redelivered: true,
      },
      content: {
        id: event.id,
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });

    execution.execute({
      fields: {
        routingKey: 'execute.start',
        redelivered: true,
      },
      content: {
        executionId: 'event-definition-execution-id',
        isDefinitionScope: true,
        index: 1000,
      },
    });

    expect(executeMessage).to.not.be.ok;
  });

  it('redelivered messages, completes execution when event definition completes', () => {
    const event = getActivity();
    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      execute() {},
    }]);

    let completeMessage;
    event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
      completeMessage = msg;
    }, {noAck: true});

    execution.execute({
      fields: {
        redelivered: true,
      },
      content: {
        id: event.id,
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });

    execution.execute({
      fields: {
        routingKey: 'execute.start',
        redelivered: true,
      },
      content: {
        executionId: 'event-definition-execution-id',
        isDefinitionScope: true,
        index: 0,
      },
    });

    event.broker.publish('execution', 'execute.completed', {
      executionId: 'event-definition-execution-id',
      type: 'bpmn:MessageEventDefinition',
      isDefinitionScope: true,
      index: 0,
      output: 1,
    });

    expect(execution.completed).to.be.ok;
    expect(completeMessage.content).to.have.property('output', 1);
  });

  it('stop cancels listeners', () => {
    const event = getActivity();
    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      execute() {},
    }]);


    const executionExchange = event.broker.getExchange('execution');
    expect(executionExchange).to.have.property('bindingCount', 1);

    execution.execute({
      fields: {},
      content: {
        id: event.id,
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });

    expect(event.broker.getExchange('api')).to.have.property('bindingCount', 1);

    event.broker.publish('api', 'activity.stop.root-execution-id', {}, {type: 'stop'});

    expect(executionExchange).to.have.property('bindingCount', 1);
    expect(event.broker.getExchange('api')).to.have.property('bindingCount', 0);
  });

  it('completed routingKey overrides completed execution routingKey', (done) => {
    const event = getActivity();
    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      execute({content}) {
        event.broker.publish('execution', 'execute.completed', {...content});
      },
    }], 'execute.custom');

    event.broker.subscribeOnce('execution', 'execute.start', (_, msg) => {
      execution.execute(msg);
    });

    event.broker.subscribeOnce('execution', 'execute.custom', () => {
      done();
    });

    execution.execute({
      fields: {},
      content: {
        id: event.id,
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });
  });

  it('non root execute message is ignored', () => {
    const event = getActivity();

    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      execute(executeMessage) {
        return event.broker.publish('execution', 'execute.completed', {
          ...executeMessage.content,
          output: 1,
        });
      },
    }]);

    const messages = [];
    event.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
      messages.push(msg);
    }, {noAck: true, consumerTag: 'test-consumer'});

    execution.execute({
      fields: {},
      content: {
        id: event.id,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });

    expect(messages).to.have.length(0);
  });

  it('parent complete message stops execution', () => {
    const event = getActivity();

    const execution = new EventDefinitionExecution(event, [{
      type: 'bpmn:MessageEventDefinition',
      execute() {},
    }]);

    execution.execute({
      fields: {},
      content: {
        id: event.id,
        isRootScope: true,
        executionId: 'root-execution-id',
        parent: {
          id: 'theProcess',
        },
      },
    });

    event.broker.publish('execution', 'execute.completed', {
      id: event.id,
      isRootScope: true,
      executionId: 'root-execution-id',
    });

    expect(execution).to.have.property('stopped', true);
  });
});

function getActivity() {
  const activity = ActivityBroker();
  activity.id = 'event';
  activity.type = 'bpmn:StartEvent';
  activity.logger = Logger('bpmn:startevent');

  return activity;
}
