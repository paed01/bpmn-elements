import ck from 'chronokinesis';
import Definition from '../../src/definition/Definition';
import JsExtension from '../resources/extensions/JsExtension';
import testHelpers from '../helpers/testHelpers';

Feature('Stop and resume', () => {
  after(ck.reset);

  Scenario('Stop and resume at activity wait', () => {
    let definition;
    Given('a process with form start event, user task, looped user task, receive task, signal events, and message events', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:js="http://paed01.github.io/bpmn-engine/schema/2017/08/bpmn">
        <signal id="namedSignal" name="NamedSignal" />
        <message id="namedMessage" name="NamedMessage" />
        <process id="signalProcess" isExecutable="true">
          <startEvent id="start" js:formKey="start-form" />
          <sequenceFlow id="to-user-task" sourceRef="start" targetRef="user-task" />
          <userTask id="user-task" />
          <sequenceFlow id="to-parallell-task" sourceRef="user-task" targetRef="parallell-task" />
          <userTask id="parallell-task">
            <multiInstanceLoopCharacteristics isSequential="false">
              <loopCardinality>3</loopCardinality>
            </multiInstanceLoopCharacteristics>
          </userTask>
          <sequenceFlow id="to-receive" sourceRef="parallell-task" targetRef="receive" />
          <receiveTask id="receive" />
          <sequenceFlow id="to-sequential-task" sourceRef="receive" targetRef="sequential-task" />
          <receiveTask id="sequential-task">
            <multiInstanceLoopCharacteristics isSequential="true">
              <loopCardinality>3</loopCardinality>
            </multiInstanceLoopCharacteristics>
          </receiveTask>
          <sequenceFlow id="to-signal-event" sourceRef="sequential-task" targetRef="signal-event" />
          <intermediateCatchEvent id="signal-event">
            <signalEventDefinition />
          </intermediateCatchEvent>
          <sequenceFlow id="to-message-event" sourceRef="signal-event" targetRef="message-event" />
          <intermediateCatchEvent id="message-event">
            <messageEventDefinition />
          </intermediateCatchEvent>
          <sequenceFlow id="to-end" sourceRef="signal-event" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, {
        extensions: {
          js: JsExtension,
        }
      });
      definition = new Definition(context);
    });

    let stoppedAt;
    const stoppedAtExecutionIds = [];
    And('a listener that will stop the process if waiting unless recovered', () => {
      definition.on('wait', (api) => {
        if (api.content.isRecovered) return;

        stoppedAt = api.id;

        stoppedAtExecutionIds.push(api.content.executionId);

        definition.stop();
      });
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run has stopped at start with form', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('start');
    });

    When('resumed and signaled', () => {
      definition.resume();
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
    });

    Then('run has stopped at user task', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('user-task');
    });

    When('resumed and signaled', () => {
      definition.resume();
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
    });

    Then('run has stopped at parallell looped activity', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('parallell-task');
    });

    When('resumed and signal all pending parallell iteration', () => {
      definition.resume();
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
    });

    Then('run has stopped at receive task', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('receive');
    });

    When('resumed and signaled', () => {
      definition.resume();
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
    });

    Then('run has stopped at first sequential looped activity iteration', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('sequential-task');
    });

    When('resumed and signaled', () => {
      definition.resume();
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
    });

    Then('run has stopped at second sequential looped activity iteration', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('sequential-task');
    });

    When('resumed and signaled', () => {
      definition.resume();
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
    });

    Then('run has stopped at third sequential looped activity iteration', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('sequential-task');
    });

    When('resumed and signaled', () => {
      definition.resume();
      definition.signal({id: stoppedAt, executionId: stoppedAtExecutionIds.shift()});
    });

    Then('run has stopped at anonymous signal event', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('signal-event');
    });

    When('resumed and anonymously signaled', () => {
      definition.resume();
      stoppedAtExecutionIds.shift();
      definition.signal();
    });

    Then('run has stopped at anonymous message event', () => {
      expect(definition.stopped).to.be.true;
      expect(stoppedAt).to.equal('message-event');
    });

    When('resumed and anonymously signaled', () => {
      definition.resume();
      stoppedAtExecutionIds.shift();
      definition.signal();
    });

    Then('run completes', () => {
      return end;
    });
  });

  Scenario('Stop and resume at activity timer', () => {
    after(ck.reset);

    let source, definition;
    Given('a process with form start event, user task, looped user task, receive task, signal events, and message events', async () => {
      source = `<definitions id="def-timer" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp-timer" isExecutable="true">
          <startEvent id="start">
            <timerEventDefinition id="timer">
              <timeDuration xsi:type="tFormalExpression">PT10S</timeDuration>
            </timerEventDefinition>
          </startEvent>
          <sequenceFlow id="to-end" sourceRef="start" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, {timers: Timers()});
      definition = new Definition(context);
    });

    function Timers() {
      const timers = new Set();

      return {
        get size() {
          return timers.size;
        },
        timers,
        register() {
          return {
            setTimeout: this.setTimeout,
            clearTimeout: this.clearTimeout,
          };
        },
        setTimeout(...args) {
          timers.add(args);
          return args;
        },
        clearTimeout(ptr) {
          timers.delete(ptr);
        },
      };
    }

    let state;
    And('a listener that will save state at definition activity timer', () => {
      definition.on('activity.timer', (api) => {
        if (api.content.isRecovered) return;
        state = definition.getState();
      });
    });

    let timerEvent;
    When('ran', () => {
      timerEvent = definition.waitFor('activity.timer');
      definition.run();
    });

    Then('timer has fired', async () => {
      await timerEvent;
      definition.stop();
    });

    When('recovered and resumed', async () => {
      ck.travel(Date.now() + 5000);
      const context = await testHelpers.context(source, {timers: Timers()});
      definition = new Definition(context);

      definition.recover(state);
      timerEvent = definition.waitFor('activity.timer');
      definition.resume();
    });

    Then('timer event fired again', () => {
      return timerEvent;
    });

    And('one timer is added', () => {
      expect(definition.environment.timers.size).to.equal(1);
    });

    Given('a listener that will save state at activity timer', async () => {
      const context = await testHelpers.context(source, {timers: Timers()});
      definition = new Definition(context);
    });

    When('ran', () => {
      timerEvent = definition.waitFor('activity.timer');
      definition.run();
    });

    Then('timer is added', () => {
      expect(definition.environment.timers.size).to.equal(1);
      for (const timer of definition.environment.timers.timers.entries()) {
        expect(timer[1][1]).to.equal(10000);
      }
    });

    When('stopped and state is saved', async () => {
      await timerEvent;

      setImmediate(() => {
        definition.stop();
      });

      await definition.waitFor('stop');
      state = definition.getState();
    });

    Then('timer is stopped', () => {
      expect(definition.environment.timers.size).to.equal(0);
    });

    When('recovered and resumed', async () => {
      ck.travel(Date.now() + 5000);

      const context = await testHelpers.context(source, {timers: Timers()});
      definition = new Definition(context);

      definition.recover(state);
      timerEvent = definition.waitFor('activity.timer');
      definition.resume();
    });

    Then('timer event fired again', () => {
      return timerEvent;
    });

    And('one timer is added', () => {
      expect(definition.environment.timers.size).to.equal(1);
      for (const timer of definition.environment.timers.timers.entries()) {
        expect(timer[1][1]).to.be.below(5000);
      }
    });
  });

  Scenario('Stop and resume at timer with loopback flows', () => {
    let context, definition;
    const instances = [];

    const source = `
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="to-task1" sourceRef="start" targetRef="task1" />
        <userTask id="task1" />
        <sequenceFlow id="to-task2" sourceRef="task1" targetRef="task2" />
        <userTask id="task2" />
        <boundaryEvent id="timeout1" attachedToRef="task2">
          <timerEventDefinition id="timer1">
            <timeDuration xsi:type="tFormalExpression">PT5M</timeDuration>
          </timerEventDefinition>
        </boundaryEvent>
        <boundaryEvent id="timeout2" attachedToRef="task2">
          <timerEventDefinition id="timer2">
            <timeDuration xsi:type="tFormalExpression">PT10M</timeDuration>
          </timerEventDefinition>
        </boundaryEvent>

        <sequenceFlow id="back-to-task1" sourceRef="timeout1" targetRef="task1" />

        <sequenceFlow id="to-terminate" sourceRef="timeout2" targetRef="terminate" />
        <endEvent id="terminate">
          <terminateEventDefinition />
        </endEvent>

        <sequenceFlow id="to-end" sourceRef="task2" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;

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
        setTimeout(...args) {
          instances.push(args);
          return args;
        },
        clearTimeout(ref) {
          const idx = instances.indexOf(ref);
          if (idx > -1) instances.splice(idx, 1);
        },
      };
    }

    Given('a definition with a task with two timeouts, first loops back to previous task', async () => {
      context = await testHelpers.context(source, {timers: Timers()});
      definition = new Definition(context);
    });

    let state;
    When('ran and stopped at definition second bound activity.timer', (done) => {
      definition.broker.subscribeTmp('event', 'activity.timer', (_, msg) => {
        if (msg.content.id !== 'timeout2') return;
        definition.broker.cancel(msg.fields.consumerTag);
        setImmediate(() => definition.stop());
      }, {noAck: true});

      definition.once('stop', () => {
        state = definition.getState();
        done();
      });

      definition.run();
      definition.signal({id: 'task1'});
    });

    Then('state is saved', () => {
      expect(state).to.be.ok;
    });

    When('recovered and resumed', async () => {
      context = await testHelpers.context(source, {timers: Timers()});
      definition = new Definition(context).recover(state);
      definition.resume();
    });

    And('first timeout kicks', (done) => {
      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => {
        if (msg.content.id !== 'timeout1') return;
        definition.broker.cancel(msg.fields.consumerTag);
        setImmediate(() => definition.stop());
      }, {noAck: true});

      definition.once('stop', () => {
        state = definition.getState();
        done();
      });

      expect(instances).to.have.length(2);
      const idx = instances.findIndex(([,, msg]) => msg.content.id === 'timeout1');
      const [cb,, ...args] = instances.splice(idx, 1).pop();
      cb(...args);
    });

    Then('state is saved', () => {
      expect(state).to.be.ok;
    });

    When('recovered and resumed', async () => {
      context = await testHelpers.context(source, {timers: Timers()});
      definition = new Definition(context).recover(state);
      definition.resume();
    });

    And('previous task is signaled', () => {
      definition.signal({id: 'task1'});
    });

    And('second timeout kicks and state is saved at timeout', (done) => {
      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => {
        if (msg.content.id !== 'timeout2') return;
        definition.broker.cancel(msg.fields.consumerTag);
        definition.stop();
      }, {noAck: true});

      definition.once('stop', () => {
        state = definition.getState();
        done();
      });

      expect(instances).to.have.length(2);
      const idx = instances.findIndex(([,, msg]) => msg.content.id === 'timeout2');
      const [cb,, ...args] = instances.splice(idx, 1).pop();
      cb(...args);
    });

    let leave;
    When('recovered and resumed', async () => {
      context = await testHelpers.context(source, {timers: Timers()});
      definition = new Definition(context).recover(state);
      leave = definition.waitFor('leave');
      definition.resume();
    });

    Then('run completes', () => {
      return leave;
    });
  });
});
