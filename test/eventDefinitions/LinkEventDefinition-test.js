import { Environment } from 'bpmn-elements';
import { LinkEventDefinition } from 'bpmn-elements/eventDefinitions';
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
        // @ts-expect-error type coverage
        fields: {},
        content: {
          executionId: 'event_1_0',
          message: { linkName: 'LINKA' },
          // @ts-expect-error type coverage
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
        // @ts-expect-error type coverage
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          message: { linkName: 'LINKA', payload: { hello: 'world' } },
          // @ts-expect-error type coverage
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
        // @ts-expect-error type coverage
        fields: {},
        content: {
          executionId: 'event_1_0',
          message: { linkName: 'LINKA' },
          // @ts-expect-error type coverage
          parent: {
            id: 'event',
            executionId: 'event_1',
            path: [{ id: 'theProcess', executionId: 'theProcess_0' }],
          },
        },
      });

      expect(waitMessages).to.have.length(0);
    });
  });

  describe('throwing', () => {
    it('publishes activity.link with the link payload on the activity event exchange', () => {
      event.isThrowing = true;

      const throwEd = new LinkEventDefinition(event, {
        type: 'bpmn:LinkEventDefinition',
        behaviour: { name: 'LINKA' },
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.link', (_, msg) => messages.push(msg), { noAck: true });

      throwEd.execute({
        // @ts-expect-error type coverage
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          // @ts-expect-error type coverage
          parent: {
            id: 'intermediate',
            executionId: 'event_1',
            path: [{ id: 'theProcess', executionId: 'theProcess_0' }],
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.link');
      expect(messages[0].properties).to.not.have.property('delegate');
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
        // @ts-expect-error type coverage
        fields: {},
        content: {
          executionId: 'event_1_0',
          // @ts-expect-error type coverage
          parent: {
            id: 'intermediate',
            executionId: 'event_1',
            path: [{ id: 'theProcess', executionId: 'theProcess_0' }],
          },
        },
      });

      expect(messages).to.have.length(1);
    });
  });
});
