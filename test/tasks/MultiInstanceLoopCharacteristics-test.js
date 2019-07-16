import Environment from '../../src/Environment';
import MultiInstanceLoopCharacteristics from '../../src/tasks/MultiInstanceLoopCharacteristics';
import {ActivityBroker} from '../../src/EventBroker';
import {Logger} from '../helpers/testHelpers';

describe('MultiInstanceLoopCharacteristics', () => {
  let task;
  beforeEach(() => {
    task = ActivityBroker();
    task.id = 'task';
    task.environment = Environment({Logger});
    task.broker.assertQueue('execute-q');
    task.broker.bindQueue('execute-q', 'execution', '#');
  });

  describe('ctorish(activity, loopCharacteristics)', () => {
    it('returns loop characteristics api with execute function', () => {
      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          loopCardinality: 3,
          isSequential: true,
          collection: '${environment.variables.list}',
          elementVariable: 'testitem',
        },
      });

      expect(loop).to.have.property('isSequential', true);
      expect(loop).to.have.property('loopCardinality', 3);
      expect(loop).to.have.property('collection', '${environment.variables.list}');
      expect(loop).to.have.property('elementVariable', 'testitem');
      expect(loop).to.have.property('execute').that.is.a('function');
    });

    it('returns NO loop characteristics if collection and cardinality is absent', () => {
      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          isSequential: true,
        },
      });

      expect(loop).to.not.be.ok;
    });

    it('empty behaviour is ok and returns no characteristics', () => {
      const loop = MultiInstanceLoopCharacteristics(task, {});
      expect(loop).to.not.be.ok;
    });
  });

  describe('execute(executeMessage)', () => {
    it('throws if executeMessage is missing', () => {
      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          loopCardinality: 3,
          isSequential: true,
        },
      });

      expect(loop.execute).to.throw(/requires message/);
    });

    it('publishes error on activity broker if loopCardinality is not a number', (done) => {
      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          loopCardinality: '3 pcs',
          isSequential: true,
        },
      });

      task.once('error', (err) => {
        expect(err).to.match(/loopCardinality is not a Number/i);
        done();
      });

      loop.execute({
        content: {
          isRootScope: true,
          executionId: 'parent-execution-id',
        },
      });
    });
  });

  describe('sequential (isSequential = true)', () => {
    it('updates start message with loop characteristics when loop is started', () => {
      const messages = [];
      task.broker.subscribeTmp('execution', '#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          loopCardinality: 3,
          isSequential: true,
        },
      });

      loop.execute({
        content: {
          isRootScope: true,
          executionId: 'parent-execution-id',
        },
      });

      expect(messages).to.have.length(2);

      expect(messages[0].fields).to.have.property('routingKey', 'execute.iteration.next');
      expect(messages[0].content).to.have.property('isRootScope', true);
      expect(messages[0].content).to.have.property('executionId', 'parent-execution-id');
      expect(messages[0].content).to.have.property('loopCardinality', 3);
      expect(messages[0].content).to.have.property('isSequential', true);
      expect(messages[0].content).to.have.property('index', 0);

      expect(messages[1].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[1].content).to.have.property('isRootScope', undefined);
      expect(messages[1].content).to.have.property('executionId').that.is.not.equal('parent-execution-id');
      expect(messages[1].content).to.have.property('index', 0);
    });

    it('instructs execution to not complete when completed sub execution message is received', () => {
      const messages = [];
      task.broker.subscribeTmp('execution', '#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          loopCardinality: 3,
          isSequential: true,
        },
      });

      loop.execute({
        content: {
          isRootScope: true,
          executionId: 'parent-execution-id',
        },
      });

      expect(messages[0].fields).to.have.property('routingKey', 'execute.iteration.next');
      expect(messages[0].content).to.have.property('isRootScope', true);
      expect(messages[0].content).to.have.property('executionId', 'parent-execution-id');
      expect(messages[0].content).to.have.property('preventComplete', true);
    });

    it('publishes start messages for first multi-instance execution with unique execution id', () => {
      const messages = [];
      task.broker.subscribeTmp('execution', '#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          isSequential: true,
          loopCardinality: 3,
        },
      });

      loop.execute({
        content: {
          id: 'task',
          type: 'bpmn:Task',
          executionId: 'parent-execution-id',
          isRootScope: true,
          parent: {
            id: 'process1',
            executionId: 'process1_1',
            type: 'bpmn:Process',
          },
        },
      });

      expect(messages).to.have.length(2);

      expect(messages[1].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[1].content).to.have.property('executionId').that.is.not.equal('parent-execution-id');
      expect(messages[1].content.isRootScope).to.be.undefined;
      expect(messages[1].content).to.have.property('index', 0);
      expect(messages[1].content).to.have.property('parent').that.eql({
        id: 'task',
        type: 'bpmn:Task',
        executionId: 'parent-execution-id',
        path: [{
          id: 'process1',
          executionId: 'process1_1',
          type: 'bpmn:Process',
        }],
      });
    });

    it('starts next and updates start message output when first has completed', () => {
      const messages = [];
      task.broker.subscribeTmp('execution', '#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          isSequential: true,
          loopCardinality: 3,
        },
      });

      loop.execute({
        content: {
          isRootScope: true,
          executionId: 'parent-execution-id',
        },
      });

      expect(messages).to.have.length(2);

      task.broker.publish('execution', 'execute.completed', {...messages.slice(-1)[0].content, output: 0});

      expect(messages).to.have.length(6);

      expect(messages[3].fields).to.have.property('routingKey', 'execute.iteration.completed');
      expect(messages[3].content).to.have.property('isRootScope', true);
      expect(messages[3].content).to.have.property('executionId', 'parent-execution-id');
      expect(messages[3].content).to.have.property('loopCardinality', 3);
      expect(messages[3].content).to.have.property('isSequential', true);
      expect(messages[3].content).to.have.property('index', 0);
      expect(messages[3].content).to.have.property('output').that.eql([0]);

      expect(messages[4].fields).to.have.property('routingKey', 'execute.iteration.next');
      expect(messages[4].content).to.have.property('isRootScope', true);
      expect(messages[4].content).to.have.property('executionId', 'parent-execution-id');
      expect(messages[4].content).to.have.property('loopCardinality', 3);
      expect(messages[4].content).to.have.property('isSequential', true);
      expect(messages[4].content).to.have.property('index', 1);
      expect(messages[4].content).to.have.property('output').that.eql([0]);

      expect(messages[5].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[5].content).to.have.property('index', 1);
      expect(messages[5].content.isRootScope).to.be.undefined;
    });

    it('publishes complete message when all have completed', () => {
      const messages = [];
      task.broker.subscribeTmp('execution', '#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          isSequential: true,
          loopCardinality: 3,
        },
      });

      loop.execute({
        content: {
          isRootScope: true,
          executionId: 'parent-execution-id',
        },
      });

      expect(messages).to.have.length(2);
      task.broker.publish('execution', 'execute.completed', {...messages.slice(-1)[0].content, output: 0});
      expect(messages).to.have.length(6);
      task.broker.publish('execution', 'execute.completed', {...messages.slice(-1)[0].content, output: 1});
      expect(messages).to.have.length(10);
      task.broker.publish('execution', 'execute.completed', {...messages.slice(-1)[0].content, output: 2});
      expect(messages).to.have.length(13);

      expect(messages[12].fields).to.have.property('routingKey', 'execute.completed');
      expect(messages[12].content).to.have.property('isRootScope', true);
      expect(messages[12].content).to.have.property('executionId', 'parent-execution-id');
      expect(messages[12].content).to.have.property('loopCardinality', 3);
      expect(messages[12].content).to.have.property('isSequential', true);
      expect(messages[12].content).to.have.property('index', 2);
      expect(messages[12].content).to.have.property('output').that.eql([0, 1, 2]);
    });

    it('completes when iteration completes synchronously', () => {
      const messages = [];
      task.broker.subscribeTmp('execution', '#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      task.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        task.broker.publish('execution', 'execute.completed', {...msg.content});
      }, {noAck: true});

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          isSequential: true,
          loopCardinality: 3,
        },
      });

      loop.execute({
        content: {
          isRootScope: true,
          executionId: 'parent-execution-id',
        },
      });

      expect(messages).to.have.length(13);

      expect(messages[12].fields).to.have.property('routingKey', 'execute.completed');
      expect(messages[12].content).to.have.property('isRootScope', true);
      expect(messages[12].content).to.have.property('executionId', 'parent-execution-id');
      expect(messages[12].content).to.have.property('loopCardinality', 3);
      expect(messages[12].content).to.have.property('isSequential', true);
      expect(messages[12].content).to.have.property('index', 2);
    });

    it('leaves no lingering consumers when completed', () => {
      const startConsumer = task.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        task.broker.publish('execution', 'execute.completed', {...msg.content});
      }, {noAck: true});

      let completeMsg;
      task.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        if (msg.content.isRootScope) {
          completeMsg = msg;
          task.broker.cancel('completed-consumer');
        }
      }, {noAck: true, consumerTag: 'completed-consumer'});

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          isSequential: true,
          loopCardinality: 3,
        },
      });

      loop.execute({
        content: {
          isRootScope: true,
          executionId: 'parent-execution-id',
        },
      });

      startConsumer.cancel();

      expect(completeMsg).to.be.ok;

      expect(task.broker).to.have.property('consumerCount', 0);
    });

    it('publishes start message for all items in collection', () => {
      const messages = [];
      task.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        messages.push(msg);
        task.broker.publish('execution', 'execute.completed', {...msg.content});
      }, {noAck: true});

      task.environment.variables.items = ['item 1', 'item 2', 'item 3', 'item 4'];

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          isSequential: true,
          loopCardinality: 10,
          collection: '${environment.variables.items}',
        },
      });

      loop.execute({
        content: {
          isRootScope: true,
          executionId: 'parent-execution-id',
        },
      });

      expect(messages).to.have.length(4);

      expect(messages[0].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[0].content).to.have.property('executionId').that.is.not.equal('parent-execution-id');
      expect(messages[0].content).to.have.property('index', 0);
      expect(messages[0].content).to.have.property('item', 'item 1');

      expect(messages[1].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[1].content).to.have.property('executionId').that.is.not.equal('parent-execution-id');
      expect(messages[1].content).to.have.property('index', 1);
      expect(messages[1].content).to.have.property('item', 'item 2');

      expect(messages[2].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[2].content).to.have.property('executionId').that.is.not.equal('parent-execution-id');
      expect(messages[2].content).to.have.property('index', 2);
      expect(messages[2].content).to.have.property('item', 'item 3');

      expect(messages[3].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[3].content).to.have.property('executionId').that.is.not.equal('parent-execution-id');
      expect(messages[3].content).to.have.property('index', 3);
      expect(messages[3].content).to.have.property('item', 'item 4');
    });

    it('executes next until completion condition is met', () => {
      const messages = [];
      task.broker.subscribeTmp('execution', '#', (routingKey, msg) => {
        messages.push(msg);
        if (routingKey === 'execute.start' && !msg.content.isRootScope) {
          task.broker.publish('execution', 'execute.completed', {...msg.content, output: {stopLoop: msg.content.index === 1}});
        }
      }, {noAck: true});

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          isSequential: true,
          loopCardinality: 3,
          completionCondition: '${content.output.stopLoop}',
        },
      });

      loop.execute({
        content: {
          isRootScope: true,
          executionId: 'parent-execution-id',
        },
      });

      expect(messages).to.have.length(9);

      expect(messages[8].fields).to.have.property('routingKey', 'execute.completed');
      expect(messages[8].content).to.have.property('isRootScope', true);
      expect(messages[8].content).to.have.property('executionId', 'parent-execution-id');
      expect(messages[8].content).to.have.property('loopCardinality', 3);
      expect(messages[8].content).to.have.property('isSequential', true);
      expect(messages[8].content).to.have.property('index', 1);
      expect(messages[8].content).to.have.property('output').that.eql([{stopLoop: false}, {stopLoop: true}]);
    });

    it('root api stop message drops consumers', () => {
      task.environment.variables.items = ['item 1', 'item 2', 'item 3', 'item 4'];

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          isSequential: true,
          collection: '${environment.variables.items}',
        },
      });

      loop.execute({
        content: {
          isRootScope: true,
          executionId: 'parent-execution-id',
        },
      });

      task.broker.publish('api', 'activity.stop.parent-execution-id', {}, {type: 'stop'});

      expect(task.broker.consumerCount).to.equal(0);
    });

    describe('recovered', () => {
      it('recovered execute start message triggers start iteration', () => {
        const messages = [];
        task.broker.subscribeTmp('execution', '#', (_, msg) => {
          messages.push(msg);
        }, {noAck: true});

        const loop = MultiInstanceLoopCharacteristics(task, {
          behaviour: {
            isSequential: true,
            loopCardinality: 3,
          },
        });

        loop.execute({
          fields: {
            routingKey: 'execute.start',
            redelivered: true,
          },
          content: {
            isRootScope: true,
            executionId: 'recovered-parent-id',
          },
        });

        expect(messages).to.have.length(2);

        expect(messages[0].fields).to.have.property('routingKey', 'execute.iteration.next');
        expect(messages[0].content).to.have.property('isRootScope', true);
        expect(messages[0].content).to.have.property('executionId', 'recovered-parent-id');
        expect(messages[0].content).to.have.property('loopCardinality', 3);
        expect(messages[0].content).to.have.property('isSequential', true);
        expect(messages[0].content).to.have.property('index', 0);

        expect(messages[1].fields).to.have.property('routingKey', 'execute.start');
        expect(messages[1].content.isRootScope).to.not.be.ok;
        expect(messages[1].content).to.have.property('executionId', 'recovered-parent-id_0');
        expect(messages[1].content).to.have.property('index', 0);
      });

      it('recovered root iteration placeholder message triggers start iteration', () => {
        const messages = [];
        task.broker.subscribeTmp('execution', '#', (_, msg) => {
          messages.push(msg);
        }, {noAck: true});

        const loop = MultiInstanceLoopCharacteristics(task, {
          behaviour: {
            isSequential: true,
            loopCardinality: 3,
          },
        });

        loop.execute({
          fields: {
            routingKey: 'execute.iteration.next',
            redelivered: true,
          },
          content: {
            isRootScope: true,
            executionId: 'recovered-parent-id',
            index: 2,
          },
        });

        expect(messages).to.have.length(2);

        expect(messages[0].fields).to.have.property('routingKey', 'execute.iteration.next');
        expect(messages[0].content).to.have.property('executionId', 'recovered-parent-id');
        expect(messages[0].content).to.have.property('isRootScope', true);
        expect(messages[0].content).to.have.property('index', 2);

        expect(messages[1].fields).to.have.property('routingKey', 'execute.start');
        expect(messages[1].content).to.have.property('executionId', 'recovered-parent-id_2');
        expect(messages[1].content.isRootScope).to.not.be.ok;
        expect(messages[1].content).to.have.property('index', 2);
      });

      it('resume loop message instructs execution to ignore message if executing', () => {
        const messages = [];
        task.broker.subscribeTmp('execution', '#', (_, msg) => {
          messages.push(msg);
        }, {noAck: true});

        const loop = MultiInstanceLoopCharacteristics(task, {
          behaviour: {
            isSequential: true,
            loopCardinality: 3,
          },
        });

        loop.execute({
          fields: {
            routingKey: 'execute.iteration.next',
            redelivered: true,
          },
          content: {
            isRootScope: true,
            executionId: 'recovered-parent-id',
            index: 2,
          },
        });

        expect(messages).to.have.length(2);

        expect(messages[0].fields).to.have.property('routingKey', 'execute.iteration.next');
        expect(messages[0].content.isRootScope).to.be.true;
        expect(messages[0].content).to.have.property('index', 2);

        expect(messages[1].fields).to.have.property('routingKey', 'execute.start');
        expect(messages[1].content).to.have.property('index', 2);
        expect(messages[1].content.isRootScope).to.be.undefined;
      });

      it('resumes execution when iteration execution completes', () => {
        const messages = [];
        task.broker.subscribeTmp('execution', '#', (_, msg) => {
          messages.push(msg);
        }, {noAck: true});

        const loop = MultiInstanceLoopCharacteristics(task, {
          behaviour: {
            isSequential: true,
            loopCardinality: 3,
          },
        });

        loop.execute({
          fields: {
            routingKey: 'execute.iteration.next',
            redelivered: true,
          },
          content: {
            isRootScope: true,
            executionId: 'recovered-parent-id',
            loopCardinality: 3,
            index: 1,
            output: [0],
          },
        });

        task.broker.publish('execution', 'execute.completed', {
          isMultiInstance: true,
          index: 1,
          executionId: 'recovered-execution-id',
          output: 1,
        });

        expect(messages).to.have.length(6);

        expect(messages[3].fields).to.have.property('routingKey', 'execute.iteration.completed');
        expect(messages[3].content).to.have.property('executionId', 'recovered-parent-id');
        expect(messages[3].content).to.have.property('isRootScope', true);
        expect(messages[3].content).to.have.property('index', 1);
        expect(messages[3].content).to.have.property('loopCardinality', 3);
        expect(messages[3].content).to.have.property('output').that.eql([0, 1]);

        expect(messages[4].fields).to.have.property('routingKey', 'execute.iteration.next');
        expect(messages[4].content).to.have.property('executionId', 'recovered-parent-id');
        expect(messages[4].content).to.have.property('isRootScope', true);
        expect(messages[4].content).to.have.property('index', 2);
        expect(messages[4].content).to.have.property('loopCardinality', 3);
        expect(messages[4].content).to.have.property('output').that.eql([0, 1]);

        expect(messages[5].fields).to.have.property('routingKey', 'execute.start');
        expect(messages[5].content).to.have.property('executionId').that.is.not.equal('parent-execution-id');
        expect(messages[5].content).to.have.property('index', 2);
        expect(messages[5].content).to.have.property('loopCardinality', 3);
        expect(messages[5].content.isRootScope).to.be.undefined;
      });
    });
  });

  describe('parallel (isSequential = false)', () => {
    it('publishes start messages for all multi-instance executions with unique execution ids', () => {
      const messages = [];
      task.broker.subscribeTmp('execution', '#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          loopCardinality: 3,
        },
      });

      loop.execute({
        content: {
          id: 'task',
          type: 'bpmn:Task',
          executionId: 'parent-execution-id',
          isRootScope: true,
          parent: {
            id: 'process1',
            executionId: 'process1_1',
            type: 'bpmn:Process',
          },
        },
      });

      expect(messages).to.have.length(3);

      expect(messages[0].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[0].content).to.have.property('executionId').that.is.not.equal('parent-execution-id');
      expect(messages[0].content).to.have.property('index', 0);
      expect(messages[0].content).to.have.property('parent').that.eql({
        id: 'task',
        type: 'bpmn:Task',
        executionId: 'parent-execution-id',
        path: [{
          id: 'process1',
          executionId: 'process1_1',
          type: 'bpmn:Process',
        }],
      });

      expect(messages[1].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[1].content).to.have.property('executionId').that.is.not.equal('parent-execution-id');
      expect(messages[1].content).to.have.property('index', 1);
      expect(messages[1].content).to.have.property('parent').that.eql({
        id: 'task',
        type: 'bpmn:Task',
        executionId: 'parent-execution-id',
        path: [{
          id: 'process1',
          executionId: 'process1_1',
          type: 'bpmn:Process',
        }],
      });

      expect(messages[2].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[2].content).to.have.property('executionId').that.is.not.equal('parent-execution-id');
      expect(messages[2].content).to.have.property('index', 2);
      expect(messages[2].content).to.have.property('parent').that.eql({
        id: 'task',
        type: 'bpmn:Task',
        executionId: 'parent-execution-id',
        path: [{
          id: 'process1',
          executionId: 'process1_1',
          type: 'bpmn:Process',
        }],
      });
    });

    it('publishes start messages for all items in collection', () => {
      const messages = [];
      task.broker.subscribeTmp('execution', '#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      task.environment.variables.items = ['item 1', 'item 2', 'item 3', 'item 4'];

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          collection: '${environment.variables.items}',
        },
      });

      loop.execute({
        content: {
          isRootScope: true,
          executionId: 'parent-execution-id',
        },
      });

      expect(messages).to.have.length(4);

      expect(messages[0].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[0].content).to.have.property('executionId').that.is.not.equal('parent-execution-id');
      expect(messages[0].content).to.have.property('index', 0);
      expect(messages[0].content).to.have.property('item', 'item 1');

      expect(messages[1].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[1].content).to.have.property('executionId').that.is.not.equal('parent-execution-id');
      expect(messages[1].content).to.have.property('index', 1);
      expect(messages[1].content).to.have.property('item', 'item 2');

      expect(messages[2].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[2].content).to.have.property('executionId').that.is.not.equal('parent-execution-id');
      expect(messages[2].content).to.have.property('index', 2);
      expect(messages[2].content).to.have.property('item', 'item 3');

      expect(messages[3].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[3].content).to.have.property('executionId').that.is.not.equal('parent-execution-id');
      expect(messages[3].content).to.have.property('index', 3);
      expect(messages[3].content).to.have.property('item', 'item 4');
    });

    it('instructs execution to keep iteration start messages', () => {
      const messages = [];
      task.broker.subscribeTmp('execution', '#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          loopCardinality: 3,
        },
      });

      loop.execute({
        content: {
          id: 'task',
          type: 'bpmn:Task',
          executionId: 'parent-execution-id',
          isRootScope: true,
          parent: {
            id: 'process1',
            executionId: 'process1_1',
            type: 'bpmn:Process',
          },
        },
      });

      expect(messages).to.have.length(3);

      expect(messages[0].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[0].content).to.have.property('keep', true);
      expect(messages[1].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[1].content).to.have.property('keep', true);
      expect(messages[2].fields).to.have.property('routingKey', 'execute.start');
      expect(messages[2].content).to.have.property('keep', true);
    });

    it('updates start message output when first has completed', () => {
      const messages = [];
      task.broker.subscribeTmp('execution', '#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          loopCardinality: 3,
        },
      });

      loop.execute({
        content: {
          isRootScope: true,
          executionId: 'parent-execution-id',
        },
      });

      expect(messages).to.have.length(3);

      task.broker.publish('execution', 'execute.completed', {...messages[0].content, output: 0});

      expect(messages).to.have.length(5);

      expect(messages[4].fields).to.have.property('routingKey', 'execute.iteration.completed');
      expect(messages[4].content).to.have.property('executionId', 'parent-execution-id');
      expect(messages[4].content).to.have.property('index', 0);
      expect(messages[4].content).to.have.property('output').that.eql([0]);
    });

    it('executes until completion condition is met', () => {
      const messages = [];
      task.broker.subscribeTmp('execution', '#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          loopCardinality: 3,
          completionCondition: '${content.output.stopLoop}',
        },
      });

      loop.execute({
        content: {
          isRootScope: true,
          executionId: 'parent-execution-id',
        },
      });

      expect(messages).to.have.length(3);

      task.broker.publish('execution', 'execute.completed', {...messages[1].content, output: 2});
      task.broker.publish('execution', 'execute.completed', {...messages[0].content, output: {stopLoop: true}});

      expect(messages).to.have.length(8);

      expect(messages[7].fields).to.have.property('routingKey', 'execute.completed');
      expect(messages[7].content).to.have.property('executionId', 'parent-execution-id');
      expect(messages[7].content).to.have.property('index', 0);
      expect(messages[7].content).to.have.property('output').that.eql([{stopLoop: true}, 2]);
    });

    it('root api stop message drops consumers', () => {
      task.environment.variables.items = ['item 1', 'item 2', 'item 3', 'item 4'];

      const loop = MultiInstanceLoopCharacteristics(task, {
        behaviour: {
          collection: '${environment.variables.items}',
        },
      });

      loop.execute({
        content: {
          isRootScope: true,
          executionId: 'parent-execution-id',
        },
      });

      task.broker.publish('api', 'activity.stop.parent-execution-id', {}, {type: 'stop'});

      expect(task.broker.consumerCount).to.equal(0);
    });

    describe('recovered', () => {
      it('recovered root start message only adds consumers', () => {
        const messages = [];
        task.broker.subscribeTmp('execution', '#', (_, msg) => {
          messages.push(msg);
        }, {noAck: true});

        const loop = MultiInstanceLoopCharacteristics(task, {
          behaviour: {
            loopCardinality: 3,
            completionCondition: '${content.output.stopLoop}',
          },
        });

        loop.execute({
          fields: {
            routingKey: 'execute.start',
            redelivered: true,
          },
          content: {
            isRootScope: true,
            executionId: 'parent-execution-id',
          },
        });

        expect(messages).to.have.length(0);
        expect(task.broker).to.have.property('consumerCount', 3);
      });

      it('recovered root iteration completed message only adds consumers', () => {
        const messages = [];
        task.broker.subscribeTmp('execution', '#', (_, msg) => {
          messages.push(msg);
        }, {noAck: true});

        const loop = MultiInstanceLoopCharacteristics(task, {
          behaviour: {
            loopCardinality: 3,
            completionCondition: '${content.output.stopLoop}',
          },
        });

        loop.execute({
          fields: {
            routingKey: 'execute.iteration.completed',
            redelivered: true,
          },
          content: {
            isRootScope: true,
            executionId: 'parent-execution-id',
            output: [],
          },
        });

        expect(messages).to.have.length(0);
        expect(task.broker).to.have.property('consumerCount', 3);
      });

      it('recovered iteration completed message adds to output', () => {
        const messages = [];
        task.broker.subscribeTmp('execution', '#', (_, msg) => {
          messages.push(msg);
        }, {noAck: true});

        const loop = MultiInstanceLoopCharacteristics(task, {
          behaviour: {
            loopCardinality: 3,
          },
        });

        loop.execute({
          fields: {
            routingKey: 'execute.iteration.completed',
            redelivered: true,
          },
          content: {
            isRootScope: true,
            executionId: 'parent-execution-id',
            output: [0],
          },
        });

        task.broker.publish('execution', 'execute.completed', {executionId: 'parent-execution-id_0', isMultiInstance: true, index: 1, output: 2});

        expect(messages).to.have.length(2);

        expect(messages[1].content).to.have.property('output').that.eql([0, 2]);
      });
    });
  });
});
