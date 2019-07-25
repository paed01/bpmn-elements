import CamundaExtension from '../resources/extensions/CamundaExtension';
import Definition from '../../src/definition/Definition';
import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';
import {BpmnError} from '../../src/error/Errors';

const bpmnErrorSource = factory.resource('bpmn-error.bpmn');

Feature('Bpmn Error', () => {
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
      definition = Definition(context);
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
      definition = Definition(context);
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
      definition = Definition(context);
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
      definition = Definition(context);
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

    let stop;
    When('definition is ran again and stops at throw', () => {
      stop = definition.waitFor('stop');
      definition.once('activity.throw', () => definition.stop());
      definition.run();
    });

    Then('error is thrown by end event', async () => {
      endApi = await thrown;
    });

    And('run is stopped', async () => {
      await stop;
    });

    When('resumed', () => {
      end = definition.waitFor('end');
      definition.resume();
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
    let definition, serviceCallback;
    Given('a service task with a catch error boundary event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="Process_0" isExecutable="true">
          <serviceTask id="service" implementation="\${environment.services.get}" />
          <boundaryEvent id="catchError" attachedToRef="service">
            <errorEventDefinition errorRef="Error_0" />
          </boundaryEvent>
        </process>
        <error id="Error_0" errorCode="404" />
      </definitions>`;

      const context = await testHelpers.context(source);
      context.environment.addService('get', function get(_, next) {
        serviceCallback = next;
      });
      definition = Definition(context);
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

    Then('definition is errored', () => {
      return errored;
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
        name: 'Too big signal',
      });
    });

    And('run is completed', async () => {
      return end;
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
