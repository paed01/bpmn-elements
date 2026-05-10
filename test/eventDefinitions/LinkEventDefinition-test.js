import { LinkEventDefinition } from '../../src/eventDefinitions/LinkEventDefinition.js';
import { Environment } from '../../src/Environment.js';
import { ActivityBroker } from '../../src/EventBroker.js';
import { Logger } from '../helpers/testHelpers.js';

describe('LinkEventDefinition', () => {
  let event;
  beforeEach(() => {
    event = {
      id: 'event',
      environment: new Environment({ Logger }),
      broker: ActivityBroker(this).broker,
    };
  });

  describe('executionId', () => {
    it('is undefined before execute', () => {
      const ed = new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });
      expect(ed.executionId).to.be.undefined;
    });

    it('returns the execution id from the execute message after execute', () => {
      const ed = new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      ed.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          message: { linkName: 'LINKA' },
          parent: {
            id: 'event',
            executionId: 'event_1',
            path: [{ id: 'theProcess', executionId: 'theProcess_0' }],
          },
        },
      });

      expect(ed.executionId).to.equal('event_1_0');
    });
  });

  describe('catching', () => {
    it('completes immediately on execute, publishing activity.catch and execute.completed with the link payload', () => {
      const catchEd = new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      const eventMessages = [];
      const executionMessages = [];
      event.broker.subscribeTmp('event', 'activity.#', (_, msg) => eventMessages.push(msg), { noAck: true });
      event.broker.subscribeTmp('execution', 'execute.#', (_, msg) => executionMessages.push(msg), { noAck: true });

      catchEd.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          message: { linkName: 'LINKA', payload: { hello: 'world' } },
          parent: {
            id: 'event',
            executionId: 'event_1',
            path: [{ id: 'theProcess', executionId: 'theProcess_0' }],
          },
        },
      });

      const catchMsg = eventMessages.find((m) => m.fields.routingKey === 'activity.catch');
      expect(catchMsg, 'activity.catch').to.exist;
      expect(catchMsg.content.link).to.deep.include({ linkName: 'LINKA', referenceType: 'link' });

      const completedMsg = executionMessages.find((m) => m.fields.routingKey === 'execute.completed');
      expect(completedMsg, 'execute.completed').to.exist;
      expect(completedMsg.content).to.have.property('state', 'catch');
      expect(completedMsg.content.output).to.deep.include({ linkName: 'LINKA', payload: { hello: 'world' } });
    });

    it('does not publish activity.wait', () => {
      const catchEd = new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      const waitMessages = [];
      event.broker.subscribeTmp('event', 'activity.wait', (_, msg) => waitMessages.push(msg), { noAck: true });

      catchEd.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          message: { linkName: 'LINKA' },
          parent: {
            id: 'event',
            executionId: 'event_1',
            path: [{ id: 'theProcess', executionId: 'theProcess_0' }],
          },
        },
      });

      expect(waitMessages).to.have.length(0);
    });

    it('binds a durable named queue for link delivery so messages survive stop/recover', () => {
      new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });
      const q = event.broker.getQueue('link-event-LINKA-q');
      expect(q, 'durable link queue').to.exist;
      expect(q.options).to.include({ durable: true, autoDelete: false });
    });

    it('responds to shake.link with matching linkName', () => {
      const catchEd = new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      const linkedMessages = [];
      event.broker.subscribeTmp('event', 'activity.shake.linked', (_, msg) => linkedMessages.push(msg), { noAck: true });

      event.broker.publish(
        'api',
        'activity.shake.link',
        { sourceId: 'thrower', sequence: [], message: { linkName: 'LINKA' } },
        { type: 'shake' }
      );

      expect(linkedMessages).to.have.length(1);
      expect(linkedMessages[0].content).to.have.property('targetId', catchEd.id);
      expect(linkedMessages[0].content).to.have.property('isLinked', true);
    });

    it('ignores shake.link with mismatching linkName', () => {
      new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      const linkedMessages = [];
      event.broker.subscribeTmp('event', 'activity.shake.linked', (_, msg) => linkedMessages.push(msg), { noAck: true });

      event.broker.publish(
        'api',
        'activity.shake.link',
        { sourceId: 'thrower', sequence: [], message: { linkName: 'OTHER' } },
        { type: 'shake' }
      );

      expect(linkedMessages).to.have.length(0);
    });
  });

  describe('throwing', () => {
    it('publishes activity.link with delegate:true and the link payload', () => {
      event.isThrowing = true;

      const throwEd = new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.link', (_, msg) => messages.push(msg), { noAck: true });

      throwEd.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'intermediate',
            executionId: 'event_1',
            path: [{ id: 'theProcess', executionId: 'theProcess_0' }],
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.link');
      expect(messages[0].properties).to.have.property('delegate', true);
      expect(messages[0].properties).to.have.property('type', 'link');
      expect(messages[0].content.message).to.deep.include({ linkName: 'LINKA', referenceType: 'link' });
      expect(messages[0].content).to.have.property('state', 'throw');
      expect(messages[0].content).to.have.property('executionId', 'event_1');
    });

    it('also publishes execute.completed for itself so the activity terminates', () => {
      event.isThrowing = true;

      const throwEd = new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => messages.push(msg), { noAck: true });

      throwEd.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          parent: {
            id: 'intermediate',
            executionId: 'event_1',
            path: [{ id: 'theProcess', executionId: 'theProcess_0' }],
          },
        },
      });

      expect(messages).to.have.length(1);
    });

    it('on activity.shake.start, publishes activity.shake.link with the linkName', () => {
      event.isThrowing = true;

      new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.shake.link', (_, msg) => messages.push(msg), { noAck: true });

      event.broker.publish(
        'api',
        'activity.shake.start',
        {
          executionId: 'event_1',
          sequence: [],
          parent: { id: 'theProcess', executionId: 'theProcess_0' },
        },
        { type: 'shake' }
      );

      expect(messages).to.have.length(1);
      expect(messages[0].properties).to.have.property('type', 'shake');
      expect(messages[0].content.message).to.deep.include({ linkName: 'LINKA', referenceType: 'link' });
      expect(messages[0].content).to.have.property('sourceId', 'event');
    });
  });
});
