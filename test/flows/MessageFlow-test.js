import Environment from '../../src/Environment';
import factory from '../helpers/factory';
import MessageFlow from '../../src/flows/MessageFlow';
import testHelpers from '../helpers/testHelpers';
import {ActivityBroker} from '../../src/EventBroker';

describe('MessageFlow', () => {
  describe('behaviour', () => {
    it('requires target, source, and context with environment and getActivityById', () => {
      const activity = ActivityBroker();
      const context = {
        environment: Environment(),
        getActivityById() {
          return activity;
        },
      };
      MessageFlow({
        id: 'message',
        type: 'messageflow',
        source: {
          id: 'task',
        },
      }, context);
    });

    it('listens for run end messages from source activity', () => {
      const activity = ActivityBroker();
      const context = {
        environment: Environment(),
        getActivityById() {
          return activity;
        },
      };
      MessageFlow({
        id: 'message',
        type: 'messageflow',
        source: {
          id: 'task',
        },
      }, context);

      expect(activity.broker).to.have.property('consumerCount', 1);
    });

    it('when source activity ends a message is sent', () => {
      const activity = ActivityBroker();
      const context = {
        environment: Environment(),
        getActivityById() {
          return activity;
        },
      };
      const flow = MessageFlow({
        id: 'message',
        type: 'messageflow',
        source: {
          id: 'task',
        },
      }, context);

      const messages = [];
      flow.broker.subscribeTmp('event', 'message.outbound', (msg) => {
        messages.push(msg);
      }, {noAck: true});

      activity.broker.publish('event', 'activity.end', {});

      expect(messages.length).to.equal(1);
    });

    it('message contains source and target', () => {
      const context = getContext();
      const activity = context.getActivityById('task1');

      const [flow] = context.getMessageFlows();

      const messages = [];
      flow.broker.subscribeTmp('event', 'message.outbound', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      activity.broker.publish('event', 'activity.end', {});

      const {content} = messages[0];

      expect(content).to.have.property('source').that.eql({
        processId: 'main',
        id: 'task1',
      });
      expect(content).to.have.property('target').that.eql({
        processId: 'participant',
        id: 'task2',
      });
    });

    it('iterates counter when message is sent', () => {
      const context = getContext();
      const activity = context.getActivityById('task1');

      const [flow] = context.getMessageFlows();

      activity.broker.publish('event', 'activity.end', {});
      activity.broker.publish('event', 'activity.end', {});
      activity.broker.publish('event', 'activity.end', {});

      expect(flow.counters).to.have.property('messages', 3);
    });
  });

  describe('from context', () => {
    let context;
    before(async () => {
      context = await testHelpers.context(factory.resource('lanes.bpmn').toString());
    });

    it('has id, type, source, and target id', () => {
      const flows = context.getMessageFlows('mainProcess');
      expect(flows.length).to.equal(1);

      flows.forEach((f) => {
        expect(f.id).to.exist;
        expect(f.type).to.equal('bpmn:MessageFlow');
        expect(f.target).to.exist;
        expect(f.target).to.have.property('id').that.is.ok;
        expect(f.target).to.have.property('processId').that.is.ok;
        expect(f.source).to.have.property('id').that.is.ok;
        expect(f.source).to.have.property('processId').that.is.ok;
      });
    });
  });
});

function getContext() {
  const def = {
    id: 'message',
    type: 'messageflow',
    source: {
      processId: 'main',
      id: 'task1',
    },
    target: {
      processId: 'participant',
      id: 'task2',
    },
  };

  const activity = ActivityBroker();
  const context = {
    environment: Environment(),
    getActivityById() {
      return activity;
    },
    getMessageFlows() {
      return [this.flow || MessageFlow(def, this)];
    },
  };
  return context;
}
