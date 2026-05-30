import { Environment, Signal } from 'bpmn-elements';

describe('Signal', () => {
  let environment;
  beforeEach(() => {
    environment = new Environment();
  });

  it('exposes id, type, name and cloned parent', () => {
    const parent = { id: 'Process_0', type: 'bpmn:Process' };
    const signal = new Signal(
      {
        id: 'Signal_0',
        type: 'bpmn:Signal',
        name: 'My signal',
        parent,
      },
      { environment }
    );

    expect(signal).to.have.property('id', 'Signal_0');
    expect(signal).to.have.property('type', 'bpmn:Signal');
    expect(signal).to.have.property('name', 'My signal');
    expect(signal.parent).to.eql(parent);
    expect(signal.parent, 'cloned parent').to.not.equal(parent);
  });

  it('defaults type to Signal when missing', () => {
    const signal = new Signal({ id: 'Signal_0' }, { environment });
    expect(signal).to.have.property('type', 'Signal');
  });

  it('falls back to constructing when called without new', () => {
    const signal = Signal({ id: 'Signal_0' }, { environment });
    expect(signal).to.be.instanceof(Signal);
  });

  describe('resolve', () => {
    it('returns id, type and messageType=signal with cloned parent', () => {
      const parent = { id: 'Process_0', type: 'bpmn:Process' };
      const signal = new Signal(
        {
          id: 'Signal_0',
          type: 'bpmn:Signal',
          parent,
        },
        { environment }
      );

      const resolved = signal.resolve({ content: { id: 'task' } });

      expect(resolved).to.have.property('id', 'Signal_0');
      expect(resolved).to.have.property('type', 'bpmn:Signal');
      expect(resolved).to.have.property('messageType', 'signal');
      expect(resolved.parent).to.eql(parent);
      expect(resolved.parent).to.not.equal(parent);
    });

    it('resolves name expression against execution message when name is set', () => {
      const signal = new Signal(
        {
          id: 'Signal_0',
          name: 'Signal for ${content.id}',
        },
        { environment }
      );

      const resolved = signal.resolve({ content: { id: 'task' } });

      expect(resolved).to.have.property('name', 'Signal for task');
    });

    it('omits name when signal reference has no name', () => {
      const signal = new Signal({ id: 'Signal_0' }, { environment });

      const resolved = signal.resolve({ content: { id: 'task' } });

      expect(resolved).to.not.have.property('name');
    });
  });
});
