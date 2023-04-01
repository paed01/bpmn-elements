import Definition from '../../src/definition/Definition.js';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';

const transactionSource = factory.resource('transaction.bpmn');

Feature('Transaction', () => {
  Scenario('A transaction with compensation and a cancel boundary event', () => {
    let definition;
    const undoService = [];
    const options = {
      services: {
        compare(answer, str) {
          return answer === str;
        },
        compensate(...args) {
          undoService.push(args);
        },
      },
      extensions: {
        me({broker, environment}) {
          broker.subscribeTmp('event', 'activity.#', (routingKey, {content}) => {
            switch (routingKey) {
              case 'activity.end': {
                if ('output' in content) environment.output[content.id] = content.output;
                break;
              }
            }
          }, {noAck: true, consumerTag: 'save-output-tag'});
        },
      },
    };

    Given('a transaction a user task monitored by cancel- and error-listener', async () => {
      const context = await testHelpers.context(transactionSource);
      definition = new Definition(context, options);
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    let userTask;
    Then('the transaction waits for user input', () => {
      const transaction = definition.getPostponed((e) => e.id === 'atomic')[0];
      expect(transaction).to.have.property('id', 'atomic');

      userTask = transaction.getPostponed().pop();

      expect(transaction.content).to.have.property('isTransaction', true);

      expect(userTask).to.have.property('id', 'areUSure');
    });

    And('compensation service is not started', () => {
      expect(undoService).to.have.length(0);
    });

    When('user decides to cancel', () => {
      userTask.signal('No');
    });

    Then('compensation service is waiting for callback', () => {
      expect(undoService).to.have.length(1);
    });

    And('transaction waits for compensation', () => {
      const transaction = definition.getActivityById('atomic');
      expect(transaction.counters).to.deep.equal({
        taken: 0,
        discarded: 0,
      });
    });

    And('the cancel event waits for transaction to complete', () => {
      const cancelled = definition.getActivityById('cancelled');
      expect(cancelled.counters).to.deep.equal({
        taken: 0,
        discarded: 0,
      });
    });

    let undoCallback;
    And('it has the execute complete data from the service task', () => {
      [, undoCallback] = undoService.pop();
    });

    When('compensation service completes', () => {
      undoCallback(null, true);
    });

    Then('definition completes', () => {
      return end;
    });

    And('transaction was discarded', () => {
      const transaction = definition.getActivityById('atomic');
      expect(transaction.counters).to.deep.equal({
        taken: 0,
        discarded: 1,
      });
    });

    And('cancel was triggered', () => {
      const cancelled = definition.getActivityById('cancelled');
      expect(cancelled.counters).to.have.property('taken', 1);
      expect(cancelled.counters).to.have.property('discarded', 0);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('the transaction again waits for user input', () => {
      const transaction = definition.getPostponed((e) => e.id === 'atomic')[0];
      expect(transaction).to.have.property('id', 'atomic');

      userTask = transaction.getPostponed().pop();

      expect(transaction.content).to.have.property('isTransaction', true);

      expect(userTask).to.have.property('id', 'areUSure');
    });

    And('compensation service is not started', () => {
      expect(undoService).to.have.length(0);
    });

    When('user decides to continue', () => {
      userTask.signal('Yes');
    });

    Then('definition completes', () => {
      return end;
    });

    And('cancel was not triggered', () => {
      const cancelled = definition.getActivityById('cancelled');
      expect(cancelled.counters).to.have.property('taken', 1);
      expect(cancelled.counters).to.have.property('discarded', 1);
    });

    Given('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('definition is stopped', () => {
      definition.stop();
    });

    When('resumed', () => {
      definition.resume();
    });

    Then('user input is expected', () => {
      const transaction = definition.getPostponed((e) => e.id === 'atomic')[0];
      expect(transaction).to.have.property('id', 'atomic');
      userTask = transaction.getPostponed().pop();
      expect(userTask).to.have.property('id', 'areUSure');
    });

    When('user decides to cancel', () => {
      userTask.signal('No');
    });

    Then('compensation service is waiting for callback', () => {
      expect(undoService).to.have.length(1);
    });

    When('compensated', () => {
      undoService.pop()[1]();
    });

    Then('resumed definition completes', () => {
      return end;
    });

    And('resumed cancel was triggered', () => {
      const cancelled = definition.getActivityById('cancelled');
      expect(cancelled.counters).to.deep.equal({
        taken: 2,
        discarded: 1,
      });
    });

    Given('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('definition is stopped', () => {
      definition.stop();
    });

    let recovered;
    When('recovered with state', async () => {
      const context = await testHelpers.context(transactionSource);
      recovered = new Definition(context, options).recover(definition.getState());

      end = recovered.waitFor('end');
      recovered.resume();
    });

    Then('user input is expected', () => {
      const transaction = recovered.getPostponed((e) => e.id === 'atomic')[0];
      expect(transaction).to.have.property('id', 'atomic');
      userTask = transaction.getPostponed().pop();
      expect(userTask).to.have.property('id', 'areUSure');
    });

    When('user decides to cancel', () => {
      userTask.signal('No');
    });

    Then('compensation service is waiting for callback', () => {
      expect(undoService).to.have.length(1);
    });

    When('compensated', () => {
      undoService.pop()[1]();
    });

    Then('recovered definition completes', () => {
      return end;
    });

    And('cancel was triggered', () => {
      const cancelled = recovered.getActivityById('cancelled');
      expect(cancelled.counters).to.deep.equal({
        taken: 3,
        discarded: 1,
      });
    });
  });

  Scenario('A transaction with compensation and an error boundary event', () => {
    let definition;
    const undoService = [];
    const options = {
      services: {
        compare(answer, str) {
          return answer === str;
        },
        compensate(...args) {
          undoService.push(args);
        },
      },
      extensions: {
        me({broker}, {environment}) {
          broker.subscribeTmp('event', 'activity.#', (routingKey, {content}) => {
            switch (routingKey) {
              case 'activity.end': {
                if ('output' in content) environment.output[content.id] = content.output;
                break;
              }
            }
          }, {noAck: true, consumerTag: 'save-output-tag'});
        },
      },
    };

    Given('a transaction a user task monitored by cancel- and error-listener', async () => {
      const context = await testHelpers.context(transactionSource);
      definition = new Definition(context, options);
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    let userTask;
    Then('the transaction waits for user input', () => {
      const transaction = definition.getPostponed((e) => e.id === 'atomic')[0];
      expect(transaction).to.have.property('id', 'atomic');

      userTask = transaction.getPostponed().pop();

      expect(transaction.content).to.have.property('isTransaction', true);

      expect(userTask).to.have.property('id', 'areUSure');
    });

    And('compensation service is not started', () => {
      expect(undoService).to.have.length(0);
    });

    When('user decides to abort', () => {
      userTask.signal('abort');
    });

    Then('compensation service is not waiting for callback', () => {
      expect(undoService).to.have.length(0);
    });

    And('transaction is discarded', () => {
      const transaction = definition.getActivityById('atomic');
      expect(transaction.counters).to.deep.equal({
        taken: 0,
        discarded: 1,
      });
    });

    And('definition completes', () => {
      return end;
    });

    And('the cancel event was discarded', () => {
      const cancelled = definition.getActivityById('cancelled');
      expect(cancelled.counters).to.deep.equal({
        taken: 0,
        discarded: 1,
      });
    });

    And('error was triggered', () => {
      const errored = definition.getActivityById('errored');
      expect(errored.counters).to.deep.equal({
        taken: 1,
        discarded: 0,
      });
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('the transaction again waits for user input', () => {
      const transaction = definition.getPostponed((e) => e.id === 'atomic')[0];
      expect(transaction).to.have.property('id', 'atomic');

      userTask = transaction.getPostponed().pop();

      expect(transaction.content).to.have.property('isTransaction', true);

      expect(userTask).to.have.property('id', 'areUSure');
    });

    And('compensation service is not started', () => {
      expect(undoService).to.have.length(0);
    });

    When('user decides to continue', () => {
      userTask.signal('Yes');
    });

    Then('definition completes', () => {
      return end;
    });

    And('error was not triggered', () => {
      const errored = definition.getActivityById('errored');
      expect(errored.counters).to.deep.equal({
        taken: 1,
        discarded: 1,
      });
    });

    And('cancel was not triggered', () => {
      const cancelled = definition.getActivityById('cancelled');
      expect(cancelled.counters).to.deep.equal({
        taken: 0,
        discarded: 2,
      });
    });

    Given('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('definition is stopped', () => {
      definition.stop();
    });

    When('resumed', () => {
      definition.resume();
    });

    Then('resumed user input is expected', () => {
      const [transaction] = definition.getPostponed((e) => e.id === 'atomic');
      expect(transaction).to.have.property('id', 'atomic');
      userTask = transaction.getPostponed().pop();
      expect(userTask).to.have.property('id', 'areUSure');
    });

    When('user decides to abort', () => {
      userTask.signal('abort');
    });

    Then('compensation service is not waiting for callback', () => {
      expect(undoService).to.have.length(0);
    });

    Then('resumed definition completes', () => {
      return end;
    });

    And('error was triggered again', () => {
      const errored = definition.getActivityById('errored');
      expect(errored.counters).to.deep.equal({
        taken: 2,
        discarded: 1,
      });
    });

    And('cancel was not triggered', () => {
      const cancelled = definition.getActivityById('cancelled');
      expect(cancelled.counters).to.deep.equal({
        taken: 0,
        discarded: 3,
      });
    });

    Given('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('definition is stopped', () => {
      definition.stop();
    });

    let recovered;
    When('recovered with state', async () => {
      const context = await testHelpers.context(transactionSource);
      recovered = new Definition(context, options).recover(definition.getState());

      end = recovered.waitFor('end');
      recovered.resume();
    });

    Then('user input is expected', () => {
      const transaction = recovered.getPostponed((e) => e.id === 'atomic')[0];
      expect(transaction).to.have.property('id', 'atomic');
      userTask = transaction.getPostponed().pop();
      expect(userTask).to.have.property('id', 'areUSure');
    });

    When('user decides to abort', () => {
      userTask.signal('abort');
    });

    Then('compensation service is not waiting for callback', () => {
      expect(undoService).to.have.length(0);
    });

    And('recovered definition completes', () => {
      return end;
    });

    And('error was triggered', () => {
      const errored = recovered.getActivityById('errored');
      expect(errored.counters).to.deep.equal({
        taken: 3,
        discarded: 1,
      });
    });

    And('cancel was not triggered', () => {
      const cancelled = recovered.getActivityById('cancelled');
      expect(cancelled.counters).to.deep.equal({
        taken: 0,
        discarded: 4,
      });
    });
  });

  Scenario('Combined cancel- and error-listener', () => {
    let context;
    Given('a transaction monitored by combined error and cancel listeners', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="theProcess" isExecutable="true">
          <transaction id="atomic">
            <startEvent id="start" />
            <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
            <sequenceFlow id="flow2" sourceRef="start" targetRef="cancelTask" />
            <userTask id="task" />
            <boundaryEvent id="comp" cancelActivity="true" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <association id="association" sourceRef="comp" targetRef="compensate" />
            <userTask id="compensate" isForCompensation="true" />
            <userTask id="cancelTask" />
            <sequenceFlow id="flow3" sourceRef="task" targetRef="end" />
            <sequenceFlow id="flow4" sourceRef="cancelTask" targetRef="cancelEnd" />
            <endEvent id="end" />
            <endEvent id="cancelEnd">
              <cancelEventDefinition />
            </endEvent>
          </transaction>
          <boundaryEvent id="bound" attachedToRef="atomic">
            <cancelEventDefinition />
            <errorEventDefinition />
          </boundaryEvent>
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    let definition, end;
    When('definition is ran', () => {
      definition = new Definition(context);
      end = definition.waitFor('end');
      definition.run();
    });

    let userTask, cancelTask, transaction;
    Then('the transaction waits for user input', () => {
      transaction = definition.getPostponed((e) => e.id === 'atomic')[0];
      expect(transaction).to.have.property('id', 'atomic');

      [,, userTask, cancelTask] = transaction.getPostponed();

      expect(transaction.content).to.have.property('isTransaction', true);

      expect(userTask).to.have.property('id', 'task');
      expect(cancelTask).to.have.property('id', 'cancelTask');
    });

    When('user decides to continue', () => {
      userTask.signal();
      cancelTask.discard();
    });

    Then('definition completes', () => {
      return end;
    });

    And('transaction completed', () => {
      const atomic = definition.getActivityById('atomic');
      expect(atomic.counters).to.deep.equal({
        discarded: 0,
        taken: 1,
      });
    });

    And('combined listener was discarded', () => {
      const bound = definition.getActivityById('bound');
      expect(bound.counters).to.deep.equal({
        discarded: 1,
        taken: 0,
      });
    });

    Given('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();

      transaction = definition.getPostponed((e) => e.id === 'atomic')[0];
      expect(transaction).to.have.property('id', 'atomic');
      [,, userTask, cancelTask] = transaction.getPostponed();

      expect(userTask).to.have.property('id', 'task');
      expect(cancelTask).to.have.property('id', 'cancelTask');
    });

    When('transaction is cancelled', () => {
      userTask.signal({me: true});
      cancelTask.signal();
    });

    let compensate;
    Then('compensate is waiting', () => {
      [, compensate] = transaction.getPostponed();
      expect(compensate).to.have.property('id', 'compensate');
    });

    When('compensate tasks completes', () => {
      compensate.signal();
    });

    Then('definition completes again', () => {
      return end;
    });

    And('transaction is discarded', () => {
      const atomic = definition.getActivityById('atomic');
      expect(atomic.counters).to.deep.equal({
        discarded: 1,
        taken: 1,
      });
    });

    And('combined bound event was discarded', () => {
      const bound = definition.getActivityById('bound');
      expect(bound.counters).to.deep.equal({
        discarded: 1,
        taken: 1,
      });
    });
  });

  Scenario('Ignored bug not caught by this scenario', () => {
    let context;
    Given('a transaction with a monitored task ending succeeded by volative service task', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="theProcess" isExecutable="true">
          <boundaryEvent id="cancelled" attachedToRef="atomic">
            <cancelEventDefinition />
          </boundaryEvent>
          <transaction id="atomic">
            <startEvent id="start" />
            <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
            <task id="task" />
            <boundaryEvent id="listen" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <serviceTask id="compensate" isForCompensation="true" implementation="\${environment.services.compensate}" />
            <sequenceFlow id="to-wait" sourceRef="task" targetRef="wait" />
            <userTask id="wait" />
            <sequenceFlow id="to-volatile" sourceRef="wait" targetRef="volatile" />
            <serviceTask id="volatile" implementation="\${environment.services.volatile}" />
            <sequenceFlow id="flow3" sourceRef="volatile" targetRef="endcancel" />
            <endEvent id="endcancel">
              <cancelEventDefinition />
            </endEvent>
            <association id="i-hear-you" sourceRef="listen" targetRef="compensate" />
          </transaction>
          <boundaryEvent id="errored" attachedToRef="atomic">
            <errorEventDefinition />
          </boundaryEvent>
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    let options, definition, end;
    const compensations = [];
    const volatile = [];
    When('definition is ran', () => {
      options = {
        services: {
          compensate(...args) {
            compensations.push(args);
          },
          volatile(...args) {
            volatile.push(args);
          },
        },
      };
      definition = new Definition(context, options);
      end = definition.waitFor('end');
      definition.run();
    });

    When('user task is signaled via definition', () => {
      definition.signal({id: 'wait'});
    });

    And('succeeding service task completes', () => {
      expect(volatile.length).to.equal(1);
      volatile.pop().pop()();
    });

    Then('compensation is triggered', () => {
      expect(compensations.length).to.equal(1);
      expect(compensations[0][0].content.message.content.id).to.equal('task');
    });

    When('compensated', () => {
      compensations.pop().pop()();
    });

    Then('transaction is discarded', async () => {
      await end;
      const atomic = definition.getActivityById('atomic');
      expect(atomic.counters).to.deep.equal({
        discarded: 1,
        taken: 0,
      });
    });

    And('monitoring cancel was taken', () => {
      const atomic = definition.getActivityById('cancelled');
      expect(atomic.counters).to.deep.equal({
        discarded: 0,
        taken: 1,
      });
    });

    And('catch error event was discarded', () => {
      const atomic = definition.getActivityById('errored');
      expect(atomic.counters).to.deep.equal({
        discarded: 1,
        taken: 0,
      });
    });

    Given('definition is ran again', () => {
      definition.run();
    });

    When('user task is signaled', () => {
      definition.signal({id: 'wait'});
    });

    And('succeeding service task fails with error', () => {
      expect(volatile.length).to.equal(1);
      volatile.pop().pop()(new Error('Unexpected'));
    });

    Then('compensation is NOT triggered', () => {
      expect(compensations.length).to.equal(0);
    });

    And('run completes', () => {
      return end;
    });

    And('catch error event was taken', () => {
      const atomic = definition.getActivityById('errored');
      expect(atomic.counters).to.deep.equal({
        discarded: 1,
        taken: 1,
      });
    });
  });

  Scenario('Compensation ignored bug', () => {
    let context;
    Given('a transaction with cancel listener', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="theProcess" isExecutable="true">
          <boundaryEvent id="cancelled" attachedToRef="atomic">
            <cancelEventDefinition />
          </boundaryEvent>
          <transaction id="atomic">
            <startEvent id="start" />
            <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
            <task id="task" />
            <boundaryEvent id="listen" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <serviceTask id="compensate" isForCompensation="true" implementation="\${environment.services.compensate}" />
            <sequenceFlow id="to-endcancel" sourceRef="task" targetRef="endcancel" />
            <endEvent id="endcancel">
              <cancelEventDefinition />
            </endEvent>
            <association id="i-hear-you" sourceRef="listen" targetRef="compensate" />
          </transaction>
          <boundaryEvent id="errored" attachedToRef="atomic">
            <errorEventDefinition />
          </boundaryEvent>
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    let options, definition, end;
    const compensations = [];
    When('definition is ran', () => {
      options = {
        services: {
          compensate(...args) {
            compensations.push(args);
          },
        },
      };
      definition = new Definition(context, options);
      end = definition.waitFor('end');
      definition.run();
    });

    Then('compensation is triggered', () => {
      expect(compensations.length).to.equal(1);
      expect(compensations[0][0].content.message.content.id).to.equal('task');
    });

    When('compensated', () => {
      compensations.pop().pop()();
    });

    Then('transaction is discarded', async () => {
      await end;
      const atomic = definition.getActivityById('atomic');
      expect(atomic.counters).to.deep.equal({
        discarded: 1,
        taken: 0,
      });
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('compensation is triggered', () => {
      expect(compensations.length).to.equal(1);
      expect(compensations[0][0].content.message.content.id).to.equal('task');
    });

    When('compensated', () => {
      compensations.pop().pop()();
    });

    Then('transaction is discarded', async () => {
      await end;
      const atomic = definition.getActivityById('atomic');
      expect(atomic.counters).to.deep.equal({
        discarded: 2,
        taken: 0,
      });
    });

    Given('a transaction without cancel listener', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="theProcess" isExecutable="true">
          <transaction id="atomic">
            <startEvent id="start" />
            <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
            <task id="task" />
            <boundaryEvent id="listen" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <serviceTask id="compensate" isForCompensation="true" implementation="\${environment.services.compensate}" />
            <sequenceFlow id="to-endcancel" sourceRef="task" targetRef="endcancel" />
            <endEvent id="endcancel">
              <cancelEventDefinition />
            </endEvent>
            <association id="i-hear-you" sourceRef="listen" targetRef="compensate" />
          </transaction>
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    When('definition is ran', () => {
      options = {
        services: {
          compensate(...args) {
            compensations.push(args);
          },
        },
      };
      definition = new Definition(context, options);
      end = definition.waitFor('end');
      definition.run();
    });

    Then('compensation is triggered', () => {
      expect(compensations.length).to.equal(1);
      expect(compensations[0][0].content.message.content.id).to.equal('task');
    });

    When('compensated', () => {
      compensations.pop().pop()();
    });

    Then('transaction is discarded', async () => {
      await end;
      const atomic = definition.getActivityById('atomic');
      expect(atomic.counters).to.deep.equal({
        discarded: 1,
        taken: 0,
      });
    });

    Given('a transaction with a monitored task ending gateway that has cancel', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <transaction id="atomic">
            <task id="mainTask" name="Main" />
            <association id="fwdMainEvents" sourceRef="compensateBound" targetRef="compensateTask" />
            <boundaryEvent id="compensateBound" attachedToRef="mainTask">
              <compensateEventDefinition />
            </boundaryEvent>
            <sequenceFlow id="toAreUSure" sourceRef="mainTask" targetRef="areUSure" />
            <userTask id="areUSure" name="Are you sure?" />
            <serviceTask id="compensateTask" name="Compensate main" isForCompensation="true" implementation="\${environment.services.compensate}" />
            <sequenceFlow id="noFlow" name="No" sourceRef="areUSure" targetRef="endCancel" />
            <endEvent id="endCancel">
              <cancelEventDefinition />
            </endEvent>
          </transaction>
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    When('definition is ran', () => {
      definition = new Definition(context, options);
      end = definition.waitFor('leave');
      definition.run();
    });

    And('user task is signaled via definition', () => {
      definition.signal({id: 'areUSure'});
    });

    Then('compensation is triggered', () => {
      expect(compensations.length).to.equal(1);
      expect(compensations[0][0].content.message.content.id).to.equal('mainTask');
    });

    When('compensation completes', () => {
      compensations.pop().pop()();
    });

    And('transaction is discarded', () => {
      return end;
    });

    When('ran again', () => {
      definition.run();
    });

    And('user task is signaled directly', () => {
      end = definition.waitFor('leave');
      const transaction = definition.getPostponed((e) => e.id === 'atomic')[0];
      const userTask = transaction.getPostponed().pop();
      userTask.signal();
    });

    Then('compensation is triggered', () => {
      expect(compensations.length).to.equal(1);
      expect(compensations[0][0].content.message.content.id).to.equal('mainTask');
    });

    When('compensated', () => {
      compensations.pop().pop()();
    });

    Then('transaction completes', async () => {
      await end;
    });
  });
});
