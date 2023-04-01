import Activity from '../../src/activity/Activity.js';
import Environment from '../../src/Environment.js';
import SequenceFlow from '../../src/flows/SequenceFlow.js';
import testHelpers from '../helpers/testHelpers.js';
import {TaskBehaviour} from '../../src/tasks/Task.js';

const Logger = testHelpers.Logger;

describe('activity run', () => {
  it('runs in steps', () => {
    const activity = createActivity();
    activity.run();

    let current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.enter');

    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.start');

    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.execute');

    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.end');

    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.leave');

    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.next');
  });

  it('runs with run argument as input', () => {
    const activity = createActivity();
    activity.run({
      input: {
        data: 1,
      },
    });

    expect(activity).to.have.property('status', 'entered');
    let current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.enter');
    expect(current.content).to.have.property('input').that.eql({
      data: 1,
    });

    expect(activity).to.have.property('status', 'started');
    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.start');
    expect(current.content).to.have.property('input').that.eql({
      data: 1,
    });

    expect(activity).to.have.property('status', 'executed');
    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.execute');
    expect(current.content).to.have.property('input').that.eql({
      data: 1,
    });

    expect(activity).to.have.property('status', 'end');
    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.end');
    expect(current.content).to.have.property('input').that.eql({
      data: 1,
    });

    expect(activity).to.have.property('status').that.is.undefined;
    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.leave');
    expect(current.content).to.have.property('input').that.eql({
      data: 1,
    });
  });

  it('runs with run argument ignores override essential message content', () => {
    const activity = createActivity();
    activity.run({
      id: 'override',
      parent: 2,
      executionId: 3,
      input: {
        data: 1,
      },
    });

    expect(activity).to.have.property('status', 'entered');
    const current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.enter');
    expect(current.content).to.have.property('input').that.eql({
      data: 1,
    });
    expect(current.content).to.have.property('executionId').that.not.eql(3);
    expect(current.content).to.have.property('id', 'activity');
    expect(current.content).to.have.property('parent').with.property('id', 'process1');
  });

  it('runs with input from flow message', () => {
    const activity = createActivity();
    activity.activate();

    activity.inbound[0].take({
      message: {data: 1},
    });

    expect(activity).to.have.property('status', 'entered');
    let current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.enter');
    expect(current.content).to.have.property('message').that.eql({data: 1});
    expect(current.content).to.have.property('inbound').with.length(1);

    expect(activity).to.have.property('status', 'started');
    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.start');
    expect(current.content).to.have.property('message').that.eql({data: 1});

    expect(activity).to.have.property('status', 'executed');
    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.execute');
    expect(current.content).to.have.property('message').that.eql({data: 1});

    expect(activity).to.have.property('status', 'end');
    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.end');
    expect(current.content).to.have.property('message').that.eql({data: 1});

    expect(activity).to.have.property('status').that.is.undefined;
    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.leave');
    expect(current.content).to.have.property('message').that.eql({data: 1});
  });

  it('format messages alters content of run queue messages', () => {
    const activity = createActivity();

    activity.broker.subscribeOnce('event', 'activity.enter', (_, {content}) => {
      activity.broker.publish('format', 'run.input', {...content, input: {data: 1}});
    });

    activity.run();

    expect(activity).to.have.property('status', 'entered');
    let current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.enter');
    expect(current.content.input).to.be.undefined;

    expect(activity).to.have.property('status', 'started');
    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.start');
    expect(current.content).to.have.property('input').that.eql({
      data: 1,
    });

    expect(activity).to.have.property('status', 'executed');
    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.execute');
    expect(current.content).to.have.property('input').that.eql({
      data: 1,
    });
  });

  it('format start message stops execution until format end is published', () => {
    const activity = createActivity();

    let formatContent;
    activity.broker.subscribeOnce('event', 'activity.start', (_, message) => {
      activity.broker.publish('format', 'run.input.start', { endRoutingKey: 'run.input.end' });
      formatContent = message.content;
    });

    activity.run();

    expect(activity).to.have.property('status', 'entered');
    let current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.enter');
    expect(current.content.input).to.be.undefined;

    expect(activity).to.have.property('status', 'started');
    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.start');

    expect(activity).to.have.property('status', 'formatting');
    expect(activity.next()).to.not.be.ok;

    activity.broker.publish('format', 'run.input.end', {...formatContent, input: { data: 1 }});

    expect(activity).to.have.property('status', 'executed');

    current = activity.next();
    expect(current.content).to.have.property('input').that.eql({
      data: 1,
    });
  });

  it('multiple formatting postpones run until all formatting is completed', () => {
    const activity = createActivity();

    activity.broker.subscribeOnce('event', 'activity.start', () => {
      activity.broker.publish('format', 'run.input', { endRoutingKey: 'run.input.end' });
      activity.broker.publish('format', 'run.add-prop', { endRoutingKey: 'run.add-prop.end' });
      activity.broker.publish('format', 'run.dod', { endRoutingKey: 'run.dod.end' });
    });

    activity.run();

    expect(activity).to.have.property('status', 'entered');
    let current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.enter');
    expect(current.content.input).to.be.undefined;

    expect(activity).to.have.property('status', 'started');
    current = activity.next();
    expect(current.fields).to.have.property('routingKey', 'run.start');

    expect(activity).to.have.property('status', 'formatting');
    expect(activity.next()).to.not.be.ok;

    activity.broker.publish('format', 'run.input.end', { input: { data: 1 }});
    expect(activity).to.have.property('status', 'formatting');
    expect(activity.next()).to.not.be.ok;

    activity.broker.publish('format', 'run.dod.end', {dod: 42});
    expect(activity).to.have.property('status', 'formatting');

    activity.broker.publish('format', 'run.add-prop.end', { properties: { myProp: '2' }});
    expect(activity).to.have.property('status', 'executed');

    current = activity.next();
    expect(current.content).to.have.property('input').that.eql({
      data: 1,
    });
    expect(current.content).to.have.property('properties').that.eql({
      myProp: '2',
    });
    expect(current.content).to.have.property('dod', 42);
  });

  it('format is possible on enter and execution completed', async () => {
    const activity = createActivity(false);
    activity.broker.subscribeTmp('event', 'activity.#', (routingKey, message) => {
      const formatting = (message.content.formatting || []).slice();
      formatting.push(routingKey);
      activity.broker.publish('format', `run.${routingKey}`, {formatting});
    }, {noAck: true});

    const leave = activity.waitFor('leave');

    activity.run();

    const api = await leave;

    expect(api.content).to.have.property('formatting').that.eql([
      'activity.enter',
      'activity.start',
      'activity.execution.completed',
      'activity.end',
    ]);
  });

  it('fundamental content is kept', async () => {
    const activity = createActivity(false);
    let content;
    activity.broker.subscribeTmp('event', 'activity.execution.completed', (routingKey, message) => {
      content = {...message.content};

      const formatting = (message.content.formatting || []).slice();
      formatting.push(routingKey);
      activity.broker.publish('format', `run.${routingKey}`, {
        id: 'myId',
        type: 'myType',
        parent: '1',
        attachedTo: 'myPal',
        executionId: 'myExecId',
        isSubProcess: true,
        isMultiInstance: true,
        inbound: ['apa'],
        formatting,
      });
    }, {noAck: true});

    const leave = activity.waitFor('leave');

    activity.activate();
    activity.inbound[0].take();

    const api = await leave;

    expect(api.content).to.have.property('id', 'activity');
    expect(api.content).to.have.property('type').that.eql(content.type);
    expect(api.content).to.have.property('parent').that.eql(content.parent);
    expect(api.content).to.not.have.property('attachedTo');
    expect(api.content).to.have.property('executionId', content.executionId);
    expect(api.content).to.not.have.property('isSubProcess');
    expect(api.content).to.not.have.property('isMultiInstance');
    expect(api.content).to.have.property('inbound').to.be.ok.and.eql(content.inbound);
  });

  describe('extensions', () => {
    it('are activated on enter', () => {
      let active = false;
      const activity = new Activity(TaskBehaviour, {
        id: 'activity',
        type: 'task',
        parent: {
          id: 'process1',
        },
      }, getContext({
        loadExtensions() {
          return {
            activate() {
              active = true;
            },
            deactivate() {
              active = false;
            },
          };
        },
      }));

      const activityEvents = [];

      activity.on('enter', () => {
        activityEvents.push(active);
      });

      activity.run();

      expect(activityEvents).to.eql([true]);
    });

    it('are activated on discard', () => {
      let active = false;
      const activity = new Activity(TaskBehaviour, {
        id: 'activity',
        type: 'task',
        parent: {
          id: 'process1',
        },
      }, getContext({
        loadExtensions() {
          return {
            activate() {
              active = true;
            },
            deactivate() {
              active = false;
            },
          };
        },
      }));

      const activityEvents = [];

      activity.on('discard', () => {
        activityEvents.push(active);
      });

      activity.discard();

      expect(activityEvents).to.eql([true]);
    });

    it('are deactivated on activity leave', () => {
      let active = false;
      const activity = new Activity(TaskBehaviour, {
        id: 'activity',
        type: 'task',
        parent: {
          id: 'process1',
        },
      }, getContext({
        loadExtensions() {
          return {
            activate() {
              active = true;
            },
            deactivate() {
              active = false;
            },
          };
        },
      }));

      const activityEvents = [];

      activity.on('enter', () => {
        activityEvents.push(active);
      });
      activity.on('leave', () => {
        activityEvents.push(active);
      });

      activity.run();

      expect(activityEvents).to.eql([true, false]);
    });

    it('are deactivated on stop', () => {
      let active = false;
      const activity = new Activity(TaskBehaviour, {
        id: 'activity',
        type: 'task',
        parent: {
          id: 'process1',
        },
      }, getContext({
        loadExtensions() {
          return {
            activate() {
              active = true;
            },
            deactivate() {
              active = false;
            },
          };
        },
      }));

      const activityEvents = [];

      activity.on('enter', (api) => {
        activityEvents.push(active);
        api.stop();
      });
      activity.on('stop', (api) => {
        activityEvents.push(active);
        api.stop();
      });

      activity.run();

      expect(activityEvents).to.eql([true, false]);
    });

    it('are reactivated on next run', () => {
      let active = false;
      const activity = new Activity(TaskBehaviour, {
        id: 'activity',
        type: 'task',
        parent: {
          id: 'process1',
        },
      }, getContext({
        loadExtensions() {
          return {
            activate() {
              active = true;
            },
            deactivate() {
              active = false;
            },
          };
        },
      }));

      const activityEvents = [];

      activity.on('enter', () => {
        activityEvents.push(active);
      });
      activity.on('leave', () => {
        activityEvents.push(active);
      });

      activity.run();
      activity.run();

      expect(activityEvents).to.eql([true, false, true, false]);
    });
  });

  describe('run resume', () => {
    it('resumes last run message only', () => {
      const states = [];
      const activity = new Activity(TaskBehaviour, {
        id: 'activity',
        type: 'task',
        parent: {
          id: 'process1',
        },
      }, getContext({
        loadExtensions(me) {
          return {
            activate(msg) {
              states.push([msg.fields.routingKey, me.getState()]);
            },
            deactivate() {},
          };
        },
      }));

      const runMessages = [];
      const broker = activity.broker;
      broker.subscribeTmp('run', '#', (_, message) => {
        runMessages.push({...message});
      }, {noAck: true, consumerTag: '_run_test'});

      activity.run();
      activity.stop();

      let state = states.shift();
      expect(state[0]).to.equal('run.enter');

      activity.recover(state[1]).resume();

      state = states.shift();
      expect(state[0]).to.equal('run.start');
    });
  });
});

function createActivity(step = true) {
  const environment = new Environment({
    Logger,
    settings: {
      step,
    },
  });

  return new Activity(TaskBehaviour, {
    id: 'activity',
    type: 'task',
    parent: {
      id: 'process1',
    },
  }, getContext({
    environment,
    getInboundSequenceFlows() {
      return [new SequenceFlow({id: 'flow0', parent: {id: 'process1'}}, {environment})];
    },
    getOutboundSequenceFlows() {
      return [new SequenceFlow({id: 'flow1', parent: {id: 'process1'}}, {environment})];
    },
  }));
}

function getContext(override) {
  return {
    environment: new Environment({
      Logger,
    }),
    getInboundSequenceFlows() {
      return [];
    },
    getOutboundSequenceFlows() {
      return [];
    },
    loadExtensions() {
      return {
        activate() {},
        deactivate() {},
      };
    },
    getInboundAssociations() {},
    ...override,
  };
}
