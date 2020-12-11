import Definition from '../../src/definition/Definition';
import factory from '../helpers/factory';
import JsExtension from '../resources/extensions/JsExtension';
import testHelpers from '../helpers/testHelpers';

const signalsSource = factory.resource('signals.bpmn');

Feature('Signals', () => {
  Scenario('Two processes that communicates with signals', () => {
    let definition;
    Given('a trade process waiting for spot price update signal and another admin processs that updates price', async () => {
      definition = await prepareSource();
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    let tradeTask, spotPriceChanged;
    Then('trader is considering to trade', async () => {
      [spotPriceChanged, tradeTask] = definition.getPostponed();
      expect(tradeTask).to.be.ok;
      expect(tradeTask.content.form.fields.price.defaultValue).to.equal(100);
    });

    And('spot price is monitored by process', async () => {
      expect(spotPriceChanged).to.be.ok;
    });

    let approveNewPriceTask;
    Given('spot price is updated', async () => {
      const wait = definition.waitFor('activity.wait', (_, api) => {
        return api.content.type === 'bpmn:UserTask';
      });

      const signal = definition.getActivityById('spotPriceUpdate');
      definition.signal(signal.resolve());

      approveNewPriceTask = await wait;
    });

    When('admin approves new spot price', () => {
      const wait = definition.waitFor('activity.wait', (_, api) => {
        return api.content.type === 'bpmn:UserTask';
      });

      approveNewPriceTask.signal({
        form: {
          newPrice: 99
        }
      });

      return wait;
    });

    Then('trade task is discarded', async () => {
      [tradeTask, spotPriceChanged] = definition.getPostponed();
      expect(tradeTask.owner.counters).to.have.property('discarded', 1);
    });

    And('update price is taken', async () => {
      expect(spotPriceChanged.owner.counters).to.have.property('taken', 1);
    });

    And('trader is presented new price', () => {
      expect(tradeTask.content.form.fields.price.defaultValue).to.equal(99);
    });

    When('trader trades', () => {
      tradeTask.signal({form: {amount: 42}});
    });

    And('trade task is taken', () => {
      expect(tradeTask.owner.counters).to.have.property('taken', 1);
      expect(tradeTask.owner.counters).to.have.property('discarded', 1);
    });

    And('run is completed', async () => {
      return end;
    });
  });

  Scenario('Resume processes that communicates with signals', () => {
    let definition;
    Given('a trade process waiting for spot price update signal and another admin processs that updates price', async () => {
      definition = await prepareSource();
    });

    When('definition is ran', () => {
      definition.run();
    });

    let tradeTask, spotPriceChanged;
    Then('trader is considering to trade', async () => {
      [spotPriceChanged, tradeTask] = definition.getPostponed();
      expect(tradeTask).to.be.ok;
      expect(tradeTask.content.form.fields.price.defaultValue).to.equal(100);
    });

    let approveNewPriceTask;
    Given('spot price is updated', async () => {
      const wait = definition.waitFor('activity.wait', (_, api) => {
        return api.content.type === 'bpmn:UserTask';
      });

      const signal = definition.getActivityById('spotPriceUpdate');
      definition.signal(signal.resolve());

      approveNewPriceTask = await wait;
    });

    When('admin approves new spot price', () => {
      const wait = definition.waitFor('activity.wait', (_, api) => {
        return api.content.type === 'bpmn:UserTask';
      });

      approveNewPriceTask.signal({
        form: {
          newPrice: 101
        }
      });

      return wait;
    });

    Then('trade task is discarded', async () => {
      [tradeTask, spotPriceChanged] = definition.getPostponed();
      expect(tradeTask.owner.counters).to.have.property('discarded', 1);
    });

    And('update price is taken', async () => {
      expect(spotPriceChanged.owner.counters).to.have.property('taken', 1);
    });

    Given('trade is stopped', () => {
      definition.stop();
    });

    let end;
    When('resumed', () => {
      end = definition.waitFor('end');
      definition.resume();
    });

    Then('trader is presented new price', () => {
      const postponed = definition.getPostponed();
      expect(postponed).to.have.length(2);

      [tradeTask, spotPriceChanged] = postponed;

      expect(tradeTask.content.form.fields.price.defaultValue).to.equal(101);
    });

    When('trader trades', () => {
      tradeTask.signal({amount: 42});
    });

    And('run is completed', async () => {
      return end;
    });
  });

  Scenario('anonymous signal', () => {
    let definition;
    Given('anonymous signal process, anonymous signal catch start process, anonymous escalation process', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="signalProcess" isExecutable="true">
          <intermediateThrowEvent id="escalate">
            <signalEventDefinition />
          </intermediateThrowEvent>
        </process>
        <process id="managerProcess">
          <startEvent id="wakeManager">
            <signalEventDefinition />
          </startEvent>
        </process>
        <process id="bossProcess">
          <startEvent id="wakeBoss">
            <signalEventDefinition signalRef="BossSignal" />
          </startEvent>
        </process>
        <process id="signaledProcess">
          <startEvent id="startWithAnonymousSignal">
            <escalationEventDefinition />
          </startEvent>
        </process>
        <escalation id="BossSignal" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = Definition(context);
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    let signalProcess, managerProcess, bossProcess, signaledProcess;
    Then('run completes', async () => {
      await end;
      [signalProcess, managerProcess, bossProcess, signaledProcess] = definition.getProcesses();
    });

    And('escalate process completed', () => {
      expect(signalProcess.counters).to.have.property('completed', 1);
    });

    And('manger process completed', () => {
      expect(managerProcess.counters).to.have.property('completed', 1);
    });

    And('the boss is not bothered', () => {
      expect(bossProcess.counters).to.have.property('completed', 0);
    });

    And('the escalation process is not touched', () => {
      expect(signaledProcess.counters).to.have.property('completed', 0);
    });
  });

  Scenario('Process with end throwing signal and a start event waiting for signal', () => {
    let definition;
    Given('a process with two flows with user input, the first flow ends with signal, the second expects signal and then user input', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="signalProcess" isExecutable="true">
          <startEvent id="start1" />
          <sequenceFlow id="toTask1" sourceRef="start1" targetRef="task1" />
          <userTask id="task1" />
          <sequenceFlow id="toEnd1" sourceRef="task1" targetRef="end1" />
          <endEvent id="end1">
            <signalEventDefinition />
          </endEvent>

          <startEvent id="start2">
            <signalEventDefinition />
          </startEvent>
          <sequenceFlow id="toTask2" sourceRef="start2" targetRef="task2" />
          <userTask id="task2" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = Definition(context);
    });

    When('definition is ran', () => {
      definition.run();
    });

    let task1, start2;
    Then('first user task is waiting for input and second start event waits for signal', async () => {
      const postponed = definition.getPostponed();
      expect(postponed).to.have.length(2);
      [task1, start2] = postponed;
      expect(task1).to.be.ok;
      expect(task1).to.have.property('id', 'task1');
      expect(start2).to.have.property('id', 'start2');
    });

    When('first user task receives input', async () => {
      task1.signal();
    });

    Then('first flow is completed', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
    });

    And('second flow is continued', () => {
      expect(start2.owner.counters).to.have.property('taken', 1);
    });

    let task2;
    And('second user task is awaiting input', async () => {
      const postponed = definition.getPostponed();
      expect(postponed).to.have.length(1);
      [task2] = postponed;
      expect(task2).to.be.ok;
      expect(task2).to.have.property('id', 'task2');
    });

    When('second user task receives input', async () => {
      task2.signal();
    });

    Then('run completes', () => {
      expect(definition.counters).to.have.property('completed', 1);
    });
  });

  Scenario('Flow ending with signal that completes immediately, and a catch event (issue #3)', () => {
    let definition;
    const logBook = [];
    Given('a process with two flows with logging, the first flow ends with signal, the second catches signal and then logs', async () => {
      const source = factory.resource('issue-3.bpmn');
      const context = await testHelpers.context(source);

      definition = Definition(context, {
        services: {
          log(...args) {
            logBook.push(...args);
          }
        }
      });
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('definition completes immediately', () => {
      return end;
    });

    And('first flow script logged', () => {
      expect(logBook[0]).to.equal('task1');
    });

    And('second flow script logged', () => {
      expect(logBook[1]).to.equal('task2');
    });
  });

  Scenario('Signal elements from definition', () => {
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
          <sequenceFlow id="toTask1" sourceRef="start" targetRef="task1" />
          <userTask id="task1" />
          <sequenceFlow id="toLoopTask" sourceRef="task1" targetRef="loopTask" />
          <userTask id="loopTask">
            <multiInstanceLoopCharacteristics isSequential="false">
              <loopCardinality>3</loopCardinality>
            </multiInstanceLoopCharacteristics>
          </userTask>
          <sequenceFlow id="toReceiveAnon" sourceRef="loopTask" targetRef="receiveAnon" />
          <receiveTask id="receiveAnon" />
          <sequenceFlow id="toReceive" sourceRef="receiveAnon" targetRef="receive" />
          <receiveTask id="receive" messageRef="namedMessage" />
          <sequenceFlow id="toLoopReceive" sourceRef="receive" targetRef="loopReceive" />
          <receiveTask id="loopReceive" messageRef="namedMessage">
            <multiInstanceLoopCharacteristics isSequential="false">
              <loopCardinality>3</loopCardinality>
            </multiInstanceLoopCharacteristics>
          </receiveTask>
          <sequenceFlow id="toAnonSignal" sourceRef="loopReceive" targetRef="anonSignalEvent" />
          <intermediateCatchEvent id="anonSignalEvent">
            <signalEventDefinition />
          </intermediateCatchEvent>
          <sequenceFlow id="toSecondAnonSignal" sourceRef="anonSignalEvent" targetRef="secondAnonSignalEvent" />
          <intermediateCatchEvent id="secondAnonSignalEvent">
            <signalEventDefinition />
          </intermediateCatchEvent>
          <sequenceFlow id="toNamedSignalEvent" sourceRef="secondAnonSignalEvent" targetRef="namedSignalEvent" />
          <intermediateCatchEvent id="namedSignalEvent">
            <signalEventDefinition signalRef="namedSignal" />
          </intermediateCatchEvent>
          <sequenceFlow id="toAnonMessageEvent" sourceRef="namedSignalEvent" targetRef="anonMessageEvent" />
          <intermediateCatchEvent id="anonMessageEvent">
            <messageEventDefinition />
          </intermediateCatchEvent>
          <sequenceFlow id="toNamedMessageEvent" sourceRef="anonMessageEvent" targetRef="namedMessageEvent" />
          <intermediateCatchEvent id="namedMessageEvent">
            <messageEventDefinition id="messageDef" messageRef="namedMessage" />
          </intermediateCatchEvent>
          <sequenceFlow id="toEnd" sourceRef="namedMessageEvent" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, {
        extensions: {
          js: JsExtension,
        }
      });
      definition = Definition(context);
    });

    let end;
    const output = {};
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();

      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => {
        output[msg.content.id] = msg.content.output;
      }, {noAck: true});
    });

    let activity;
    Then('execution stops at form start event', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'start');
    });

    When('definition signals form start event', () => {
      definition.signal({
        id: 'start'
      });
    });

    Then('execution stops at first user task', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'task1');
    });

    When('definition signals without message', () => {
      definition.signal();
    });

    Then('task is still running', () => {
      expect(activity.owner.status).to.equal('executing');
    });

    When('definition signals with unknown id', () => {
      definition.signal({id: 'hittepa'});
    });

    Then('task is still running', () => {
      expect(activity.owner.isRunning).to.be.true;
      expect(activity.owner.status).to.equal('executing');
    });

    When('definition signals with task id and some input', () => {
      definition.signal({id: 'task1', input: 1});
    });

    Then('task completes', () => {
      expect(activity.owner.isRunning).to.be.false;
    });

    And('task output is set', () => {
      expect(output).to.have.property('task1').with.property('input', 1);
    });

    And('looped task is executing', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'loopTask');
    });

    When('definition signals with looped task id only', () => {
      definition.signal({id: 'loopTask', input: 1});
    });

    Then('looped task is still running', () => {
      expect(activity.owner.isRunning).to.be.true;
      expect(activity.owner.status).to.equal('executing');
    });

    When('definition signals with unknown execution id', () => {
      definition.signal({id: 'loopTask', executionId: 'hittepa', input: 1});
    });

    Then('looped task is still running', () => {
      expect(activity.owner.isRunning).to.be.true;
      expect(activity.owner.status).to.equal('executing');
    });

    When('definition signals with first iteration execution id', () => {
      const [iteration] = activity.getExecuting();
      definition.signal({id: 'loopTask', executionId: iteration.executionId, input: 1});
    });

    Then('looped task is still running', () => {
      expect(activity.owner.isRunning).to.be.true;
      expect(activity.owner.status).to.equal('executing');
    });

    When('definition signals with second iteration execution id', () => {
      const [iteration] = activity.getExecuting();
      definition.signal({id: 'loopTask', executionId: iteration.executionId, input: 2});
    });

    Then('looped task is still running', () => {
      expect(activity.owner.isRunning).to.be.true;
      expect(activity.owner.status).to.equal('executing');
    });

    When('definition signals with third iteration execution id', () => {
      const [iteration] = activity.getExecuting();
      definition.signal({id: 'loopTask', executionId: iteration.executionId, input: 3});
    });

    Then('looped task completes', () => {
      expect(activity.owner.isRunning).to.be.false;
    });

    And('task output is set', () => {
      expect(output).to.have.property('loopTask').that.have.length(3);
      expect(output.loopTask[0]).to.have.property('input', 1);
      expect(output.loopTask[1]).to.have.property('input', 2);
      expect(output.loopTask[2]).to.have.property('input', 3);
    });

    And('anonymous receive task is executing', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'receiveAnon');
    });

    When('definition signals without message', () => {
      definition.signal();
    });

    Then('anonymous receive task completes', () => {
      expect(activity.owner.isRunning).to.be.false;
    });

    And('receive task with message is waiting to be signaled', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'receive');
    });

    When('definition sends signal with incorrect message id', () => {
      definition.signal({id: 'hittepa'});
    });

    Then('receive task is still running', () => {
      expect(activity.owner.isRunning).to.be.true;
      expect(activity.owner.status).to.equal('executing');
    });

    When('definition sends signal with correct message ref id', () => {
      definition.signal({id: 'namedMessage', input: 15});
    });

    Then('receive task completes with output', () => {
      expect(activity.owner.isRunning).to.be.false;
      expect(output).to.have.property('receive').with.property('input', 15);
    });

    And('looped receive task is executing', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'loopReceive');
    });

    When('definition sends signal with incorrect message id', () => {
      definition.signal({id: 'hittepa'});
    });

    Then('looped receive task is still running', () => {
      expect(activity.owner.isRunning).to.be.true;
      expect(activity.owner.status).to.equal('executing');
    });

    When('definition sends signal with correct message ref id', () => {
      definition.signal({id: 'namedMessage', input: 1});
    });

    Then('loop receive task iteration completes', () => {
      expect(activity.owner.isRunning).to.be.true;
    });

    And('looped receive still has iterations', () => {
      expect(activity.getExecuting()).to.have.length(2);
    });

    When('definition sends signal with correct message ref id', () => {
      definition.signal({id: 'namedMessage', input: 2});
    });

    Then('loop receive task iteration completes', () => {
      expect(activity.owner.isRunning).to.be.true;
    });

    And('looped receive still has iterations', () => {
      expect(activity.getExecuting()).to.have.length(1);
    });

    When('definition sends signal with correct message ref id', () => {
      definition.signal({id: 'namedMessage', input: 3});
    });

    Then('loop receive task completes with output', () => {
      expect(activity.owner.isRunning).to.be.false;
      expect(output).to.have.property('loopReceive').that.have.length(3);
      expect(output.loopReceive[0]).to.have.property('input', 1);
      expect(output.loopReceive[1]).to.have.property('input', 2);
      expect(output.loopReceive[2]).to.have.property('input', 3);
    });

    And('anonymous signal event is executing', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'anonSignalEvent');
    });

    When('definition signals without message', () => {
      definition.signal();
    });

    Then('anonymous signal event completes', () => {
      expect(activity.owner.isRunning).to.be.false;
    });

    And('second anonymous signal event is waiting to be signaled', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'secondAnonSignalEvent');
    });

    When('definition signals with message', () => {
      definition.signal({input: 6});
    });

    Then('second anonymous signal event completes with output', () => {
      expect(activity.owner.isRunning).to.be.false;
      expect(output).to.have.property('secondAnonSignalEvent').with.property('input', 6);
    });

    And('named signal event is waiting to be signaled', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'namedSignalEvent');
    });

    When('definition send anonymous signal', () => {
      definition.signal();
    });

    Then('named signal event is still running', () => {
      expect(activity.owner.isRunning).to.be.true;
      expect(activity.owner.status).to.equal('executing');
    });

    When('definition sends signal with incorrect signal id', () => {
      definition.signal({id: 'hittepa'});
    });

    Then('named signal event is still running', () => {
      expect(activity.owner.isRunning).to.be.true;
      expect(activity.owner.status).to.equal('executing');
    });

    When('definition sends signal with correct signal ref id', () => {
      definition.signal({id: 'namedSignal', input: 5});
    });

    Then('named signal event completes with output', () => {
      expect(activity.owner.isRunning).to.be.false;
      expect(output).to.have.property('namedSignalEvent').with.property('input', 5);
    });

    And('anonymous message event is waiting to be signaled', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'anonMessageEvent');
    });

    When('definition signals with message', () => {
      definition.signal({input: 7});
    });

    Then('anonymous message event completes with output', () => {
      expect(activity.owner.isRunning).to.be.false;
      expect(output).to.have.property('anonMessageEvent').with.property('input', 7);
    });

    And('anonymous message event is waiting to be signaled', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'namedMessageEvent');
    });


    When('definition send anonymous signal', () => {
      definition.signal();
    });

    Then('named signal event is still running', () => {
      expect(activity.owner.isRunning).to.be.true;
      expect(activity.owner.status).to.equal('executing');
    });

    When('definition sends signal with incorrect signal id', () => {
      definition.signal({id: 'hittepa'});
    });

    Then('named signal event is still running', () => {
      expect(activity.owner.isRunning).to.be.true;
      expect(activity.owner.status).to.equal('executing');
    });

    When('definition sends signal with correct signal ref id', () => {
      definition.signal({id: 'namedMessage', input: 8});
    });

    Then('named signal event completes with output', () => {
      expect(activity.owner.isRunning).to.be.false;
      expect(output).to.have.property('namedMessageEvent').with.property('input', 8);
    });

    And('execution completes', () => {
      return end;
    });
  });

  Scenario('Signal immediately after resume execution', () => {
    let context;
    Given('a process with start event with form, user task, looped user task, receive task, signal events, and message events', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <signal id="namedSignal" name="NamedSignal" />
        <message id="namedMessage" name="NamedMessage" />
        <process id="signalProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="toTask1" sourceRef="start" targetRef="task1" />
          <userTask id="task1" />
          <sequenceFlow id="toReceiveAnon" sourceRef="task1" targetRef="receiveAnon" />
          <receiveTask id="receiveAnon" />
          <sequenceFlow id="toReceive" sourceRef="receiveAnon" targetRef="receive" />
          <receiveTask id="receive" messageRef="namedMessage" />
          <sequenceFlow id="toAnonSignal" sourceRef="receive" targetRef="anonSignalEvent" />
          <intermediateCatchEvent id="anonSignalEvent">
            <signalEventDefinition />
          </intermediateCatchEvent>
          <sequenceFlow id="toSecondAnonSignal" sourceRef="anonSignalEvent" targetRef="secondAnonSignalEvent" />
          <intermediateCatchEvent id="secondAnonSignalEvent">
            <signalEventDefinition />
          </intermediateCatchEvent>
          <sequenceFlow id="toNamedSignalEvent" sourceRef="secondAnonSignalEvent" targetRef="namedSignalEvent" />
          <intermediateCatchEvent id="namedSignalEvent">
            <signalEventDefinition signalRef="namedSignal" />
          </intermediateCatchEvent>
          <sequenceFlow id="toAnonMessageEvent" sourceRef="namedSignalEvent" targetRef="anonMessageEvent" />
          <intermediateCatchEvent id="anonMessageEvent">
            <messageEventDefinition />
          </intermediateCatchEvent>
          <sequenceFlow id="toNamedMessageEvent" sourceRef="anonMessageEvent" targetRef="namedMessageEvent" />
          <intermediateCatchEvent id="namedMessageEvent">
            <messageEventDefinition id="messageDef" messageRef="namedMessage" />
          </intermediateCatchEvent>
          <sequenceFlow id="toEnd" sourceRef="namedMessageEvent" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
    });

    let end, state, definition;
    const output = {};
    When('definition is ran', () => {
      definition = Definition(context);
      definition.run();

      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => {
        output[msg.content.id] = msg.content.output;
      }, {noAck: true});
    });

    let activity;
    Then('execution stops at first user task', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'task1');
    });

    Given('execution state is saved', () => {
      state = definition.getState();
    });

    When('definition is resumed and immediately signaled', () => {
      definition = Definition(context.clone());
      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => {
        output[msg.content.id] = msg.content.output;
      }, {noAck: true});
      definition.recover(state);
      definition.resume();
      definition.signal({id: activity.id, input: 1});
    });

    Then('activity output is set signal message', () => {
      expect(output).to.have.property('task1').with.property('input', 1);
    });

    And('next activity is running', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'receiveAnon');
    });

    Given('execution state is saved', () => {
      state = definition.getState();
    });

    When('definition is resumed and immediately signaled', () => {
      definition = Definition(context.clone());
      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => {
        output[msg.content.id] = msg.content.output;
      }, {noAck: true});
      definition.recover(state);
      definition.resume();
      definition.signal({
        id: activity.content.message ? activity.content.message.id : undefined,
        input: 1,
      });
    });

    Then('activity output is set signal message', () => {
      expect(output).to.have.property('receiveAnon').with.property('input', 1);
    });

    And('next activity is running', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'receive');
    });

    Given('execution state is saved', () => {
      state = definition.getState();
    });

    When('definition is resumed and immediately signaled', () => {
      definition = Definition(context.clone());
      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => {
        output[msg.content.id] = msg.content.output;
      }, {noAck: true});
      definition.recover(state);
      definition.resume();

      definition.signal({
        id: activity.content.message ? activity.content.message.id : undefined,
        input: 1,
      });
    });

    Then('activity output is set to signal message', () => {
      expect(output).to.have.property('receive').with.property('input', 1);
    });

    And('next activity is running', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'anonSignalEvent');
    });

    Given('execution state is saved', () => {
      state = definition.getState();
    });

    let wait;
    When('definition is resumed', () => {
      definition = Definition(context.clone());
      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => {
        output[msg.content.id] = msg.content.output;
      }, {noAck: true});
      definition.recover(state);

      wait = definition.waitFor('wait');

      definition.resume();
      definition.signal({
        id: activity.content.message ? activity.content.message.id : undefined,
        input: 1,
      });
    });

    Then('activity output is set to signal message', () => {
      expect(output).to.have.property('anonSignalEvent').with.property('input', 1);
    });

    And('wait was emitted with resumed flag', async () => {
      const api = await wait;
      expect(api.content).to.have.property('isRecovered', true);
    });

    And('next activity is running', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'secondAnonSignalEvent');
    });

    Given('execution state is saved', () => {
      state = definition.getState();
    });

    When('definition is resumed and immediately signaled', () => {
      definition = Definition(context.clone());
      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => {
        output[msg.content.id] = msg.content.output;
      }, {noAck: true});
      definition.recover(state);
      definition.resume();

      definition.signal({
        id: activity.content.message ? activity.content.message.id : undefined,
        input: 1,
      });
    });

    Then('activity output is set to signal message', () => {
      expect(output).to.have.property('secondAnonSignalEvent').with.property('input', 1);
    });

    And('next activity is running', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'namedSignalEvent');
    });

    Given('execution state is saved', () => {
      state = definition.getState();
    });

    When('definition is resumed and immediately signaled', () => {
      definition = Definition(context.clone());
      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => {
        output[msg.content.id] = msg.content.output;
      }, {noAck: true});
      definition.recover(state);
      definition.resume();

      definition.signal({
        id: activity.content.message ? activity.content.message.id : undefined,
        input: 1,
      });
    });

    Then('activity output is set to signal message', () => {
      expect(output).to.have.property('secondAnonSignalEvent').with.property('input', 1);
    });

    And('next activity is running', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'namedSignalEvent');
    });

    Given('execution state is saved', () => {
      state = definition.getState();
    });

    When('definition is resumed and immediately signaled', () => {
      definition = Definition(context.clone());
      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => {
        output[msg.content.id] = msg.content.output;
      }, {noAck: true});
      definition.recover(state);
      definition.resume();

      definition.signal({
        id: activity.content.signal ? activity.content.signal.id : undefined,
        input: 1,
      });
    });

    Then('activity output is set to signal message', () => {
      expect(output).to.have.property('namedSignalEvent').with.property('input', 1);
    });

    And('next activity is running', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'anonMessageEvent');
    });

    Given('execution state is saved', () => {
      state = definition.getState();
    });

    When('definition is resumed and immediately signaled', () => {
      definition = Definition(context.clone());
      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => {
        output[msg.content.id] = msg.content.output;
      }, {noAck: true});
      definition.recover(state);

      wait = definition.waitFor('wait');

      definition.resume();

      definition.signal({
        id: activity.content.message ? activity.content.message.id : undefined,
        input: 1,
      });
    });

    Then('activity output is set to signal message', () => {
      expect(output).to.have.property('namedSignalEvent').with.property('input', 1);
    });

    And('next activity is running', () => {
      [activity] = definition.getPostponed();
      expect(activity).to.have.property('id', 'namedMessageEvent');
    });

    And('wait was emitted with resumed flag', async () => {
      const api = await wait;
      expect(api.content).to.have.property('isRecovered', true);
    });

    Given('execution state is saved', () => {
      state = definition.getState();
    });

    When('definition is resumed and immediately signaled', () => {
      definition = Definition(context.clone());
      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => {
        output[msg.content.id] = msg.content.output;
      }, {noAck: true});
      definition.recover(state);
      definition.resume();

      definition.signal({
        id: activity.content.message ? activity.content.message.id : undefined,
        input: 1,
      });
    });

    Then('activity output is set to signal message', () => {
      expect(output).to.have.property('namedMessageEvent').with.property('input', 1);
    });

    And('execution completes', () => {
      return end;
    });
  });
});

async function prepareSource() {
  const context = await testHelpers.context(signalsSource, {
    extensions: {
      camunda: {
        moddleOptions: require('camunda-bpmn-moddle/resources/camunda'),
      }
    }
  });
  const definition = Definition(context, {
    variables: {
      spotPrice: 100
    },
    services: {
      getSpotPrice,
    },
    extensions: {
      camunda(activity) {
        if (activity.behaviour.extensionElements) {
          for (const extension of activity.behaviour.extensionElements.values) {
            switch (extension.$type) {
              case 'camunda:FormData':
                formFormatting(activity, extension);
                break;
              case 'camunda:InputOutput':
                ioFormatting(activity, extension);
                break;
            }
          }
        }
        if (activity.behaviour.expression) {
          activity.behaviour.Service = ServiceExpression;
        }
        if (activity.behaviour.resultVariable) {
          activity.on('end', (api) => {
            activity.environment.output[activity.behaviour.resultVariable] = api.content.output;
          });
        }
      },
    }
  });

  function formFormatting(activity, formData) {
    const {broker, environment} = activity;
    broker.subscribeTmp('event', 'activity.enter', (_, message) => {
      const form = {
        fields: {}
      };
      formData.fields.forEach((field) => {
        form.fields[field.id] = {...field};
        form.fields[field.id].defaultValue = environment.resolveExpression(form.fields[field.id].defaultValue, message);
      });
      broker.publish('format', 'run.form', { form });
    }, {noAck: true});
  }

  function ioFormatting(activity, ioData) {
    const {broker, environment} = activity;
    if (ioData.inputParameters) {
      broker.subscribeTmp('event', 'activity.enter', (_, message) => {
        const input = ioData.inputParameters.reduce((result, data) => {
          result[data.name] = environment.resolveExpression(data.value, message);
          return result;
        }, {});
        broker.publish('format', 'run.input', { input });
      }, {noAck: true});
    }
    if (ioData.outputParameters) {
      broker.subscribeTmp('event', 'activity.end', (_, message) => {
        ioData.outputParameters.forEach((data) => {
          definition.environment.variables[data.name] = environment.output[data.name] = environment.resolveExpression(data.value, message);
        });
      }, {noAck: true});
    }
  }

  function getSpotPrice(ctx, callback) {
    const price = definition.environment.variables.spotPrice;
    return callback(null, price);
  }

  function ServiceExpression(activity) {
    const {type: atype, behaviour, environment} = activity;
    const expression = behaviour.expression;
    const type = `${atype}:expression`;
    return {
      type,
      expression,
      execute,
    };
    function execute(executionMessage, callback) {
      const serviceFn = environment.resolveExpression(expression, executionMessage);
      serviceFn.call(activity, executionMessage, (err, result) => {
        callback(err, result);
      });
    }
  }

  return definition;
}
