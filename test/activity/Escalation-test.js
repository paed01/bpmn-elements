import { Escalation } from 'bpmn-elements';
import testHelpers from '../helpers/testHelpers.js';

describe('Escalation', () => {
  let context;
  beforeEach(() => {
    context = testHelpers.emptyContext();
  });

  it('exposes id, type, name and cloned parent', () => {
    const parent = { id: 'Process_0', type: 'bpmn:Process' };
    const escalation = new Escalation(
      {
        id: 'Escalation_0',
        type: 'bpmn:Escalation',
        name: 'My escalation',
        parent,
      },
      context
    );

    expect(escalation).to.have.property('id', 'Escalation_0');
    expect(escalation).to.have.property('type', 'bpmn:Escalation');
    expect(escalation).to.have.property('name', 'My escalation');
    expect(escalation.parent).to.eql(parent);
    expect(escalation.parent, 'cloned parent').to.not.equal(parent);
  });

  it('falls back to constructing when called without new', () => {
    // @ts-expect-error type coverage
    const escalation = Escalation({ id: 'Escalation_0' }, context);
    expect(escalation).to.be.instanceof(Escalation);
  });

  describe('resolve', () => {
    it('returns id, type and messageType=escalation with cloned parent', () => {
      const parent = { id: 'Process_0', type: 'bpmn:Process' };
      const escalation = new Escalation(
        {
          id: 'Escalation_0',
          type: 'bpmn:Escalation',
          parent,
        },
        context
      );

      // @ts-expect-error type coverage
      const resolved = escalation.resolve({ content: { id: 'task' } });

      expect(resolved).to.have.property('id', 'Escalation_0');
      expect(resolved).to.have.property('type', 'bpmn:Escalation');
      expect(resolved).to.have.property('messageType', 'escalation');
      expect(resolved.parent).to.eql(parent);
      expect(resolved.parent).to.not.equal(parent);
    });

    it('resolves name expression against execution message when name is set', () => {
      const escalation = new Escalation(
        {
          id: 'Escalation_0',
          name: 'Escalate ${content.id}',
        },
        context
      );

      // @ts-expect-error type coverage
      const resolved = escalation.resolve({ content: { id: 'task' } });

      expect(resolved).to.have.property('name', 'Escalate task');
    });

    it('keeps name as falsy value when escalation reference has no name', () => {
      const escalation = new Escalation({ id: 'Escalation_0' }, context);

      // @ts-expect-error type coverage
      const resolved = escalation.resolve({ content: { id: 'task' } });

      expect(resolved).to.have.property('name').that.is.undefined;
    });
  });
});
