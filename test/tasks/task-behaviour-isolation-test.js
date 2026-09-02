import * as elements from 'bpmn-elements';
import {
  SignalTask,
  SignalTaskBehaviour,
  UserTask,
  UserTaskBehaviour,
  ManualTask,
  ManualTaskBehaviour,
  ServiceTask,
  ServiceTaskBehaviour,
  SendTask,
  SendTaskBehaviour,
  BusinessRuleTask,
  BusinessRuleTaskBehaviour,
} from 'bpmn-elements/tasks';

describe('task behaviour isolation', () => {
  [
    {
      base: 'SignalTask',
      Base: SignalTask,
      BaseBehaviour: SignalTaskBehaviour,
      leaves: [
        { name: 'UserTask', Leaf: UserTask, LeafBehaviour: UserTaskBehaviour },
        { name: 'ManualTask', Leaf: ManualTask, LeafBehaviour: ManualTaskBehaviour },
      ],
    },
    {
      base: 'ServiceTask',
      Base: ServiceTask,
      BaseBehaviour: ServiceTaskBehaviour,
      leaves: [
        { name: 'SendTask', Leaf: SendTask, LeafBehaviour: SendTaskBehaviour },
        { name: 'BusinessRuleTask', Leaf: BusinessRuleTask, LeafBehaviour: BusinessRuleTaskBehaviour },
      ],
    },
  ].forEach(({ base, Base, BaseBehaviour, leaves }) => {
    describe(`${base} family`, () => {
      it('exposes a distinct factory and behaviour per spec type', () => {
        for (const { name, Leaf, LeafBehaviour } of leaves) {
          expect(Leaf, `${name} factory`).to.not.equal(Base);
          expect(LeafBehaviour, `${name} behaviour`).to.not.equal(BaseBehaviour);
        }
        // leaves are distinct from each other too
        const [a, b] = leaves;
        expect(a.Leaf, `${a.name} vs ${b.name} factory`).to.not.equal(b.Leaf);
        expect(a.LeafBehaviour, `${a.name} vs ${b.name} behaviour`).to.not.equal(b.LeafBehaviour);
      });

      it('inherits the shared implementation from the base behaviour', () => {
        for (const { name, LeafBehaviour } of leaves) {
          expect(Object.getPrototypeOf(LeafBehaviour.prototype), `${name} prototype chain`).to.equal(BaseBehaviour.prototype);
          expect(LeafBehaviour.prototype.execute, `${name} inherits execute`).to.equal(BaseBehaviour.prototype.execute);
        }
      });

      it('overriding a leaf prototype does not leak to the base or its siblings', () => {
        const [target, sibling] = leaves;
        const original = BaseBehaviour.prototype.execute;
        function customExecute() {}
        try {
          target.LeafBehaviour.prototype.execute = customExecute;
          expect(target.LeafBehaviour.prototype.execute, `${target.name} overridden`).to.equal(customExecute);
          expect(BaseBehaviour.prototype.execute, `${base} base untouched`).to.equal(original);
          expect(sibling.LeafBehaviour.prototype.execute, `${sibling.name} sibling untouched`).to.equal(original);
        } finally {
          delete target.LeafBehaviour.prototype.execute;
        }
      });
    });
  });

  describe('root exports', () => {
    it('no longer alias one another to the same object', () => {
      expect(elements.UserTask, 'UserTask').to.not.equal(elements.SignalTask);
      expect(elements.ManualTask, 'ManualTask').to.not.equal(elements.SignalTask);
      expect(elements.SendTask, 'SendTask').to.not.equal(elements.ServiceTask);
      expect(elements.BusinessRuleTask, 'BusinessRuleTask').to.not.equal(elements.ServiceTask);
      expect(elements.TextAnnotation, 'TextAnnotation').to.not.equal(elements.Dummy);
      expect(elements.Group, 'Group').to.not.equal(elements.Dummy);
      expect(elements.Category, 'Category').to.not.equal(elements.Dummy);
    });
  });
});
