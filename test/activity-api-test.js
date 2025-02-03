import Activity from '../src/activity/Activity.js';
import testHelpers from './helpers/testHelpers.js';
import { cloneContent } from '../src/messageHelper.js';

describe('activity api', () => {
  describe('properties', () => {
    it('exposes activity id, type, and name', () => {
      const activity = new Activity(Behaviour, { id: 'task', type: 'bpmn:Task', name: 'Task' }, getContext());

      activity.run();
      const api = activity.getApi();
      expect(api).to.have.property('id', 'task');
      expect(api).to.have.property('type', 'bpmn:Task');
      expect(api).to.have.property('name', 'Task');

      function Behaviour() {
        return {
          execute() {},
        };
      }
    });
  });

  describe('discard()', () => {
    it('discards activity', () => {
      const activity = new Activity(Behaviour, { id: 'task' }, getContext());

      activity.run();
      activity.getApi().discard();

      expect(activity.counters).to.have.property('discarded', 1);

      function Behaviour() {
        return {
          execute() {},
        };
      }
    });

    it('discards sub execution', () => {
      const activity = new Activity(Behaviour, { id: 'task' }, getContext());

      const apiMessages = [];
      activity.broker.subscribeTmp(
        'api',
        '#',
        (_, msg) => {
          apiMessages.push(msg);
        },
        { noAck: true }
      );

      activity.run();
      activity.getApi().discard();

      expect(activity.counters).to.have.property('discarded', 1);

      expect(apiMessages).to.have.length(2);
      expect(apiMessages[0].content, apiMessages[0].content.executionId).to.property('isRootScope').that.is.true;
      expect(apiMessages[1].content, apiMessages[1].content.executionId).to.property('isRootScope').that.is.false;

      function Behaviour({ broker }) {
        return {
          execute(msg) {
            if (!msg.content.isRootScope) return;
            broker.publish('execution', 'execute.start', {
              ...cloneContent(msg.content),
              isRootScope: false,
              executionId: `${msg.content.executionId}_0`,
            });
          },
        };
      }
    });

    it('execution can be discarded by sub execution', () => {
      const activity = new Activity(Behaviour, { id: 'task' }, getContext());

      const apiMessages = [];
      activity.broker.subscribeTmp(
        'api',
        '#',
        (_, msg) => {
          apiMessages.push(msg);
        },
        { noAck: true }
      );

      activity.run();
      activity.getApi().discard();

      expect(activity.counters).to.have.property('discarded', 1);

      expect(apiMessages).to.have.length(1);
      expect(apiMessages[0].content, apiMessages[0].content.executionId).to.property('isRootScope').that.is.true;

      function Behaviour({ broker }) {
        return {
          execute(msg) {
            if (!msg.content.isRootScope) return;

            const subExecutionId = `${msg.content.executionId}_0`;
            const content = cloneContent(msg.content);
            content.isRootScope = false;
            content.executionId = subExecutionId;

            broker.subscribeTmp(
              'api',
              `activity.*.${msg.content.executionId}`,
              () => {
                broker.publish('execution', 'execute.discard', { ...content });
              },
              { noAck: true, priority: 400 }
            );

            broker.publish('execution', 'execute.start', { ...content });
          },
        };
      }
    });
  });

  describe('stop()', () => {
    it('stops activity', () => {
      const activity = new Activity(Behaviour, { id: 'task' }, getContext());

      activity.run();
      activity.getApi().stop();

      expect(activity.stopped).to.be.true;
      expect(activity.counters).to.have.property('discarded', 0);
      expect(activity.counters).to.have.property('taken', 0);

      function Behaviour() {
        return {
          execute() {},
        };
      }
    });
  });

  describe('getPostponed()', () => {
    it('returns empty array', () => {
      const activity = new Activity(Behaviour, { id: 'task' }, getContext());

      activity.run();
      expect(activity.getApi().getPostponed()).to.be.empty;

      function Behaviour() {
        return {
          execute() {},
        };
      }
    });

    it('calls behaviour getPostponed if sub process', () => {
      const activity = new Activity(Behaviour, { id: 'task', isSubProcess: true }, getContext());

      activity.run();
      expect(activity.getApi().getPostponed()).to.not.be.empty;

      function Behaviour() {
        return {
          execute() {},
          getPostponed() {
            return [1];
          },
        };
      }
    });
  });
});

function getContext() {
  return testHelpers.emptyContext();
}
