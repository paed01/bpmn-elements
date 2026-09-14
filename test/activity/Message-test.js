import { Message } from 'bpmn-elements';
import testHelpers from '../helpers/testHelpers.js';

describe('Message', () => {
  let context, environment;
  beforeEach(() => {
    context = testHelpers.emptyContext();
    environment = context.environment;
  });

  it('exposes id, type, name and cloned parent', () => {
    const parent = { id: 'Process_0', type: 'bpmn:Process' };
    const message = new Message(
      {
        id: 'Message_0',
        type: 'bpmn:Message',
        name: 'My message',
        parent,
      },
      context
    );

    expect(message).to.have.property('id', 'Message_0');
    expect(message).to.have.property('type', 'bpmn:Message');
    expect(message).to.have.property('name', 'My message');
    expect(message.parent).to.eql(parent);
    expect(message.parent, 'cloned parent').to.not.equal(parent);
  });

  it('falls back to constructing when called without new', () => {
    // @ts-expect-error type coverage
    const message = Message(
      {
        id: 'Message_0',
        type: 'bpmn:Message',
      },
      { environment }
    );
    expect(message).to.be.instanceof(Message);
  });

  describe('resolve', () => {
    it('returns id, type and messageType=message with cloned parent', () => {
      const parent = { id: 'Process_0', type: 'bpmn:Process' };
      const message = new Message(
        {
          id: 'Message_0',
          type: 'bpmn:Message',
          parent,
        },
        context
      );

      // @ts-expect-error type coverage
      const resolved = message.resolve({ content: { id: 'task' } });

      expect(resolved).to.have.property('id', 'Message_0');
      expect(resolved).to.have.property('type', 'bpmn:Message');
      expect(resolved).to.have.property('messageType', 'message');
      expect(resolved.parent).to.eql(parent);
      expect(resolved.parent).to.not.equal(parent);
    });

    it('resolves name expression against execution message when name is set', () => {
      const message = new Message(
        {
          id: 'Message_0',
          name: 'My ${content.id}',
        },
        context
      );

      // @ts-expect-error type coverage
      const resolved = message.resolve({ content: { id: 'task' } });

      expect(resolved).to.have.property('name', 'My task');
    });

    it('omits name when message reference has no name', () => {
      const message = new Message({ id: 'Message_0' }, context);

      // @ts-expect-error type coverage
      const resolved = message.resolve({ content: { id: 'task' } });

      expect(resolved).to.not.have.property('name');
    });
  });
});
