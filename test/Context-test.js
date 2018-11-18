import Activity from '../src/activity/Activity';
import Context from '../src/Context';
import factory from './helpers/factory';
import testHelpers from './helpers/testHelpers';

describe('Context', () => {
  it('takes bpmn context instance and environment', () => {
    const ctx = Context({
      id: 'newDef',
      name: 'New def',
      type: 'fake-context',
      getInboundSequenceFlows() {
        return [];
      },
      getOutboundSequenceFlows() {
        return [];
      },
      getSequenceFlows() {
        return [];
      },
      getMessageFlows() {
        return [];
      },
    });

    expect(ctx).to.have.property('id', 'newDef');
    expect(ctx).to.have.property('name', 'New def');
  });

  describe('getProcessById(id)', () => {
    it('return process', () => {
      const ctx = Context({
        id: 'newDef',
        name: 'New def',
        type: 'fake-context',
        getProcessById() {
          return {
            id: 'theProcess',
            type: 'bpmn:Process',
            behaviour: {},
            Behaviour(def) {
              return {
                id: def.id,
                run() {},
              };
            },
          };
        },
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return [];
        },
      });

      const bp = ctx.getProcessById('theProcess');
      expect(bp).to.have.property('id', 'theProcess');
      expect(bp).to.have.property('run').that.is.a('function');
    });

    it('return null if not found', () => {
      const ctx = Context({
        id: 'newDef',
        name: 'New def',
        type: 'fake-context',
        getProcessById() {},
        getSequenceFlows() {
          return [];
        },
      });

      expect(ctx.getProcessById('theProcess')).to.be.null;
    });
  });

  describe('getActivityById(id)', () => {
    it('return Activity', () => {
      const activityDef = {
        id: 'task',
        type: 'bpmn:Task',
        behaviour: {},
        Behaviour(def, context) {
          const me = this;
          return Activity(me, def, context);
        },
      };

      const ctx = Context({
        id: 'newDef',
        name: 'New def',
        type: 'fake-context',
        getActivityById() {
          return activityDef;
        },
        getInboundSequenceFlows() {
          return [];
        },
        getOutboundSequenceFlows() {
          return [];
        },
        getSequenceFlows() {
          return [];
        },
      });

      expect(ctx.getActivityById('id')).to.have.property('broker');
    });
  });

  describe('clone(environment)', () => {
    let context;
    before(async () => {
      context = await testHelpers.context(factory.userTask('task', 'newDef'));
    });

    it('return context as a clone', () => {
      const clone = context.clone();
      expect(clone).to.have.property('id', 'newDef');

      expect(context.getProcesses() === clone.getProcesses(), 'same processes').to.be.false;
      expect(context.getProcesses()[0] === clone.getProcesses()[0], 'same process').to.be.false;

      expect(context.getActivityById('task') === clone.getActivityById('task'), 'same child').to.be.false;
      expect(context.getActivityById('task').broker === clone.getActivityById('task').broker, 'same broker').to.be.false;
    });

    it('return context with passed environment', () => {
      const newEnv = context.environment.clone();
      const subContext = context.clone(newEnv);

      expect(context.environment === subContext.environment, 'same environment').to.be.false;
      expect(subContext.environment === newEnv, 'new environment').to.be.true;
    });
  });
});
