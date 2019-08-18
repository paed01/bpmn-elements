import Activity from '../../src/activity/Activity';
import ActivityExecution from '../../src/activity/ActivityExecution';
import Environment from '../../src/Environment';
import EventDefinitionExecution from '../../src/eventDefinitions/EventDefinitionExecution';
import LoopCharacteristics from '../../src/tasks/LoopCharacteristics';
import SequenceFlow from '../../src/flows/SequenceFlow';
import testHelpers from '../helpers/testHelpers';

const Logger = testHelpers.Logger;

describe('ActivityExecution', () => {
  describe('execute(executeMessage)', () => {
    it('requires executeMessage', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);
      expect(execution.execute).to.throw(/requires message/i);
    });

    it('requires executeMessage content', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);
      expect(() => execution.execute({})).to.throw(/requires execution id/i);
    });

    it('requires executeMessage content executionId', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);
      expect(() => execution.execute({content: {}})).to.throw(/requires execution id/i);
    });

    it('publishes start execute message', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      let message;
      activity.broker.subscribeOnce('execution', 'execute.#', (_, msg) => {
        message = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      expect(message).to.be.ok;
      expect(message.fields).to.have.property('routingKey', 'execute.start');
      expect(message.content).to.eql({
        id: 'activity',
        type: 'task',
        isRootScope: true,
        executionId: 'activity_1',
        state: 'start',
      });
    });

    it('completes on execute completed message', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      let startMessage;
      activity.broker.subscribeOnce('execution', 'execute.start', (_, msg) => {
        startMessage = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      let completeMessage;
      activity.broker.subscribeOnce('execution', 'execution.#', (_, msg) => {
        completeMessage = msg;
      });

      activity.broker.publish('execution', 'execute.completed', startMessage.content);

      expect(completeMessage).to.be.ok;
      expect(completeMessage.fields).to.have.property('routingKey', 'execution.completed');
      expect(completeMessage.content).to.eql({
        id: 'activity',
        type: 'task',
        executionId: 'activity_1',
        state: 'completed',
        isRootScope: true,
      });
    });

    it('assigns message to completed message', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      let startMessage;
      activity.broker.subscribeOnce('execution', 'execute.start', (_, msg) => {
        startMessage = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'gateway',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      let completeMessage;
      activity.broker.subscribeOnce('execution', 'execution.#', (_, msg) => {
        completeMessage = msg;
      });

      activity.broker.publish('execution', 'execute.completed', {...startMessage.content, output: 1, outbound: [{id: 'flow', action: 'take'}]});

      expect(completeMessage).to.be.ok;
      expect(completeMessage.fields).to.have.property('routingKey', 'execution.completed');
      expect(completeMessage.content).to.eql({
        id: 'activity',
        type: 'gateway',
        state: 'completed',
        isRootScope: true,
        executionId: 'activity_1',
        output: 1,
        outbound: [{id: 'flow', action: 'take'}],
      });
    });

    it('ignores complete message if not postponed', () => {
      const activity = createActivity();
      activity.isParallelGateway = true;

      const execution = ActivityExecution(activity);

      let startMessage;
      activity.broker.subscribeOnce('execution', 'execute.start', (_, msg) => {
        startMessage = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      let completeMessage;
      activity.broker.subscribeOnce('execution', 'execution.#', (_, msg) => {
        completeMessage = msg;
      });

      activity.broker.publish('execution', 'execute.completed', {...startMessage.content, executionId: 'arch'});

      expect(completeMessage).to.not.be.ok;
    });

    it('discards sub executions by api on root execute complete message', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      const startMessages = [];
      activity.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      let discardMessage;
      activity.broker.subscribeOnce('api', 'activity.discard.*', (_, msg) => {
        discardMessage = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      activity.broker.publish('execution', 'execute.start', {
        id: 'activity',
        type: 'task',
        executionId: 'activity_1_0',
      });

      expect(execution.getPostponed()).to.have.length(2);

      activity.broker.publish('execution', 'execute.completed', startMessages[0].content);

      expect(execution.getPostponed()).to.have.length(0);
      expect(discardMessage.content).to.have.property('executionId', 'activity_1_0');

      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 0);
    });

    it('discards sub executions by api on root execute discard message', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      const startMessages = [];
      activity.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      let discardMessage;
      activity.broker.subscribeOnce('api', 'activity.discard.*', (_, msg) => {
        discardMessage = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      activity.broker.publish('execution', 'execute.start', {
        id: 'activity',
        type: 'task',
        executionId: 'activity_1_0',
      });

      expect(execution.getPostponed()).to.have.length(2);

      activity.broker.publish('execution', 'execute.discard', startMessages[0].content);

      expect(execution.getPostponed()).to.have.length(0);
      expect(discardMessage.content).to.have.property('executionId', 'activity_1_0');

      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 0);
    });

    it('execute wait and timer replaces postponed message', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      const startMessages = [];
      activity.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      expect(execution.getPostponed()).to.have.length(1);
      expect(execution.getPostponed()[0]).to.have.property('content').with.property('state', 'start');

      activity.broker.publish('execution', 'execute.wait', {...startMessages[0].content, state: 'waiting'});

      expect(execution.getPostponed()).to.have.length(1);
      expect(execution.getPostponed()[0]).to.have.property('content').with.property('state', 'waiting');

      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 1);

      activity.broker.publish('execution', 'execute.timer', {...startMessages[0].content, state: 'timer'});

      expect(execution.getPostponed()).to.have.length(1);
      expect(execution.getPostponed()[0]).to.have.property('content').with.property('state', 'timer');

      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 1);
    });

    it('sub execute wait and timer replaces postponed message', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      const startMessages = [];
      activity.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      activity.broker.publish('execution', 'execute.start', {
        id: 'activity',
        type: 'task',
        executionId: 'activity_2',
      });

      expect(execution.getPostponed()).to.have.length(2);

      activity.broker.publish('execution', 'execute.wait', {...startMessages[1].content, state: 'waiting'});

      expect(execution.getPostponed()).to.have.length(2);
      expect(execution.getPostponed()[1]).to.have.property('content').with.property('state', 'waiting');

      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 2);

      activity.broker.publish('execution', 'execute.timer', {...startMessages[0].content, state: 'timer'});

      expect(execution.getPostponed()).to.have.length(2);
      expect(execution.getPostponed()[0]).to.have.property('content').with.property('state', 'timer');

      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 2);
    });

    it('execute error completes execution', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      const startMessages = [];
      activity.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      const errorMessages = [];
      activity.broker.subscribeTmp('execution', 'execution.error', (_, msg) => {
        errorMessages.push(msg);
      }, {noAck: true});

      activity.broker.publish('execution', 'execute.error', {...startMessages[0].content, error: {message: 'Err'}});

      expect(errorMessages.length).to.equal(1);
      expect(errorMessages[0].content).to.have.property('error').that.eql({message: 'Err'});

      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 0);
    });

    it('sub execute error completes execution', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      const startMessages = [];
      activity.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      activity.broker.publish('execution', 'execute.start', {
        id: 'activity',
        type: 'task',
        executionId: 'activity_1_0',
        isRootScope: false,
      });

      const errorMessages = [];
      activity.broker.subscribeTmp('execution', 'execution.error', (_, msg) => {
        errorMessages.push(msg);
      }, {noAck: true});

      activity.broker.publish('execution', 'execute.error', {...startMessages[1].content, error: {message: 'Err'}});

      expect(errorMessages.length).to.equal(1);
      expect(errorMessages[0].content).to.have.property('error').that.eql({message: 'Err'});

      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 0);
    });

    it('sub execute error completes execution', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      const startMessages = [];
      activity.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      activity.broker.publish('execution', 'execute.start', {
        id: 'activity',
        type: 'task',
        executionId: 'activity_2',
      });

      const errorMessages = [];
      activity.broker.subscribeTmp('execution', 'execution.error', (_, msg) => {
        errorMessages.push(msg);
      }, {noAck: true});

      activity.broker.publish('execution', 'execute.error', {...startMessages[1].content, error: {message: 'Err'}});

      expect(errorMessages.length).to.equal(1);
      expect(errorMessages[0].content).to.have.property('error').that.eql({message: 'Err'});

      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 0);
    });
  });

  describe('discard()', () => {
    it('discards execution', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      let message;
      activity.broker.subscribeOnce('execution', 'execution.discard', (_, msg) => {
        message = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      execution.discard();

      expect(execution.completed).to.be.true;
      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 0);
      expect(activity.broker.getQueue('execute-q')).to.have.property('consumerCount', 0);

      expect(message).to.be.ok;
      expect(message.content).to.eql({
        id: 'activity',
        type: 'task',
        executionId: 'activity_1',
        state: 'discard',
        isRootScope: true,
      });
    });

    it('discards sub executions', () => {
      const activity = createActivity(Behaviour);
      const execution = ActivityExecution(activity);

      const discardApiMessages = [];
      activity.broker.subscribeTmp('api', 'activity.discard.*', (_, msg) => {
        discardApiMessages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });
      execution.discard();

      expect(execution.completed).to.be.true;
      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 0);
      expect(activity.broker.getQueue('execute-q')).to.have.property('consumerCount', 0);

      expect(discardApiMessages).to.have.length(2);
      expect(discardApiMessages[0].fields).to.have.property('routingKey', 'activity.discard.activity_1');
      expect(discardApiMessages[1].fields).to.have.property('routingKey', 'activity.discard.activity_2');

      function Behaviour({broker}) {
        return {
          execute({content}) {
            if (!content.isRootScope) return;
            broker.publish('execution', 'execute.start', {...content, executionId: 'activity_2', isRootScope: undefined});
          },
        };
      }
    });

    it('ignored if not executing', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      activity.broker.subscribeTmp('execution', 'execute.discard', () => {
        throw new Error('Shouldn´t happen');
      }, {noAck: true});

      execution.discard();
    });

    it('ignored if completed', () => {
      const activity = createActivity(Behaviour);
      const execution = ActivityExecution(activity);

      activity.broker.subscribeTmp('execution', 'execute.discard', () => {
        throw new Error('Shouldn´t happen');
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });
      expect(execution.completed).to.be.true;

      execution.discard();

      function Behaviour({broker}) {
        return {
          execute(executeMessage) {
            broker.publish('execution', 'execute.completed', executeMessage.content);
          },
        };
      }
    });

    it('completes only once even if discard is handled by behaviour', () => {
      const activity = createActivity(Behaviour);
      const execution = ActivityExecution(activity);

      const discardMessages = [];
      activity.broker.subscribeTmp('execution', 'execute.discard', (_, msg) => {
        discardMessages.push(msg);
      }, {noAck: true});

      const completedMessages = [];
      activity.broker.subscribeTmp('execution', 'execution.#', (_, msg) => {
        completedMessages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });
      expect(execution.completed).to.be.false;

      execution.discard();

      expect(discardMessages).to.have.length(1);
      expect(completedMessages).to.have.length(1);

      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 0);

      function Behaviour({broker}) {
        return {
          execute(executeMessage) {
            broker.subscribeOnce('api', 'activity.discard.activity_1', () => {
              broker.publish('execution', 'execute.discard', {...executeMessage.content, discardedByBehaviour: true});
            }, {priority: 1000});
          },
        };
      }
    });
  });

  describe('stop()', () => {
    it('stops execution', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      const executeQ = activity.broker.getQueue('execute-q');

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });
      execution.stop();

      expect(execution.completed).to.be.false;

      expect(executeQ).to.have.property('consumerCount', 0);
      expect(executeQ).to.have.property('messageCount', 1);
    });

    it('stops sub executions', () => {
      const activity = createActivity(Behaviour);
      const execution = ActivityExecution(activity);
      let stoppedSubExecution = false;

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });
      execution.stop();

      expect(execution.completed).to.be.false;
      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 2);
      expect(activity.broker.getQueue('execute-q')).to.have.property('consumerCount', 0);

      expect(stoppedSubExecution).to.be.true;

      function Behaviour({broker}) {
        broker.subscribeOnce('api', 'activity.stop.activity_2', () => {
          stoppedSubExecution = true;
        });

        return {
          execute({content}) {
            if (!content.isRootScope) return;
            broker.publish('execution', 'execute.start', {...content, executionId: 'activity_2', isRootScope: undefined});
          },
        };
      }
    });

    it('ignored if not executing', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      execution.stop();
      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 0);
      expect(activity.broker.getQueue('execute-q')).to.have.property('consumerCount', 0);
    });

    it('ignored if completed', () => {
      const activity = createActivity(Behaviour);
      const execution = ActivityExecution(activity);

      activity.broker.subscribeTmp('execution', 'execute.discard', () => {
        throw new Error('Shouldn´t happen');
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });
      expect(execution.completed).to.be.true;

      execution.stop();

      expect(activity.broker.getQueue('execute-q')).to.have.property('messageCount', 0);
      expect(activity.broker.getQueue('execute-q')).to.have.property('consumerCount', 0);

      function Behaviour({broker}) {
        return {
          execute(executeMessage) {
            broker.publish('execution', 'execute.completed', executeMessage.content);
          },
        };
      }
    });
  });

  describe('complete', () => {
    it('forwards output and message from complete message', () => {
      const activity = createActivity(Behaviour);
      const execution = ActivityExecution(activity);

      const messages = [];
      activity.broker.subscribeOnce('execution', 'execution.completed', (_, msg) => {
        messages.push(msg);
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
          message: 0,
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0]).to.have.property('content').with.property('output', 1);
      expect(messages[0].content).to.have.property('message', 2);

      function Behaviour({broker}) {
        return {
          execute(executeMessage) {
            broker.publish('execution', 'execute.completed', {...executeMessage.content, output: 1, message: 2});
          },
        };
      }
    });

    it('forwards output and message from updated execution', () => {
      const activity = createActivity(Behaviour);
      const execution = ActivityExecution(activity);

      const messages = [];
      activity.broker.subscribeOnce('execution', 'execution.completed', (_, msg) => {
        messages.push(msg);
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0]).to.have.property('content').with.property('output', 1);
      expect(messages[0].content).to.have.property('message', 2);

      function Behaviour({broker}) {
        let rootMessage;
        return {
          execute(executeMessage) {
            if (executeMessage.content.isRootScope) {
              rootMessage = executeMessage;
              return broker.publish('execution', 'execute.start', {...executeMessage.content, isRootScope: undefined, executionId: 'activity_2'});
            }
            broker.publish('execution', 'execute.update', {...rootMessage.content, output: 1, message: 2});
            broker.publish('execution', 'execute.completed', {...executeMessage.content, isRootScope: undefined, executionId: 'activity_2'});
          },
        };
      }
    });
  });

  describe('instructions', () => {
    it('preventComplete instruction prevents execution to complete when last child execution ends', () => {
      const activity = createActivity(Behaviour);
      const execution = ActivityExecution(activity);

      const messages = [];
      activity.broker.subscribeTmp('execution', 'execute.#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      expect(execution).to.have.property('completed', false);

      activity.broker.publish('execution', 'execute.completed', messages[2].content);

      expect(execution).to.have.property('completed', false);

      activity.broker.publish('execution', 'execute.completed', messages[0].content);

      expect(execution).to.have.property('completed', true);

      function Behaviour({broker}) {
        return {
          execute(executeMessage) {
            if (!executeMessage.content.isRootScope) return;

            broker.publish('execution', 'execute.preventcomplete', {...executeMessage.content, preventComplete: true});
            broker.publish('execution', 'execute.start', {...executeMessage.content, isRootScope: undefined, executionId: 'activity_2'});
          },
        };
      }
    });

    it('ignoreIfExecuting ignores start message if already executing', () => {
      const activity = createActivity(Behaviour);
      const execution = ActivityExecution(activity);

      const messages = [];
      activity.broker.subscribeTmp('execution', 'execute.#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      activity.broker.publish('execution', 'execute.completed', messages[0].content);

      expect(execution).to.have.property('completed', true);

      function Behaviour({broker}) {
        return {
          execute(executeMessage) {
            if (executeMessage.content.ignoreIfExecuting) throw new Error('Shouldn´t have called execute');
            broker.publish('execution', 'execute.start', {...executeMessage.content, ignoreIfExecuting: true});
          },
        };
      }
    });

    it('ignoreIfExecuting ignores state change message if already executing', () => {
      const activity = createActivity(Behaviour);
      const execution = ActivityExecution(activity);

      const messages = [];
      activity.broker.subscribeTmp('execution', 'execute.#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      const eventMessages = [];
      activity.broker.subscribeTmp('event', '#', (_, msg) => {
        eventMessages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      expect(execution.getPostponed()).to.have.length(1);
      expect(execution.getPostponed()[0]).to.have.property('fields').with.property('routingKey', 'execute.start');

      expect(eventMessages).to.have.length(0);

      function Behaviour({broker}) {
        return {
          execute(executeMessage) {
            if (executeMessage.content.ignoreIfExecuting) throw new Error('Shouldn´t have called execute');
            broker.publish('execution', 'execute.wait', {...executeMessage.content, ignoreIfExecuting: true});
          },
        };
      }
    });

    it('keep instruction keeps last execution message in queue until all executions are completed', () => {
      const activity = createActivity(Behaviour);

      const execution = ActivityExecution(activity);

      const messages = [];
      activity.broker.subscribeTmp('execution', 'execute.#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      const eventMessages = [];
      activity.broker.subscribeTmp('event', '#', (_, msg) => {
        eventMessages.push(msg);
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      const executeQ = activity.broker.getQueue('execute-q');

      expect(execution.getPostponed()).to.have.length(3);
      expect(execution.getPostponed()[1]).to.have.property('content').with.property('keep', true);
      expect(execution.getPostponed()[2]).to.have.property('content').with.property('keep', true);

      activity.broker.publish('execution', 'execute.wait', execution.getPostponed()[1].content);

      expect(execution.getPostponed()).to.have.length(3);
      expect(execution.getPostponed()[1]).to.have.property('fields').with.property('routingKey', 'execute.wait');
      expect(execution.getPostponed()[1]).to.have.property('content').with.property('executionId', 'activity_2');

      activity.broker.publish('execution', 'execute.completed', execution.getPostponed()[1].content);

      expect(execution.getPostponed()).to.have.length(2);

      expect(executeQ).to.have.property('messageCount', 3);

      activity.broker.publish('execution', 'execute.completed', execution.getPostponed()[1].content);

      expect(execution.getPostponed()).to.have.length(0);

      expect(executeQ).to.have.property('messageCount', 0);

      function Behaviour({broker}) {
        return {
          execute(executeMessage) {
            if (!executeMessage.content.isRootScope) return;

            broker.publish('execution', 'execute.start', {...executeMessage.content, isRootScope: undefined, executionId: 'activity_2', keep: true});
            broker.publish('execution', 'execute.start', {...executeMessage.content, isRootScope: undefined, executionId: 'activity_3', keep: true});
          },
        };
      }
    });
  });

  describe('getState()', () => {
    it('returns expected state when executing', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);
      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      expect(execution.getState()).to.eql({completed: false});
    });

    it('returns expected state when completed', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);
      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });
      execution.getPostponed()[0].signal();

      expect(execution.getState()).to.eql({completed: true});
    });
  });

  describe('recovered', () => {
    it('redelivered execute message runs behaviour execute with redelivered start message', () => {
      const activity = createActivity(Behaviour);
      const execution = ActivityExecution(activity);

      const executeMessages = [];

      execution.execute({
        fields: {
          routingKey: 'run.execute'
        },
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      execution.stop();

      execution.execute({
        fields: {
          routingKey: 'run.execute',
          redelivered: true
        },
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      expect(executeMessages).to.have.length(2);
      expect(executeMessages[0].fields).to.have.property('routingKey', 'execute.start');
      expect(executeMessages[0].fields).to.not.have.property('redelivered');

      expect(executeMessages[1].fields).to.have.property('routingKey', 'execute.start');
      expect(executeMessages[1].fields).to.have.property('redelivered', true);

      function Behaviour() {
        return {
          execute(executeMessage) {
            executeMessages.push(executeMessage);
          },
        };
      }
    });

    it('redeliveres last execute message to behaviour execute function', () => {
      const activity = createActivity(Behaviour);
      const execution = ActivityExecution(activity);

      const executeMessages = [];
      execution.execute({
        fields: {
          routingKey: 'run.execute'
        },
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      execution.stop();

      execution.execute({
        fields: {
          routingKey: 'run.execute',
          redelivered: true,
        },
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      expect(executeMessages).to.have.length(2);

      expect(executeMessages[0].fields).to.have.property('routingKey', 'execute.start');
      expect(executeMessages[0].fields).to.not.have.property('redelivered');

      expect(executeMessages[1].fields).to.have.property('routingKey', 'execute.update');
      expect(executeMessages[1].fields).to.have.property('redelivered', true);

      function Behaviour() {
        return {
          execute(executeMessage) {
            executeMessages.push(executeMessage);
            if (executeMessage.fields.redelivered) return;
            if (executeMessage.fields.routingKey === 'execute.start') {
              activity.broker.publish('execution', 'execute.update', executeMessage.content);
            }
          },
        };
      }
    });

    it('publishes new start message if no messages where in queue', () => {
      const activity = createActivity(Behaviour);
      const execution = ActivityExecution(activity);

      const executeMessages = [];
      execution.execute({
        fields: {
          routingKey: 'run.execute'
        },
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      execution.stop();

      activity.broker.getQueue('execute-q').purge();

      execution.execute({
        fields: {
          routingKey: 'run.execute',
          redelivered: true,
        },
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
        },
      });

      expect(executeMessages).to.have.length(2);

      expect(executeMessages[0].fields).to.have.property('routingKey', 'execute.start');
      expect(executeMessages[0].fields).to.not.have.property('redelivered');

      expect(executeMessages[1].fields).to.have.property('routingKey', 'execute.start');
      expect(executeMessages[1].fields).to.not.have.property('redelivered');

      function Behaviour() {
        return {
          execute(executeMessage) {
            executeMessages.push(executeMessage);
          },
        };
      }
    });
  });

  describe('multi instance', () => {
    it('sequential loop completes when last iteration completes', () => {
      const task = createActivity(Behaviour);
      const execution = ActivityExecution(task);

      const startMessages = [];
      task.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      let completeMsg;
      task.broker.subscribeOnce('execution', 'execution.completed', (_, msg) => {
        completeMsg = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
        },
      });

      expect(startMessages).to.have.length(2);
      task.broker.publish('execution', 'execute.completed', {...startMessages.slice(-1)[0].content, output: 0});

      expect(startMessages).to.have.length(3);

      task.broker.publish('execution', 'execute.completed', {...startMessages.slice(-1)[0].content, output: 1});

      expect(startMessages).to.have.length(4);
      task.broker.publish('execution', 'execute.completed', {...startMessages.slice(-1)[0].content, output: 2});

      expect(completeMsg).to.be.ok;
      expect(completeMsg.content).to.have.property('executionId', 'activity_1');
      expect(completeMsg.content).to.have.property('output').that.eql([0, 1, 2]);

      function Behaviour(activity) {
        const loopCharacteristics = LoopCharacteristics(activity, {
          behaviour: {
            loopCardinality: 3,
            isSequential: true,
          },
        });

        return {
          execute(executeMessage) {
            if (executeMessage.content.isMultiInstance) return;
            return loopCharacteristics.execute(executeMessage);
          },
        };
      }
    });

    it('sequential loop completes when iterations completes immediately', () => {
      const task = createActivity(Behaviour);
      const execution = ActivityExecution(task);

      const startMessages = [];
      task.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      let completeMsg;
      task.broker.subscribeTmp('execution', 'execution.completed', (_, msg) => {
        completeMsg = msg;
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
        },
      });

      expect(completeMsg).to.be.ok;
      expect(completeMsg.content).to.have.property('executionId', 'activity_1');
      expect(completeMsg.content).to.have.property('output').that.eql([0, 1, 2]);

      function Behaviour(activity) {
        const loopCharacteristics = LoopCharacteristics(activity, {
          behaviour: {
            loopCardinality: 3,
            isSequential: true,
          },
        });

        return {
          execute(executeMessage) {
            if (!executeMessage.content.isRootScope) return task.broker.publish('execution', 'execute.completed', {...executeMessage.content, output: executeMessage.content.index});
            return loopCharacteristics.execute(executeMessage);
          },
        };
      }
    });

    it('parallel loop completes execution loop completes asynchronously', () => {
      const task = createActivity(Behaviour);
      const execution = ActivityExecution(task);

      const startMessages = [];
      task.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      let completeMsg;
      task.broker.subscribeOnce('execution', 'execution.completed', (_, msg) => {
        completeMsg = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
        },
      });

      expect(startMessages).to.have.length(4);

      task.broker.publish('execution', 'execute.completed', {...startMessages[2].content, output: 1});
      task.broker.publish('execution', 'execute.completed', {...startMessages[3].content, output: 2});
      task.broker.publish('execution', 'execute.completed', {...startMessages[1].content, output: 0});

      expect(completeMsg).to.be.ok;
      expect(completeMsg.content).to.have.property('executionId', 'activity_1');
      expect(completeMsg.content).to.have.property('output').that.eql([0, 1, 2]);

      function Behaviour(activity) {
        const loopCharacteristics = LoopCharacteristics(activity, {
          behaviour: {
            loopCardinality: 3,
          },
        });

        return {
          execute(executeMessage) {
            if (executeMessage.content.isMultiInstance) return;
            return loopCharacteristics.execute(executeMessage);
          },
        };
      }
    });

    it('parallel loop with just one iteration completes execution with output', () => {
      const task = createActivity(Behaviour);
      const execution = ActivityExecution(task);

      const startMessages = [];
      task.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      let completeMsg;
      task.broker.subscribeTmp('execution', 'execution.completed', (_, msg) => {
        completeMsg = msg;
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
        },
      });

      expect(startMessages).to.have.length(2);

      expect(startMessages[1].content).to.have.property('isMultiInstance', true);

      expect(completeMsg).to.be.ok;
      expect(completeMsg.content).to.have.property('executionId', startMessages[0].content.executionId);
      expect(completeMsg.content).to.have.property('output').that.eql([0]);

      function Behaviour(activity) {
        const loopCharacteristics = LoopCharacteristics(activity, {
          behaviour: {
            loopCardinality: 1,
          },
        });

        return {
          execute(executeMessage) {
            if (executeMessage.content.isMultiInstance) {
              return task.broker.publish('execution', 'execute.completed', {...executeMessage.content, output: executeMessage.content.index});
            }

            return loopCharacteristics.execute(executeMessage);
          },
        };
      }
    });

    it('parallel loop completes execution loop completes synchronously', () => {
      const task = createActivity(Behaviour);
      const execution = ActivityExecution(task);

      const startMessages = [];
      task.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      let completeMsg;
      task.broker.subscribeOnce('execution', 'execution.completed', (_, msg) => {
        completeMsg = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
        },
      });

      expect(startMessages).to.have.length(4);

      expect(startMessages[1].content).to.have.property('isMultiInstance', true);
      expect(startMessages[2].content).to.have.property('isMultiInstance', true);
      expect(startMessages[3].content).to.have.property('isMultiInstance', true);

      expect(completeMsg).to.be.ok;
      expect(completeMsg.content).to.have.property('executionId', 'activity_1');
      expect(completeMsg.content).to.have.property('output').that.eql([0, 1, 2]);

      function Behaviour(activity) {
        const loopCharacteristics = LoopCharacteristics(activity, {
          behaviour: {
            loopCardinality: 3,
          },
        });

        return {
          execute(executeMessage) {
            if (executeMessage.content.isMultiInstance) {
              return task.broker.publish('execution', 'execute.completed', {...executeMessage.content, output: executeMessage.content.index});
            }

            return loopCharacteristics.execute(executeMessage);
          },
        };
      }
    });

    it('iteration error discards iterations and discards execution', () => {
      const task = createActivity(Behaviour);
      const execution = ActivityExecution(task);

      const startMessages = [];
      task.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      const discardMessages = [];
      task.broker.subscribeTmp('api', 'activity.discard.*', (_, msg) => {
        discardMessages.push(msg);
      }, {noAck: true});

      let errorMsg;
      task.broker.subscribeOnce('execution', 'execution.error', (_, msg) => {
        errorMsg = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
        },
      });

      expect(startMessages).to.have.length(4);
      expect(discardMessages).to.have.length(2);

      expect(discardMessages[0].content).to.have.property('executionId', 'activity_1');
      expect(discardMessages[1].content).to.have.property('executionId', 'activity_1_2');

      expect(errorMsg).to.be.ok;
      expect(errorMsg.content).to.have.property('executionId', startMessages[2].content.executionId);
      expect(errorMsg.content).to.have.property('error').that.eql({message: 'Error'});

      expect(task.broker.getQueue('execute-q')).to.have.property('consumerCount', 0);
      expect(task.broker.getQueue('execute-q')).to.have.property('messageCount', 0);

      function Behaviour(activity) {
        const loopCharacteristics = LoopCharacteristics(activity, {
          behaviour: {
            loopCardinality: 3,
          },
        });

        return {
          execute(executeMessage) {
            if (executeMessage.content.isMultiInstance) {
              if (executeMessage.content.index === 1) {
                return task.broker.publish('execution', 'execute.error', {...executeMessage.content, error: {message: 'Error'}});
              }
              return task.broker.publish('execution', 'execute.completed', {...executeMessage.content, output: executeMessage.content.index});
            }

            return loopCharacteristics.execute(executeMessage);
          },
        };
      }
    });

    it('all iterations discarded discards execution', () => {
      const task = createActivity(Behaviour);
      const execution = ActivityExecution(task);

      const startMessages = [];
      task.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      const discardMessages = [];
      task.broker.subscribeTmp('execution', 'execute.discard', (_, msg) => {
        discardMessages.push(msg);
      }, {noAck: true});

      let discardMsg;
      task.broker.subscribeOnce('execution', 'execution.discard', (_, msg) => {
        discardMsg = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
        },
      });

      expect(startMessages).to.have.length(4);
      expect(discardMessages).to.have.length(4);

      expect(discardMsg).to.be.ok;
      expect(discardMsg.content).to.have.property('executionId', startMessages[0].content.executionId);

      expect(task.broker.getQueue('execute-q')).to.have.property('consumerCount', 0);
      expect(task.broker.getQueue('execute-q')).to.have.property('messageCount', 0);

      function Behaviour(activity) {
        const loopCharacteristics = LoopCharacteristics(activity, {
          behaviour: {
            loopCardinality: 3,
          },
        });

        return {
          execute(executeMessage) {
            if (executeMessage.content.isMultiInstance) {
              return task.broker.publish('execution', 'execute.discard', {...executeMessage.content});
            }

            return loopCharacteristics.execute(executeMessage);
          },
        };
      }
    });

    it('last iteration canceled completes execution', () => {
      const task = createActivity(Behaviour);
      const execution = ActivityExecution(task);

      const startMessages = [];
      task.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      let completeMsg;
      task.broker.subscribeOnce('execution', 'execution.completed', (_, msg) => {
        completeMsg = msg;
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
        },
      });

      expect(startMessages).to.have.length(4);

      expect(startMessages[1].content).to.have.property('isMultiInstance', true);
      expect(startMessages[2].content).to.have.property('isMultiInstance', true);
      expect(startMessages[3].content).to.have.property('isMultiInstance', true);

      expect(completeMsg).to.be.ok;
      expect(completeMsg.content).to.have.property('executionId', startMessages[0].content.executionId);
      expect(completeMsg.content).to.have.property('output').that.eql([0, 1]);

      function Behaviour(activity) {
        const loopCharacteristics = LoopCharacteristics(activity, {
          behaviour: {
            loopCardinality: 3,
          },
        });

        return {
          execute(executeMessage) {
            if (executeMessage.content.isMultiInstance) {
              if (executeMessage.content.index === 2) {
                return task.broker.publish('execution', 'execute.cancel', {...executeMessage.content});
              }
              return task.broker.publish('execution', 'execute.completed', {...executeMessage.content, output: executeMessage.content.index});
            }

            return loopCharacteristics.execute(executeMessage);
          },
        };
      }
    });

    it('stop in the middle of parallel loop start keeps start messages', () => {
      const task = createActivity(Behaviour);
      const execution = ActivityExecution(task);

      task.broker.subscribeOnce('event', 'activity.wait', () => {
        task.broker.publish('api', 'activity.stop.activity_1');
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
        },
      });

      expect(task.broker.getQueue('execute-q')).to.have.property('messageCount', 4);

      const executeQ = task.broker.getQueue('execute-q');
      expect(executeQ.messages[0].content).to.have.property('isRootScope', true);
      expect(executeQ.messages[1].content).to.have.property('isMultiInstance', true);
      expect(executeQ.messages[2].content).to.have.property('isMultiInstance', true);
      expect(executeQ.messages[3].content).to.have.property('isMultiInstance', true);

      function Behaviour(activity) {
        const loopCharacteristics = LoopCharacteristics(activity, {
          behaviour: {
            loopCardinality: 3,
          },
        });

        return {
          execute(executeMessage) {
            const content = executeMessage.content;
            if (loopCharacteristics && (content.isRootScope || content.isPlaceholder)) {
              return loopCharacteristics.execute(executeMessage);
            }

            return task.broker.publish('event', 'activity.wait', {...executeMessage.content});
          },
        };
      }
    });

    it('recover in the middle of parallel loop recovers start messages', () => {
      const task = createActivity(Behaviour);
      const execution = ActivityExecution(task);

      task.broker.subscribeOnce('event', 'activity.wait', () => {
        task.broker.publish('api', 'activity.stop.activity_1');
      });

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
        },
      });

      expect(task.broker.getQueue('execute-q')).to.have.property('messageCount', 4);

      const executeQ = task.broker.getQueue('execute-q');
      expect(executeQ.messages[0].content).to.have.property('isRootScope', true);
      expect(executeQ.messages[1].content).to.have.property('isMultiInstance', true);
      expect(executeQ.messages[2].content).to.have.property('isMultiInstance', true);
      expect(executeQ.messages[3].content).to.have.property('isMultiInstance', true);

      function Behaviour(activity) {
        const loopCharacteristics = LoopCharacteristics(activity, {
          behaviour: {
            loopCardinality: 3,
          },
        });

        return {
          execute(executeMessage) {
            const content = executeMessage.content;
            if (loopCharacteristics && (content.isRootScope || content.isPlaceholder)) {
              return loopCharacteristics.execute(executeMessage);
            }

            return task.broker.publish('event', 'activity.wait', {...executeMessage.content});
          },
        };
      }
    });
  });

  describe('event definitions', () => {
    it('execution completes when event definition completes', () => {
      const task = createActivity(Behaviour);
      const execution = ActivityExecution(task);

      const startMessages = [];
      task.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      let completeMsg;
      task.broker.subscribeTmp('execution', 'execution.completed', (_, msg) => {
        completeMsg = msg;
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'event',
          executionId: 'activity_1',
          parent: {
            id: 'theProcess',
          },
        },
      });

      expect(startMessages).to.have.length(2);
      expect(startMessages[0].content).to.have.property('isRootScope', true);

      expect(startMessages[1].content).to.have.property('isRootScope', undefined);
      expect(startMessages[1].content).to.have.property('isDefinitionScope', true);

      task.broker.publish('execution', 'execute.completed', {...startMessages[1].content, output: 4});

      expect(completeMsg).to.be.ok;

      expect(completeMsg.content).to.have.property('executionId', 'activity_1');
      expect(completeMsg.content).to.have.property('output').that.eql(4);

      function Behaviour(activity) {
        const eventDefinitionExecution = EventDefinitionExecution(activity, [{
          type: 'messageeventdef',
          execute() {},
        }]);

        return {
          execute(executeMessage) {
            return eventDefinitionExecution.execute(executeMessage);
          },
        };
      }
    });

    it('execution completes when first event definition completes', () => {
      const task = createActivity(Behaviour);
      const execution = ActivityExecution(task);

      const startMessages = [];
      task.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      let completeMsg;
      task.broker.subscribeTmp('execution', 'execution.completed', (_, msg) => {
        completeMsg = msg;
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'event',
          executionId: 'activity_1',
          parent: {
            id: 'theProcess',
          },
        },
      });

      expect(startMessages).to.have.length(3);
      expect(startMessages[0].content).to.have.property('isRootScope', true);

      expect(startMessages[1].content).to.have.property('isRootScope', undefined);
      expect(startMessages[1].content).to.have.property('isDefinitionScope', true);

      expect(startMessages[2].content).to.have.property('isRootScope', undefined);
      expect(startMessages[2].content).to.have.property('isDefinitionScope', true);

      task.broker.publish('execution', 'execute.completed', {...startMessages[2].content, output: 4});

      expect(completeMsg).to.be.ok;

      expect(completeMsg.content).to.have.property('executionId', 'activity_1');
      expect(completeMsg.content).to.have.property('output').that.eql(4);

      function Behaviour(activity) {
        const eventDefinitionExecution = EventDefinitionExecution(activity, [{
          type: 'messageeventdef1',
          execute() {},
        }, {
          type: 'messageeventdef2',
          execute() {},
        }]);

        return {
          execute(executeMessage) {
            return eventDefinitionExecution.execute(executeMessage);
          },
        };
      }
    });

    it('forwards output and message from completed event definition', () => {
      const task = createActivity(Behaviour);
      const execution = ActivityExecution(task);

      const startMessages = [];
      task.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        startMessages.push(msg);
      }, {noAck: true});

      let completeMsg;
      task.broker.subscribeTmp('execution', 'execution.completed', (_, msg) => {
        completeMsg = msg;
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'event',
          executionId: 'activity_1',
          message: 3,
          parent: {
            id: 'theProcess',
          },
        },
      });

      expect(startMessages).to.have.length(3);
      expect(startMessages[0].content).to.have.property('isRootScope', true);

      expect(startMessages[1].content).to.have.property('isRootScope', undefined);
      expect(startMessages[1].content).to.have.property('isDefinitionScope', true);

      expect(startMessages[2].content).to.have.property('isRootScope', undefined);
      expect(startMessages[2].content).to.have.property('isDefinitionScope', true);

      task.broker.publish('execution', 'execute.completed', {...startMessages[2].content, output: 4, message: 5});

      expect(completeMsg).to.be.ok;

      expect(completeMsg.content).to.have.property('executionId', 'activity_1');
      expect(completeMsg.content).to.have.property('output').that.eql(4);
      expect(completeMsg.content).to.have.property('message').that.eql(5);

      function Behaviour(activity) {
        const eventDefinitionExecution = EventDefinitionExecution(activity, [{
          type: 'messageeventdef1',
          execute() {},
        }, {
          type: 'messageeventdef2',
          execute() {},
        }]);

        return {
          execute(executeMessage) {
            return eventDefinitionExecution.execute(executeMessage);
          },
        };
      }
    });
  });

  describe('getApi()', () => {
    it('called without message returns api for root scope', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
          parent: {
            id: 'theProcess',
          },
        },
      });
      expect(execution.getApi().content).to.eql({
        id: 'activity',
        type: 'task',
        executionId: 'activity_1',
        state: 'start',
        isRootScope: true,
        parent: {
          id: 'theProcess',
        },
      });
    });

    it('called with message returns api for message scope', () => {
      const activity = createActivity();
      const execution = ActivityExecution(activity);

      execution.execute({
        fields: {},
        content: {
          id: 'activity',
          type: 'task',
          executionId: 'activity_1',
          state: 'start',
          parent: {
            id: 'theProcess',
          },
        },
      });
      expect(execution.getApi({
        content: {
          executionId: 'activity_2',
        },
      }).content).to.eql({
        executionId: 'activity_2',
      });
    });

    describe('getExecuting()', () => {
      it('returns list of apis except the current one', () => {
        const activity = createActivity();
        const execution = ActivityExecution(activity);

        const startMessages = [];
        activity.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
          startMessages.push(msg);
        }, {noAck: true});

        execution.execute({
          fields: {},
          content: {
            id: 'activity',
            type: 'task',
            executionId: 'activity_1',
          },
        });

        activity.broker.publish('execution', 'execute.loop.iterate', {
          id: 'activity',
          type: 'task',
        });

        const api = execution.getApi();
        expect(api.content).to.have.property('isRootScope', true);

        expect(api.getExecuting().length).to.equal(1);

        const subApi = api.getExecuting()[0];
        expect(subApi.content.isRootScope).to.be.undefined;
        expect(subApi.getExecuting().length).to.equal(1);
        expect(subApi.getExecuting()[0].content).to.have.property('isRootScope', true);
      });
    });
  });
});

function createActivity(Behaviour) {
  const environment = Environment({
    Logger,
  });

  return Activity(Behaviour || ActivityBehaviour, {
    id: 'activity',
    type: 'task',
    parent: {
      id: 'process1',
      type: 'process'
    }
  }, {
    environment,
    getInboundSequenceFlows() {
      return [SequenceFlow({id: 'flow', sourceId: 'task', targetId: 'end', parent: {id: 'process1'}}, {environment})];
    },
    getOutboundSequenceFlows() {
      return [];
    },
    loadExtensions() {},
  });

  function ActivityBehaviour({broker}) {
    return {
      execute() {
        broker.subscribeOnce('api', 'activity.signal.*', (_, {content}) => {
          broker.publish('execution', 'execute.completed', {...content, output: content.message, state: 'signaled'});
        });
      },
    };
  }
}
