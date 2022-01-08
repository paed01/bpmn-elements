import CamundaExtension from '../resources/extensions/CamundaExtension';
import Definition from '../../src/definition/Definition';
import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';
import {ActivityError, BpmnError} from '../../src/error/Errors';

const bpmnErrorSource = factory.resource('bpmn-error.bpmn');

class CustomError extends Error {
  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

Feature('Errors', () => {
  Scenario('Custom error is thrown', () => {
    let context, definition, serviceCallback;
    const options = {
      services: {
        volatile(_, next) {
          serviceCallback = next;
        }
      }
    };

    Given('a source with a volatile service task and a catch boundary event expecting an error code', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="Process_0" isExecutable="true">
          <serviceTask id="service" implementation="\${environment.services.volatile}" />
          <boundaryEvent id="catchError" attachedToRef="service">
            <errorEventDefinition errorRef="Error_0" />
          </boundaryEvent>
        </process>
        <error id="Error_0" errorCode="ERR_ASSERTION" />
      </definitions>`;

      context = await testHelpers.context(source);
      definition = new Definition(context, options);
    });

    let error;
    When('definition is ran', () => {
      error = definition.waitFor('error');
      definition.run();
    });

    And('service fails without error code', () => {
      serviceCallback(new CustomError('Unknown'));
    });

    Then('definition throws error', async () => {
      const errApi = await error;
      expect(errApi.content).to.have.property('error');
      expect(errApi.content.error).to.have.property('message', 'Unknown');
    });

    And('completes', () => {
      expect(definition.isRunning).to.be.false;
    });

    let leave;
    When('definition is ran again', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    And('service fails with caught error code', () => {
      error = definition.waitFor('activity.error');
      serviceCallback(new CustomError('Known', 'ERR_ASSERTION'));
    });

    Then('definition completes', async () => {
      return leave;
    });

    And('error bubbled to definition', async () => {
      const errApi = await error;
      expect(errApi.content).to.have.property('error');
      expect(errApi.content.error).to.have.property('message', 'Known');
      expect(errApi.content.error).to.have.property('code', 'ERR_ASSERTION');
    });

    let state;
    When('definition is ran with listener that saves state on error', () => {
      definition.once('error', () => {
        state = definition.getState();
      });
      error = definition.waitFor('error');
      definition.run();
    });

    And('service fails without error code', () => {
      serviceCallback(new CustomError('Unknown'));
    });

    Then('state is saved', () => {
      expect(state).to.be.ok;
    });

    let recovered;
    Given('definition is recovered', () => {
      recovered = new Definition(context.clone(), options).recover(state);
    });

    When('resumed', () => {
      error = recovered.waitFor('error');
      recovered.resume();
    });

    Then('resumed definition throws error', async () => {
      const errApi = await error;

      expect(errApi.content).to.have.property('error');
      expect(errApi.content.error).to.be.instanceof(ActivityError);
      expect(errApi.content.error).to.have.property('name', 'CustomError');
      expect(errApi.content.error).to.have.property('message', 'Unknown');
    });
  });

  Scenario('sub process ends with anonymous error event', () => {
    let definition;
    Given('a source with a sub process with an end error event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="Process_0" isExecutable="true">
          <subProcess id="errorSubProcess">
            <endEvent id="end">
              <errorEventDefinition />
            </endEvent>
          </subProcess>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end, thrown;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      thrown = definition.waitFor('activity.throw');
      definition.run();
    });

    let endApi;
    Then('error is thrown by end event', async () => {
      endApi = await thrown;
    });

    And('definition completes', () => {
      return end;
    });

    And('end event was taken', () => {
      expect(endApi.owner.counters).to.have.property('taken', 1);
      expect(endApi.owner.counters).to.have.property('discarded', 0);
    });

    And('sub process completed', () => {
      expect(definition.getActivityById('errorSubProcess').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('errorSubProcess').counters).to.have.property('discarded', 0);
    });
  });

  Scenario('sub process ends with anonymous error caught by bound event', () => {
    let definition;
    Given('a source with a sub process with an end error event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="Process_0" isExecutable="true">
          <subProcess id="errorSubProcess">
            <endEvent id="endInPain">
              <errorEventDefinition />
            </endEvent>
          </subProcess>
          <boundaryEvent id="catch" attachedToRef="errorSubProcess">
            <errorEventDefinition />
          </boundaryEvent>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end, thrown;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      thrown = definition.waitFor('activity.throw');
      definition.run();
    });

    let endApi;
    Then('error is thrown by end event', async () => {
      endApi = await thrown;
    });

    And('definition completes', () => {
      return end;
    });

    And('end event was taken', () => {
      expect(endApi.owner.counters).to.have.property('taken', 1);
      expect(endApi.owner.counters).to.have.property('discarded', 0);
    });

    And('sub process was discarded', () => {
      expect(definition.getActivityById('errorSubProcess').counters).to.have.property('taken', 0);
      expect(definition.getActivityById('errorSubProcess').counters).to.have.property('discarded', 1);
    });

    And('error was caught', () => {
      expect(definition.getActivityById('catch').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('catch').counters).to.have.property('discarded', 0);
    });
  });

  Scenario('sub process ends with known error caught by bound event', () => {
    let definition;
    Given('a sub process with an end error event and two boundary events', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="Process_0" isExecutable="true">
          <subProcess id="errorSubProcess">
            <endEvent id="endInPain">
              <errorEventDefinition errorRef="Error_0" />
            </endEvent>
          </subProcess>
          <boundaryEvent id="catch0" attachedToRef="errorSubProcess">
            <errorEventDefinition errorRef="Error_0" />
          </boundaryEvent>
          <boundaryEvent id="catch1" attachedToRef="errorSubProcess">
            <errorEventDefinition errorRef="Error_1" />
          </boundaryEvent>
        </process>
        <error id="Error_0" />
        <error id="Error_1" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end, thrown;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      thrown = definition.waitFor('activity.throw');
      definition.run();
    });

    let endApi;
    Then('error is thrown by end event', async () => {
      endApi = await thrown;
    });

    And('definition completes', () => {
      return end;
    });

    And('end event was taken', () => {
      expect(endApi.owner.counters).to.have.property('taken', 1);
      expect(endApi.owner.counters).to.have.property('discarded', 0);
    });

    And('sub process was discarded', () => {
      expect(definition.getActivityById('errorSubProcess').counters).to.have.property('taken', 0);
      expect(definition.getActivityById('errorSubProcess').counters).to.have.property('discarded', 1);
    });

    And('error was caught by first boundary event', () => {
      expect(definition.getActivityById('catch0').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('catch0').counters).to.have.property('discarded', 0);
    });

    And('second boundary event was discarded', () => {
      expect(definition.getActivityById('catch1').counters).to.have.property('taken', 0);
      expect(definition.getActivityById('catch1').counters).to.have.property('discarded', 1);
    });
  });

  Scenario('sub process ends with known error caught by start event', () => {
    let definition;
    Given('a sub process with an end error event a sub process handling error event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="Process_0" isExecutable="true">
          <subProcess id="errorSubProcess">
            <endEvent id="endInPain">
              <errorEventDefinition errorRef="Error_0" />
            </endEvent>
            <subProcess id="catchErrorSubProcess" triggeredByEvent="true">
              <startEvent id="releasePain">
                <errorEventDefinition errorRef="Error_0" />
              </startEvent>
            </subProcess>
          </subProcess>
        </process>
        <error id="Error_0" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end, thrown, caught;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      thrown = definition.waitFor('activity.throw');
      caught = definition.waitFor('activity.catch');
      definition.run();
    });

    let endApi;
    Then('error is thrown by end event', async () => {
      endApi = await thrown;
    });

    And('definition completes', () => {
      return end;
    });

    And('end event was taken', () => {
      expect(endApi.owner.counters).to.have.property('taken', 1);
      expect(endApi.owner.counters).to.have.property('discarded', 0);
    });

    And('sub process completed', () => {
      expect(definition.getActivityById('errorSubProcess').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('errorSubProcess').counters).to.have.property('discarded', 0);
    });

    And('error was handled by sub process', async () => {
      const startApi = await caught;
      expect(startApi.owner.counters).to.have.property('taken', 1);
      expect(startApi.owner.counters).to.have.property('discarded', 0);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('error is thrown by end event', async () => {
      endApi = await thrown;
    });

    And('definition completes', () => {
      return end;
    });

    And('end event was taken', () => {
      expect(endApi.owner.counters).to.have.property('taken', 1);
      expect(endApi.owner.counters).to.have.property('discarded', 0);
    });

    And('sub process completed', () => {
      expect(definition.getActivityById('errorSubProcess').counters).to.have.property('taken', 2);
      expect(definition.getActivityById('errorSubProcess').counters).to.have.property('discarded', 0);
    });

    And('error was handled by sub process', async () => {
      const startApi = await caught;
      expect(startApi.owner.counters).to.have.property('taken', 1);
      expect(startApi.owner.counters).to.have.property('discarded', 0);
    });
  });

  Scenario('error with error code', () => {
    let context, definition, serviceCallback, source;
    Given('a service task with a catch error boundary event', async () => {
      source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="Process_0" isExecutable="true">
          <serviceTask id="service" implementation="\${environment.services.get}" />
          <boundaryEvent id="catchError" attachedToRef="service">
            <errorEventDefinition errorRef="Error_0" />
          </boundaryEvent>
        </process>
        <error id="Error_0" errorCode="404" />
      </definitions>`;

      context = await testHelpers.context(source);
      context.environment.addService('get', function get(_, next) {
        serviceCallback = next;
      });
      definition = new Definition(context);
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('service encounters error with error code that match known error', () => {
      serviceCallback(new BpmnError('Not found', {
        errorCode: 404
      }));
    });

    Then('service was discarded', () => {
      const service = definition.getActivityById('service');
      expect(service.counters).to.have.property('taken', 0);
      expect(service.counters).to.have.property('discarded', 1);
    });

    And('error was caught', async () => {
      const catchError = definition.getActivityById('catchError');
      expect(catchError.counters).to.have.property('taken', 1);
      expect(catchError.counters).to.have.property('discarded', 0);
    });

    And('definition completes', () => {
      return end;
    });

    let errored;
    When('definition is ran again', () => {
      errored = definition.waitFor('error');
      definition.run();
    });

    And('service encounters error with unknown error code', () => {
      serviceCallback(new BpmnError('Unauthorized', {
        errorCode: 401
      }));
    });

    let errApi;
    Then('definition is errored', async () => {
      errApi = await errored;
      expect(errApi.content).to.have.property('error');
      expect(errApi.content.error).to.have.property('name', 'BpmnError');
      expect(errApi.content.error).to.have.property('code', '401');
      expect(errApi.content.error).to.have.property('message', 'Unauthorized');
    });

    And('boundary event was discarded', async () => {
      const catchError = definition.getActivityById('catchError');
      expect(catchError.counters).to.have.property('taken', 1);
      expect(catchError.counters).to.have.property('discarded', 1);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Given('and definition is stopped', () => {
      definition.stop();
    });

    When('definition is resumed', () => {
      definition.resume();
    });

    And('service encounters error with error code that match known error', () => {
      serviceCallback(new BpmnError('Not found', {
        errorCode: 404
      }));
    });

    And('definition completes', () => {
      return end;
    });

    And('error was caught', async () => {
      const catchError = definition.getActivityById('catchError');
      expect(catchError.counters).to.have.property('taken', 2);
      expect(catchError.counters).to.have.property('discarded', 1);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    let state;
    Given('and definition is stopped and state is saved', () => {
      definition.stop();
      state = JSON.stringify(definition.getState());
    });

    let recoveredDefinition;
    When('definition is recovered somewhere else', async () => {
      const newContext = await testHelpers.context(source);
      newContext.environment.addService('get', function get(_, next) {
        serviceCallback = next;
      });

      recoveredDefinition = new Definition(newContext);
      recoveredDefinition.recover(JSON.parse(state));
    });

    And('resumed', () => {
      end = recoveredDefinition.waitFor('end');
      recoveredDefinition.resume();
    });

    And('recovered service encounters error with error code that match known error', () => {
      serviceCallback(new BpmnError('Not found', {
        errorCode: 404
      }));
    });

    And('recovered definition completes', () => {
      return end;
    });

    And('error was caught', async () => {
      const catchError = recoveredDefinition.getActivityById('catchError');
      expect(catchError.counters).to.have.property('taken', 3);
      expect(catchError.counters).to.have.property('discarded', 1);
    });

    Given('definition is ran with error listener where state is saved', () => {
      state = undefined;
      definition = new Definition(context.clone());
      definition.once('error', () => {
        state = JSON.stringify(definition.getState(), null, 2);
      });
      context.environment.addService('get', function get(_, next) {
        serviceCallback = next;
      });

      definition.run();
    });

    When('service call fails again uncaught error code', () => {
      serviceCallback(new BpmnError('Unauthorized', {
        errorCode: 401
      }));
    });

    Then('state is saved', () => {
      expect(state).to.be.ok;
    });

    When('definition is recovered somewhere else', async () => {
      const newContext = context.clone();
      newContext.environment.addService('get', function get(_, next) {
        serviceCallback = next;
      });

      recoveredDefinition = new Definition(newContext);
      recoveredDefinition.recover(JSON.parse(state));
    });

    And('resumed', () => {
      errored = recoveredDefinition.waitFor('error');
      recoveredDefinition.resume();
    });

    Then('recovered definition throws', async () => {
      errApi = await errored;

      expect(errApi.content).to.have.property('error');
      expect(errApi.content.error).to.have.property('name', 'BpmnError');
      expect(errApi.content.error).to.have.property('code', '401');
      expect(errApi.content.error).to.have.property('message', 'Unauthorized');
    });
  });

  Scenario('a process with error throwing end event', () => {
    let definition;
    Given('a sub process that throws BpmnError and a catch error event followed by signal', async () => {
      definition = await prepareSource();
    });

    let signal, end, thrown;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      thrown = definition.waitFor('activity.throw');
      signal = definition.waitFor('activity.signal');
      definition.run();
    });

    let orderProcess, boundCatch;
    Then('error is monitored', () => {
      [boundCatch, orderProcess] = definition.getPostponed();
      expect(boundCatch.content).to.have.property('expect').that.eql({
        id: 'Error_1',
        type: 'bpmn:Error',
        messageType: 'throw',
        name: 'ScamError',
        code: 'AmountTooBig',
      });
    });

    And('amount above treshold is ordered', () => {
      const [, orderTask] = orderProcess.getPostponed();
      expect(orderTask).to.be.ok;
      expect(orderTask.content.form).to.have.property('fields');
      orderTask.signal({
        form: {
          amount: 11
        }
      });
    });

    let endApi;
    Then('error is thrown by end event', async () => {
      endApi = await thrown;
    });

    And('definition completes', () => {
      return end;
    });

    And('error was caught', () => {
      expect(boundCatch.owner.counters).to.have.property('taken', 1);
      expect(boundCatch.owner.counters).to.have.property('discarded', 0);
    });

    And('end event was discarded', () => {
      expect(endApi.owner.counters).to.have.property('taken', 0);
      expect(endApi.owner.counters).to.have.property('discarded', 1);
    });

    And('sub process was discarded', async () => {
      expect(orderProcess.owner.counters).to.have.property('taken', 0);
      expect(orderProcess.owner.counters).to.have.property('discarded', 1);
    });

    And('signal is sent', async () => {
      const endSignal = await signal;
      expect(endSignal.owner.counters).to.have.property('taken', 1);
      expect(endSignal.owner.counters).to.have.property('discarded', 0);
      expect(endSignal.content).to.have.property('message').that.eql({
        id: 'EscalatedSignal',
        type: 'bpmn:Signal',
        messageType: 'signal',
        name: 'Too big signal',
        parent: {
          id: 'Definition_0',
          type: 'bpmn:Definitions',
        }
      });
    });

    And('run is completed', async () => {
      return end;
    });
  });

  Scenario('throw error inside script', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="Definitions_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <process id="mainProcess" isExecutable="true">
        <scriptTask id="task" scriptFormat="js">
          <script>next(new BpmnError('adsad', {id: 'Error_1'}))</script>
        </scriptTask>
        <boundaryEvent id="bound-err" attachedToRef="task">
          <errorEventDefinition errorRef="Error_1" />
        </boundaryEvent>
      </process>
      <error id="Error_1" name="Error" />
    </definitions>`;

    let context, definition;
    Given('process with task with bound named error', async () => {
      context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let execution, end;
    When('run without listener', () => {
      end = definition.waitFor('end');
      execution = definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('script task was discarded', () => {
      const task = execution.getActivityById('task');
      expect(task.counters).to.contain({
        taken: 0,
        discarded: 1,
      });
    });

    And('thrown error was caught', () => {
      const errorEvent = execution.getActivityById('bound-err');
      expect(errorEvent.counters).to.contain({
        taken: 1,
        discarded: 0,
      });
    });
  });

  Scenario('throw error inside listener', () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>
    <definitions id="Definitions_0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
      targetNamespace="http://bpmn.io/schema/bpmn">
      <process id="Process_0" isExecutable="true">
        <startEvent id="start" />
        <manualTask id="task-a" />
        <sequenceFlow id="to-task-a" sourceRef="start" targetRef="task-a" />
        <task id="task-b" />
        <endEvent id="end-b" />
        <sequenceFlow id="to-end-b" sourceRef="task-b" targetRef="end-b" />
        <endEvent id="end-a" />
        <sequenceFlow id="to-end-a" sourceRef="task-a" targetRef="end-a" />
        <boundaryEvent id="bound-err" attachedToRef="task-a">
          <errorEventDefinition id="error-def-1" errorRef="Error_1" />
        </boundaryEvent>
        <sequenceFlow id="to-task-b" sourceRef="bound-err" targetRef="task-b" />
      </process>
      <error id="Error_1" name="Error" />
    </definitions>`;

    let context, definition;
    Given('process with task with bound named error', async () => {
      context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let execution, end;
    When('run without listener', () => {
      end = definition.waitFor('end');
      execution = definition.run();
      execution.signal({id: 'task-a'});
    });

    Then('run completes', () => {
      return end;
    });

    And('task was taken', () => {
      const task = execution.getActivityById('task-a');
      expect(task.counters).to.contain({
        taken: 1,
        discarded: 0,
      });
    });

    And('boundary event was discarded', () => {
      const errorEvent = execution.getActivityById('bound-err');
      expect(errorEvent.counters).to.contain({
        taken: 0,
        discarded: 1,
      });
    });

    And('listener for task that will throw error', () => {
      definition.on('activity.wait', (elementApi) => {
        if (elementApi.id !== 'task-a') return;
        elementApi.owner.emitFatal({id: 'Error_1'}, {id: elementApi.id});
      });
    });

    When('executed', async () => {
      end = definition.waitFor('end');
      execution = definition.run();
    });

    Then('execution completed', () => {
      return end;
    });

    And('task was discarded', () => {
      const task = execution.getActivityById('task-a');
      expect(task.counters).to.contain({
        taken: 1,
        discarded: 1,
      });
    });

    And('thrown error was caught', () => {
      const errorEvent = execution.getActivityById('bound-err');
      expect(errorEvent.counters).to.contain({
        taken: 1,
        discarded: 1,
      });
    });
  });

  Scenario('strict mode', () => {
    let context, definition, serviceCallback, source;
    Given('a service task with a catch anonymous error boundary event', async () => {
      source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="Process_0" isExecutable="true">
          <serviceTask id="service" implementation="\${environment.services.get}" />
          <boundaryEvent id="catchError" attachedToRef="service">
            <errorEventDefinition errorRef="Error_0" />
          </boundaryEvent>
        </process>
        <error id="Error_0" errorCode="404" />
      </definitions>`;

      context = await testHelpers.context(source);
      context.environment.addService('get', function get(_, next) {
        serviceCallback = next;
      });
      definition = new Definition(context, {
        settings: {
          strict: true,
        }
      });
    });

    let errored, end;
    When('definition is ran in strict mode', () => {
      errored = definition.waitFor('error');
      definition.run();
    });

    And('service encounters custom error with error code that match known error', () => {
      const error = new Error('Not found');
      error.code = 404;
      serviceCallback(error);
    });

    Then('run is errored', async () => {
      const err = await errored;
      expect(err.content.error)
        .to.have.property('source')
        .with.property('content')
        .with.property('id', 'service');
    });

    And('error was not caught', () => {
      const catchError = definition.getActivityById('catchError');
      expect(catchError.counters).to.have.property('taken', 0);
      expect(catchError.counters).to.have.property('discarded', 1);
    });

    When('definition is ran again in non-strict mode', () => {
      end = definition.waitFor('end');
      definition.environment.settings.strict = false;
      definition.run();
    });

    And('service encounters custom error with error code that match known error', () => {
      const error = new Error('Not found');
      error.code = 404;
      serviceCallback(error);
    });

    Then('run completes', () => {
      return end;
    });

    And('error was caught', () => {
      const catchError = definition.getActivityById('catchError');
      expect(catchError.counters).to.have.property('taken', 1);
      expect(catchError.counters).to.have.property('discarded', 1);
    });
  });
});

async function prepareSource() {
  const context = await testHelpers.context(bpmnErrorSource, {
    extensions: {
      camunda: CamundaExtension
    }
  });
  return Definition(context, {
    services: {
      isAbove(treshold, value) {
        return parseInt(treshold) < parseInt(value);
      },
    }
  });
}
