import ck from 'chronokinesis';
import Definition from '../../src/definition/Definition';
import testHelpers from '../helpers/testHelpers';
import factory from '../helpers/factory';
import CamundaExtension from '../resources/extensions/CamundaExtension';

const extensions = {
  camunda: CamundaExtension,
};

const timersSource = factory.resource('timers.bpmn');

Feature('Timers', () => {
  after(ck.reset);

  Scenario('a process with different timers', () => {
    const catchDate = new Date('1993-06-25');
    before(() => {
      ck.travel(catchDate);
    });
    after(ck.reset);

    let context, definition;
    Given('a time cycle start event, bound time duration event, throw time date event, and a user task with due date', async () => {
      context = await testHelpers.context(timersSource, {extensions});
      definition = Definition(context, {
        variables: {
          catchDate: '1993-06-26',
          dueDate: '1993-06-27'
        },
      });
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    let activity;
    Then('the start event is waiting', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'start-cycle');
    });

    And('time cycle is executing', () => {
      const [execution] = activity.getExecuting();
      expect(execution.content).to.have.property('timeCycle', 'R3/PT10H');
    });

    When('start event is canceled', () => {
      definition.cancelActivity({id: 'start-cycle'});
    });

    let task;
    Then('bound time duration event is waiting', () => {
      [activity, task] = definition.getPostponed();
      expect(activity).to.have.property('id', 'bound-duration');
    });

    And('time duration is executing', () => {
      const [execution] = activity.getExecuting();
      expect(execution.content).to.have.property('timeDuration', 'PT1M');
    });

    When('bound task is signaled', () => {
      definition.signal({id: task.id});
    });

    Then('throw time date event is waiting', () => {
      [activity, task] = definition.getPostponed();
      expect(activity).to.have.property('id', 'catch-date');
    });

    And('time date is executing', () => {
      const [execution] = activity.getExecuting();
      expect(execution.content).to.have.property('timeDate').to.deep.equal(new Date('1993-06-26'));
    });

    When('throw event is canceled', () => {
      definition.cancelActivity({id: activity.id});
    });

    Then('user task with due date is waiting', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'user-due');
    });

    And('due date is present', () => {
      expect(activity.content).to.have.property('dueDate').to.deep.equal(new Date('1993-06-27'));
    });

    When('user task is signaled', () => {
      definition.signal({id: activity.id});
    });

    Then('execution completes', () => {
      return end;
    });

    Given('the definition is ran again', () => {
      definition.run();
    });

    let state;
    And('definition is stopped and state is saved', () => {
      definition.stop();
      state = definition.getState();
    });

    When('resumed', () => {
      definition.resume();
    });

    Then('the start event is waiting', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'start-cycle');
    });

    And('time cycle is executing', () => {
      const [execution] = activity.getExecuting();
      expect(execution.content).to.have.property('timeCycle', 'R3/PT10H');
    });

    Given('the definition is recovered and resumed somewhere else', () => {
      definition = Definition(context.clone());
      definition.recover(JSON.parse(JSON.stringify(state)));
      definition.resume();
    });

    Then('the start event is waiting', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'start-cycle');
    });

    And('time cycle is executing', () => {
      const [execution] = activity.getExecuting();
      expect(execution.content).to.have.property('timeCycle', 'R3/PT10H');
    });

    Given('start event is canceled', () => {
      definition.cancelActivity({id: 'start-cycle'});
    });

    And('definition is stopped and state is saved', () => {
      definition.stop();
      state = definition.getState();
    });

    When('the definition is recovered and resumed somewhere else', () => {
      definition = Definition(context.clone());
      definition.recover(JSON.parse(JSON.stringify(state)));
      definition.resume();
    });

    Then('bound time duration event is waiting', () => {
      [activity, task] = definition.getPostponed();
      expect(activity).to.have.property('id', 'bound-duration');
    });

    And('time duration is executing', () => {
      const [execution] = activity.getExecuting();
      expect(execution.content).to.have.property('timeDuration', 'PT1M');
    });

    Given('definition is stopped and state is saved', () => {
      definition.stop();
      state = definition.getState();
    });

    When('the definition is recovered and resumed somewhere else', () => {
      definition = Definition(context.clone());
      definition.recover(JSON.parse(JSON.stringify(state)));
      definition.resume();
    });

    Then('bound time duration event is still waiting', () => {
      [activity, task] = definition.getPostponed();
      expect(activity).to.have.property('id', 'bound-duration');
    });

    And('time duration is executing', () => {
      const [execution] = activity.getExecuting();
      expect(execution.content).to.have.property('timeDuration', 'PT1M');
    });

    Given('bound task is signaled', () => {
      definition.signal({id: task.id});
    });

    And('definition is stopped and state is saved', () => {
      definition.stop();
      state = definition.getState();
    });

    And('time date is due', () => {
      ck.travel('1993-06-28');
    });

    let timeoutMessage;
    When('the definition is recovered and resumed somewhere else', () => {
      definition = Definition(context.clone());
      definition.recover(JSON.parse(JSON.stringify(state)));

      definition.broker.subscribeTmp('event', 'activity.timer', (_, msg) => {
        timeoutMessage = msg;
      }, {noAck: true});

      definition.resume();
    });

    Then('throw time date has timed out', () => {
      expect(timeoutMessage.content).to.have.property('timeDate').to.deep.equal(new Date('1993-06-26'));
    });
  });
});
