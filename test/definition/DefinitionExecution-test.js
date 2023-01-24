import Environment from '../../src/Environment.js';
import DefinitionExecution from '../../src/definition/DefinitionExecution.js';
import testHelpers from '../helpers/testHelpers.js';
import {DefinitionBroker, ProcessBroker} from '../../src/EventBroker.js';

describe('Definition execution', () => {
  describe('execute()', () => {
    it('returns execution api', () => {
      const definition = {
        id: 'Def_1',
        type: 'Definition',
        environment: new Environment(),
        logger: testHelpers.Logger('bpmn:definition'),
        broker: DefinitionBroker(this).broker,
      };
      const execution = new DefinitionExecution(definition, testHelpers.emptyContext());
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
        environment: new Environment(),
        logger: testHelpers.Logger('bpmn:definition'),
        broker: DefinitionBroker(this).broker,
        getProcesses() {
          return [];
        },
        getExecutableProcesses() {
          return [];
        },
      };
      const execution = new DefinitionExecution(definition, testHelpers.emptyContext());
      expect(execution.execute).to.throw(/requires message/);
    });

    it('throws message misses content executionId', () => {
      const definition = {
        id: 'Def_1',
        environment: new Environment(),
        logger: testHelpers.Logger('bpmn:definition'),
        broker: DefinitionBroker(this).broker,
        getProcesses() {
          return [];
        },
        getExecutableProcesses() {
          return [];
        },
      };
      const execution = new DefinitionExecution(definition, testHelpers.emptyContext());
      expect(() => execution.execute({content: {}})).to.throw(/requires execution id/);
    });
  });

  describe('two executable processes', () => {
    it('completes when both are completed', () => {
      function ProcessBehaviour({id, type}) {
        return {
          id,
          type,
          isExecutable: true,
          parent: {id: 'Def_1'},
          broker: ProcessBroker(this).broker,
          environment: new Environment(),
          init() {
            this.broker.publish('event', 'process.init', {
              id: this.id,
              executionId: id + '_1',
              parent: this.parent,
            });
          },
          run() {
            this.broker.publish('event', 'process.enter', {
              id: this.id,
              executionId: id + '_1',
              parent: this.parent,
            });
            if (this.id === 'process_1') {
              this.broker.publish('event', 'process.leave', {
                id: this.id,
                executionId: this.id + '_1',
                parent: this.parent,
              });
            }
          },
        };
      }

      const processes = [{
        id: 'process_1',
        type: 'process',
        Behaviour: ProcessBehaviour,
      }, {
        id: 'process_2',
        type: 'process',
        Behaviour: ProcessBehaviour,
      }];

      const definition = {
        id: 'Def_1',
        environment: new Environment(),
        logger: testHelpers.Logger('bpmn:definition'),
        broker: DefinitionBroker(this).broker,
      };
      const context = testHelpers.emptyContext({
        getProcessById(processId) {
          return processes.find(({id}) => id === processId);
        },
        getProcesses() {
          return processes;
        },
        getExecutableProcesses() {
          return processes;
        },
      });
      const execution = new DefinitionExecution(definition, context);

      let completed;
      definition.broker.subscribeTmp('execution', 'execution.completed.*', () => {
        completed = true;
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          executionId: 'Def_1_1',
        },
      });

      expect(completed, 'completed before second process is complete').to.not.be.ok;

      execution.getProcesses()[1].broker.publish('event', 'process.leave', {
        id: 'process_2',
        executionId: 'process_2_1',
        parent: {
          id: 'Def_1',
        },
      });

      expect(completed).to.be.true;
    });

    it('stops other processes if one throws', () => {
      const processes = [{
        id: 'process_1',
        parent: {id: 'Def_1'},
        isExecutable: true,
        broker: ProcessBroker(this).broker,
        environment: new Environment(),
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
        },
      }, {
        id: 'process_2',
        isExecutable: true,
        broker: ProcessBroker(this).broker,
        environment: new Environment(),
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
        },
      }];

      const definition = {
        id: 'Def_1',
        environment: new Environment(),
        logger: testHelpers.Logger('bpmn:definition'),
        broker: DefinitionBroker(this).broker,
      };

      function Behaviour({id}) {
        return processes.find((bp) => bp.id === id);
      }

      const context = testHelpers.emptyContext({
        getProcessById(processId) {
          const bp = processes.find(({id}) => id === processId);
          return {
            id: bp.id,
            Behaviour,
          };
        },
        getProcesses() {
          return processes.map((p) => {
            return {id: p.id, Behaviour};
          });
        },
        getExecutableProcesses() {
          return processes.map((p) => {
            return {id: p.id, Behaviour};
          });
        },
      });

      const execution = new DefinitionExecution(definition, context);

      let completed;
      definition.broker.subscribeTmp('execution', 'execution.error.*', () => {
        completed = true;
      }, {noAck: true});

      execution.execute({
        fields: {},
        content: {
          executionId: 'Def_1_1',
        },
      });

      const bps = execution.getProcesses();
      bps[0].broker.publish('event', 'process.error', {
        id: 'process_1',
        parent: {
          id: 'Def_1',
        },
      });

      expect(completed).to.be.true;

      expect(bps[0]).to.not.have.property('stopped');
      expect(bps[1]).to.have.property('stopped', true);
    });
  });

  describe('recover', () => {
    it('ignored if no state', () => {
      const context = testHelpers.emptyContext();
      const execution = new DefinitionExecution({
        id: 'Def_1',
        environment: context.environment,
        broker: new DefinitionBroker(this).broker,
      }, context);

      expect(execution === execution.recover()).to.be.true;
    });
  });

  describe('activityStatus', () => {
    it('is idle before execute', () => {
      const context = testHelpers.emptyContext();
      const execution = new DefinitionExecution({
        id: 'Def_1',
        environment: context.environment,
        broker: new DefinitionBroker(this).broker,
      }, context);

      expect(execution.activityStatus).to.equal('idle');
    });
  });
});
