import Environment from '../../src/Environment';
import DefinitionExecution from '../../src/definition/DefinitionExecution';
import {Logger} from '../helpers/testHelpers';
import {DefinitionBroker, ProcessBroker} from '../../src/EventBroker';

describe('Definition execution', () => {
  describe('execute()', () => {
    it('returns execution api', () => {
      const definition = {
        id: 'Def_1',
        type: 'Definition',
        environment: Environment(),
        logger: Logger('bpmn:definition'),
        broker: DefinitionBroker(this).broker,
        getProcesses() {
          return [];
        },
        getExecutableProcesses() {
          return [];
        }
      };
      const execution = DefinitionExecution(definition);
      expect(execution).to.have.property('id', 'Def_1');
      expect(execution).to.have.property('type', 'Definition');
      expect(execution).to.have.property('broker', definition.broker);
      expect(execution).to.have.property('environment', definition.environment);
      expect(execution).to.have.property('executionId');
      expect(execution).to.have.property('completed', false);
      expect(execution).to.have.property('stopped');
      expect(execution).to.have.property('status', 'init');
      expect(execution).to.have.property('postponedCount', 0);
      expect(execution).to.have.property('isRunning', false);
      expect(execution).to.have.property('processes').that.deep.equal([]);
      expect(execution).to.have.property('execute').that.is.a('function');
      expect(execution).to.have.property('recover').that.is.a('function');
      expect(execution).to.have.property('resume').that.is.a('function');
      expect(execution).to.have.property('getApi').that.is.a('function');
      expect(execution).to.have.property('getPostponed').that.is.a('function');
    });

    it('throws if no message is passed', () => {
      const definition = {
        id: 'Def_1',
        environment: Environment(),
        logger: Logger('bpmn:definition'),
        broker: DefinitionBroker(this).broker,
        getProcesses() {
          return [];
        },
        getExecutableProcesses() {
          return [];
        }
      };
      const execution = DefinitionExecution(definition);
      expect(execution.execute).to.throw(/requires message/);
    });

    it('throws message misses content executionId', () => {
      const definition = {
        id: 'Def_1',
        environment: Environment(),
        logger: Logger('bpmn:definition'),
        broker: DefinitionBroker(this).broker,
        getProcesses() {
          return [];
        },
        getExecutableProcesses() {
          return [];
        }
      };
      const execution = DefinitionExecution(definition);
      expect(() => execution.execute({content: {}})).to.throw(/requires execution id/);
    });
  });

  describe('two executable processes', () => {
    it('completes when both are completed', () => {
      const processes = [{
        id: 'process_1',
        parent: {id: 'Def_1'},
        broker: ProcessBroker(this).broker,
        init() {
          this.broker.publish('event', 'process.init', {
            id: this.id,
            parent: this.parent,
          });
        },
        run() {
          this.broker.publish('event', 'process.enter', {
            id: this.id,
            parent: this.parent,
          });
          this.broker.publish('event', 'process.leave', {
            id: this.id,
            parent: this.parent,
          });
        }
      }, {
        id: 'process_2',
        broker: ProcessBroker(this).broker,
        run() {
          this.broker.publish('event', 'process.enter', {
            id: this.id,
            parent: this.parent,
          });
        },
        init() {
          this.broker.publish('event', 'process.init', {
            id: this.id,
            parent: this.parent,
          });
        },
      }];

      const definition = {
        id: 'Def_1',
        environment: Environment(),
        logger: Logger('bpmn:definition'),
        broker: DefinitionBroker(this).broker,
        getProcesses() {
          return processes;
        },
        getExecutableProcesses() {
          return processes;
        }
      };
      const execution = DefinitionExecution(definition);

      let completed;
      definition.broker.subscribeTmp('execution', 'execution.completed.*', () => {
        completed = true;
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          executionId: 'Def_1_1',
        }
      });

      expect(completed, 'completed before second process is complete').to.not.be.ok;

      processes[1].broker.publish('event', 'process.leave', {
        id: 'process_2',
        parent: {
          id: 'Def_1',
        }
      });

      expect(completed).to.be.true;
    });

    it('stops other processes if one throws', () => {
      const processes = [{
        id: 'process_1',
        parent: {id: 'Def_1'},
        broker: ProcessBroker(this).broker,
        init() {
          this.broker.publish('event', 'process.init', {
            id: this.id,
            parent: this.parent,
          });
        },
        run() {
          this.broker.publish('event', 'process.enter', {
            id: this.id,
            parent: this.parent,
          });
        },
        stop() {
          this.stopped = true;
        }
      }, {
        id: 'process_2',
        broker: ProcessBroker(this).broker,
        init() {
          this.broker.publish('event', 'process.init', {
            id: this.id,
            parent: this.parent,
          });
        },
        run() {
          this.broker.publish('event', 'process.enter', {
            id: this.id,
            parent: this.parent,
          });
        },
        stop() {
          this.stopped = true;
        }
      }];

      const definition = {
        id: 'Def_1',
        environment: Environment(),
        logger: Logger('bpmn:definition'),
        broker: DefinitionBroker(this).broker,
        getProcesses() {
          return processes;
        },
        getExecutableProcesses() {
          return processes;
        }
      };
      const execution = DefinitionExecution(definition);

      let completed;
      definition.broker.subscribeTmp('execution', 'execution.error.*', () => {
        completed = true;
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          executionId: 'Def_1_1',
        }
      });

      processes[0].broker.publish('event', 'process.error', {
        id: 'process_1',
        parent: {
          id: 'Def_1',
        }
      });

      expect(completed).to.be.true;

      expect(processes[0]).to.not.have.property('stopped');
      expect(processes[1]).to.have.property('stopped', true);
    });
  });
});
