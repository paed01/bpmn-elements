import ck from 'chronokinesis';
import Definition from '../../src/definition/Definition.js';
import testHelpers from '../helpers/testHelpers.js';
import factory from '../helpers/factory.js';
import CamundaExtension from '../resources/extensions/CamundaExtension.js';
import {resolveExpression} from '@aircall/expression-parser';

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
    after(() => {
      expect(definition?.environment.timers.executing).to.have.length(0);
    });

    Given('a time cycle start event, bound time duration event, throw time date event, and a user task with due date', async () => {
      context = await testHelpers.context(timersSource, {extensions});
      definition = new Definition(context, {
        variables: {
          catchDate: '1993-06-26',
          dueDate: '1993-06-27',
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

    When('start event times out', () => {
      expect(definition.environment.timers.executing).to.have.length(1);
      definition.environment.timers.executing[0].callback();
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
      expect(execution.content).to.have.property('timeDate').to.equal('1993-06-26');
      expect(execution.content).to.have.property('expireAt').to.deep.equal(new Date('1993-06-26'));
    });

    When('throw event is cancelled', () => {
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
      definition.stop();
    });

    Given('the definition is recovered and resumed somewhere else', () => {
      definition = new Definition(context.clone());
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

    Given('start event is cancelled', () => {
      definition.cancelActivity({id: 'start-cycle'});
    });

    And('definition is stopped and state is saved', () => {
      definition.stop();
      state = definition.getState();
    });

    When('the definition is recovered and resumed somewhere else', () => {
      definition = new Definition(context.clone());
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
      definition = new Definition(context.clone());
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
      definition = new Definition(context.clone());
      definition.recover(JSON.parse(JSON.stringify(state)));

      definition.broker.subscribeTmp('event', 'activity.timer', (_, msg) => {
        timeoutMessage = msg;
      }, {noAck: true});

      definition.resume();
    });

    Then('throw time date has timed out', () => {
      expect(timeoutMessage.content).to.have.property('timeDate').to.deep.equal('1993-06-26');
      expect(timeoutMessage.content).to.have.property('expireAt').to.deep.equal(new Date('1993-06-26'));
    });
  });

  Scenario('override timers in environment', () => {
    let context, definition;
    Given('a definition with various timers and overridden timers', async () => {
      function Timers() {
        const timers = {};

        return {
          timers,
          register() {
            return {
              setTimeout: this.setTimeout,
              clearTimeout: this.clearTimeout,
            };
          },
          setTimeout() {},
          clearTimeout() {},
        };
      }

      context = await testHelpers.context(timersSource, {extensions, timers: Timers()});
      definition = new Definition(context, {
        variables: {
          catchDate: '1993-06-26',
          dueDate: '1993-06-27',
        },
      });
    });

    let end;
    When('definition is ran', () => {
      ck.travel('1993-06-24');

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

    When('start event is cancelled', () => {
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
      expect(execution.content).to.have.property('timeDate').to.equal('1993-06-26');
      expect(execution.content).to.have.property('expireAt').to.deep.equal(new Date('1993-06-26'));
    });

    When('throw event is cancelled', () => {
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
      definition = new Definition(context.clone());
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

    Given('start event is cancelled', () => {
      definition.cancelActivity({id: 'start-cycle'});
    });

    And('definition is stopped and state is saved', () => {
      definition.stop();
      state = definition.getState();
    });

    When('the definition is recovered and resumed somewhere else', () => {
      definition = new Definition(context.clone());
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
      definition = new Definition(context.clone());
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
      definition = new Definition(context.clone());
      definition.recover(JSON.parse(JSON.stringify(state)));

      definition.broker.subscribeTmp('event', 'activity.timer', (_, msg) => {
        timeoutMessage = msg;
      }, {noAck: true});

      definition.resume();
    });

    Then('throw time date has timed out', () => {
      expect(timeoutMessage.content).to.have.property('timeDate').to.equal('1993-06-26');
      expect(timeoutMessage.content).to.have.property('expireAt').to.deep.equal(new Date('1993-06-26'));
    });
  });

  Scenario('bound activity non-interrupting timer cycle', () => {
    let context, definition;
    after(() => {
      expect(definition?.environment.timers.executing).to.have.length(0);
    });

    Given('a task with a bound non-interrupting repeated timer cycle', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        id="Definitions_1l30pnv" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0cn5rdh" isExecutable="true">
          <startEvent id="start-cycle" />
          <sequenceFlow id="to-task" sourceRef="start-cycle" targetRef="task" />
          <manualTask id="task" />
          <boundaryEvent id="bound-cycle" cancelActivity="false" attachedToRef="task">
            <timerEventDefinition>
              <timeCycle xsi:type="tFormalExpression">R3/PT1M</timeCycle>
            </timerEventDefinition>
          </boundaryEvent>
          <sequenceFlow id="to-cycle-end" sourceRef="bound-cycle" targetRef="cycle-end" />
          <endEvent id="cycle-end" />
          <sequenceFlow id="to-end" sourceRef="task" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran', () => {
      definition.run();
    });

    let activity;
    Then('the bound cycle event is waiting', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'bound-cycle');
    });

    And('time cycle is executing', () => {
      const [execution] = activity.getExecuting();
      expect(execution.content).to.have.property('timeCycle', 'R3/PT1M');
    });

    When('cycle times out', () => {
      definition.environment.timers.executing[0].callback();
    });

    Then('bound outbound flows are taken', () => {
      expect(definition.getActivityById('cycle-end').counters).to.have.property('taken', 1);
    });

    And('time cycle is still executing', () => {
      expect(definition.environment.timers.executing).to.have.length(1);

      [, activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'bound-cycle');
      const [execution] = activity.getExecuting();
      expect(execution.content).to.have.property('timeCycle', 'R3/PT1M');
      expect(execution.content).to.have.property('repeat', 2);
    });

    When('cycle times out a second time', () => {
      definition.environment.timers.executing[0].callback();
    });

    Then('bound outbound flows are taken', () => {
      expect(definition.getActivityById('cycle-end').counters).to.have.property('taken', 2);
    });

    And('time cycle is still executing', () => {
      expect(definition.environment.timers.executing).to.have.length(1);

      [, activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'bound-cycle');
      const [execution] = activity.getExecuting();
      expect(execution.content).to.have.property('timeCycle', 'R3/PT1M');
      expect(execution.content).to.have.property('repeat', 1);
    });

    When('cycle times out a third time', () => {
      definition.environment.timers.executing[0].callback();
    });

    Then('bound outbound flows are taken', () => {
      expect(definition.getActivityById('cycle-end').counters).to.have.property('taken', 3);
    });

    And('time cycle has completed', () => {
      expect(definition.environment.timers.executing).to.have.length(0);

      const postponed = definition.getPostponed();
      expect(postponed.length).to.equal(1);
      expect(postponed[0]).to.have.property('id', 'task');
    });

    let end;
    When('task is signaled', () => {
      end = definition.waitFor('leave');
      definition.signal({id: 'task'});
    });

    Then('run completes', () => {
      return end;
    });

    When('definition is ran again', () => {
      definition.run();
    });

    Then('the bound cycle event is waiting', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'bound-cycle');
    });

    And('time cycle is executing', () => {
      const [execution] = activity.getExecuting();
      expect(execution.content).to.have.property('timeCycle', 'R3/PT1M');
    });

    When('cycle times out', () => {
      definition.environment.timers.executing[0].callback();
      definition.cancelActivity({id: 'start-cycle'});
    });

    When('task is signaled', () => {
      end = definition.waitFor('leave');
      definition.signal({id: 'task'});
    });

    Then('run completes', () => {
      return end;
    });
  });

  Scenario('bound activity interrupting timer cycle', () => {
    let context, definition;
    after(() => {
      expect(definition?.environment.timers.executing).to.have.length(0);
    });

    Given('a task with a bound interrupting repeated timer cycle', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        id="Definitions_1l30pnv" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0cn5rdh" isExecutable="true">
          <startEvent id="start-cycle" />
          <sequenceFlow id="to-task" sourceRef="start-cycle" targetRef="task" />
          <manualTask id="task" />
          <boundaryEvent id="bound-cycle" attachedToRef="task">
            <timerEventDefinition>
              <timeCycle xsi:type="tFormalExpression">R3/PT1M</timeCycle>
            </timerEventDefinition>
          </boundaryEvent>
          <sequenceFlow id="to-cycle-end" sourceRef="bound-cycle" targetRef="cycle-end" />
          <endEvent id="cycle-end" />
          <sequenceFlow id="to-end" sourceRef="task" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran', () => {
      definition.run();
    });

    let activity;
    Then('the bound cycle event is waiting', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'bound-cycle');
    });

    And('time cycle is executing', () => {
      const [execution] = activity.getExecuting();
      expect(execution.content).to.have.property('timeCycle', 'R3/PT1M');
    });

    let end;
    When('cycle times out', () => {
      end = definition.waitFor('leave');
      definition.environment.timers.executing[0].callback();
    });

    Then('run completes', () => {
      return end;
    });
  });

  Scenario('repeated time duration timer', () => {
    let context, definition;
    after(() => {
      expect(definition?.environment.timers.executing).to.have.length(0);
    });

    const timerEvents = [];
    Given('a start event time duration repeat timer expression', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <startEvent id="start">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">R3/PT0.01S</timeDuration>
            </timerEventDefinition>
          </startEvent>
          <sequenceFlow id="to-end" sourceRef="start" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
      definition = new Definition(context, {
        expressions: {resolveExpression},
      });
    });

    let end;
    When('definition is ran', () => {
      definition.broker.subscribeTmp('event', 'activity.timer', (_, msg) => timerEvents.push(msg), {noAck: true});
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('only one timer event was triggered', () => {
      expect(timerEvents.length).to.equal(1);
    });

    Given('an intermediate throw event time duration repeat timer expression', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-timer" sourceRef="start" targetRef="timer" />
          <intermediateThrowEvent id="timer">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">R3/PT0.01S</timeDuration>
            </timerEventDefinition>
          </intermediateThrowEvent>
          <sequenceFlow id="to-end" sourceRef="timer" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
      definition = new Definition(context, {
        expressions: {resolveExpression},
      });
    });

    When('definition is ran', () => {
      timerEvents.splice(0);
      definition.broker.subscribeTmp('event', 'activity.timer', (_, msg) => timerEvents.push(msg), {noAck: true});
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('only one timer event was triggered', () => {
      expect(timerEvents.length).to.equal(1);
    });
  });

  Scenario('faulty timer expression', () => {
    let context, definition;
    after(() => {
      expect(definition?.environment.timers.executing).to.have.length(0);
    });

    Given('a source with a faulty timer expression', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <startEvent id="start-cycle">
            <timerEventDefinition>
              <timeCycle xsi:type="tFormalExpression">\${true === "false'}</timeCycle>
            </timerEventDefinition>
          </startEvent>
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
      definition = new Definition(context, {
        expressions: {resolveExpression},
      });
    });

    let errored;
    When('definition is ran', () => {
      errored = definition.waitFor('error');
      definition.run();
    });

    Then('run fails', async () => {
      const err = await errored;
      expect(err.content.error).to.match(/syntax/i);
    });
  });

  Scenario('timer delay does not fit into a 32-bit signed integer', () => {
    before(ck.reset);

    let context, definition;
    Given('a source with a timer expression of one year', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <startEvent id="start-cycle">
            <timerEventDefinition>
              <timeCycle xsi:type="tFormalExpression">P1Y</timeCycle>
            </timerEventDefinition>
          </startEvent>
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let timer;
    When('definition is ran', () => {
      ck.freeze(2023, 4, 23);
      timer = definition.waitFor('activity.timer');
      definition.run();
    });

    Then('activity timer is emitted', async () => {
      const timerEvent = await timer;
      expect(timerEvent.content.expireAt.getFullYear()).to.equal(2024);
    });

    let state;
    When('run is stopped and state is saved', () => {
      definition.stop();
      state = definition.getState();
    });

    Then('timers are cleared', () => {
      expect(definition?.environment.timers.executing).to.have.length(0);
    });

    let end;
    When('run is resumed one year later', () => {
      ck.travel(new Date(2024, 4, 23));

      definition = new Definition(context.clone()).recover(state);

      end = definition.waitFor('leave');

      definition.resume();
    });

    Then('run completes', () => {
      return end;
    });
  });

  Scenario('timer bound to user task is resumed on wait', () => {
    before(ck.reset);

    let context, definition;
    Given('a source with user task and a bound timer', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <userTask id="task" />
          <boundaryEvent id="bound-timer" attachedToRef="task">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT10S</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let waiting, waitingState;
    When('definition is ran with state save on wait', () => {
      definition.broker.subscribeOnce('event', 'activity.wait', () => {
        waitingState = JSON.parse(JSON.stringify(definition.getState()));
      });
      waiting = definition.waitFor('activity.wait');
      definition.run();
    });

    Then('user task is waiting', () => {
      return waiting;
    });

    And('state is saved', () => {
      expect(waitingState).to.be.ok.and.have.property('execution');
      expect(waitingState).to.property('status', 'executing');
      definition.stop();
    });

    let end;
    When('run is recovered, resumed, and task is signaled', () => {
      definition = new Definition(context.clone()).recover(waitingState);

      end = definition.waitFor('leave');

      definition.resume();
      definition.signal({id: 'task'});
    });

    Then('run completes', () => {
      return end;
    });

    let timer, timerState;
    When('definition is ran with state save on timer', () => {
      definition = new Definition(context.clone());

      definition.broker.subscribeOnce('event', 'activity.timer', () => {
        timerState = definition.getState();
      });

      timer = definition.waitFor('activity.timer');
      definition.run();
    });

    Then('bound even is waiting for timer', () => {
      return timer;
    });

    And('state is saved', () => {
      expect(timerState).to.be.ok.and.have.property('execution');
      expect(timerState).to.property('status', 'executing');
      definition.stop();
    });

    When('run is recovered, resumed, and task is signaled', () => {
      definition = new Definition(context.clone()).recover(timerState);

      end = definition.waitFor('leave');

      definition.resume();
      definition.signal({id: 'task'});
    });

    Then('run completes', () => {
      return end;
    });
  });

  Scenario('timer bound to user task is resumed at timeout', () => {
    before(ck.reset);

    let context, definition;
    Given('a source with user task and a bound timer', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <userTask id="task" />
          <boundaryEvent id="bound-timer" attachedToRef="task">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT8H</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran with state save on wait', () => {
      definition.run();
    });

    Then('user task and timer is running', () => {
      expect(definition.getPostponed()).to.have.length(2);
    });

    let state;
    Given('state is saved', () => {
      state = definition.getState();
      definition.stop();
    });

    let end;
    When('run is recovered, resumed at timeout', () => {
      ck.travel(Date.now() + 1000 * 60 * 60 * 8);
      definition = new Definition(context.clone()).recover(state);
      end = definition.waitFor('leave');
      definition.resume();
    });

    Then('run completes', () => {
      return end;
    });
  });

  Scenario('timer bound to sub process is resumed at timeout', () => {
    before(ck.reset);

    let context, definition;
    Given('a source with sub process user task and a bound timer', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <subProcess id="sub">
            <userTask id="task" />
          </subProcess>
          <boundaryEvent id="bound-timer" attachedToRef="sub">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT8H</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran with state save on wait', () => {
      definition.run();
    });

    Then('sub process and timer is running', () => {
      expect(definition.getPostponed()).to.have.length(2);
    });

    let state;
    Given('state is saved', () => {
      state = definition.getState();
      definition.stop();
    });

    let end;
    When('run is recovered, resumed at timeout', () => {
      ck.travel(Date.now() + 1000 * 60 * 60 * 8);
      definition = new Definition(context.clone()).recover(state);
      end = definition.waitFor('leave');
      definition.resume();
    });

    Then('run completes', () => {
      return end;
    });
  });
});
