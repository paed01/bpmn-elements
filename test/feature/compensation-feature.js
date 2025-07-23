import Definition from '../../src/definition/Definition.js';
import testHelpers from '../helpers/testHelpers.js';

Feature('Compensation', () => {
  Scenario('A service task with a bound compensate event', () => {
    let definition;
    const execService = [];
    const undoService = [];
    Given('a service is compensated by associated bound compensation event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-service" sourceRef="start" targetRef="service" />
          <serviceTask id="service" implementation="\${environment.services.exec}" />
          <boundaryEvent id="compensation" attachedToRef="service">
            <compensateEventDefinition />
          </boundaryEvent>
          <serviceTask id="undoService" isForCompensation="true" implementation="\${environment.services.compensate}" />
          <sequenceFlow id="to-decision" sourceRef="service" targetRef="decision" />
          <exclusiveGateway id="decision" default="to-end1" />
          <sequenceFlow id="to-end1" sourceRef="decision" targetRef="end1" />
          <sequenceFlow id="to-end2" sourceRef="decision" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression">\${environment.output.condition}</conditionExpression>
          </sequenceFlow>
          <endEvent id="end1" />
          <endEvent id="end2">
            <compensateEventDefinition />
          </endEvent>
          <association id="association_0" associationDirection="One" sourceRef="compensation" targetRef="undoService" />
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);

      definition = new Definition(context, {
        services: {
          exec(...args) {
            execService.push(args);
          },
          compensate(...args) {
            undoService.push(args);
          },
        },
        extensions: {
          saveServiceOutput,
        },
      });

      function saveServiceOutput(activity, execContext) {
        if (activity.type !== 'bpmn:ServiceTask') return;

        const { broker } = activity;
        const { environment } = execContext;

        return {
          activate,
          deactivate() {
            broker.cancel('_test-save-to-environment');
          },
        };

        function activate() {
          broker.subscribeTmp('event', 'activity.end', onActivityEnd, { noAck: true, consumerTag: '_test-save-to-environment' });
        }

        function onActivityEnd(_, message) {
          for (const key in message.content.output[0]) {
            environment.output[key] = message.content.output[0][key];
          }
        }
      }
    });

    let end;
    When('definition is ran with the decision to discard', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('service waits for callback', () => {
      expect(execService).to.have.length(1);
    });

    And('compensation service is not started', () => {
      expect(undoService).to.have.length(0);
    });

    When('service completes', () => {
      const [, callback] = execService.pop();
      callback(null, { condition: true });
    });

    Then('compensation service is waiting for callback', () => {
      expect(undoService).to.have.length(1);
    });

    let completeArgs, undoCallback;
    And('it has the execute complete data from the service task', () => {
      [completeArgs, undoCallback] = undoService.pop();
      expect(completeArgs)
        .to.have.property('content')
        .with.property('message')
        .with.property('fields')
        .with.property('routingKey', 'execute.completed');
      expect(completeArgs.content.message).to.have.property('content');
      expect(completeArgs.content.message.content).to.have.property('id', 'service');
      expect(completeArgs.content.message.content)
        .to.have.property('output')
        .that.eql([{ condition: true }]);
    });

    And('association was taken', () => {
      const [bp] = definition.getProcesses();
      const [association] = bp.context.getAssociations();
      expect(association.counters).to.deep.equal({
        take: 1,
        discard: 0,
      });
    });

    When('compensation service completes', () => {
      undoCallback(null, true);
    });

    Then('definition completes', () => {
      return end;
    });

    let service;
    And('service was taken once', () => {
      service = definition.getActivityById('service');
      expect(service.counters).to.have.property('taken', 1);
    });

    And('compensation service just as many', () => {
      const task = definition.getActivityById('undoService');
      expect(task.counters).to.have.property('taken', service.counters.taken);
    });

    When('definition is ran again with the decision to discard', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('service completes', () => {
      const [, callback] = execService.pop();
      callback(null, { condition: false });
    });

    Then('compensation service is NOT waiting for callback', () => {
      expect(undoService).to.have.length(0);
    });

    And('definition completes', () => {
      return end;
    });

    And('service was taken again', () => {
      service = definition.getActivityById('service');
      expect(service.counters).to.have.property('taken', 2);
    });

    And('compensation service was not touched', () => {
      const task = definition.getActivityById('undoService');
      expect(task.counters).to.have.property('taken', 1);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('service awaits to finish', () => {
      expect(execService).to.have.length(1);
    });

    Given('definition is stopped', () => {
      definition.stop();
    });

    When('resumed', () => {
      definition.resume();
    });

    Then('service awaits callback to be called again', () => {
      expect(execService).to.have.length(2);
    });

    When('service callback is called', () => {
      const [, callback] = execService.pop();
      callback(null, { condition: true });
    });

    Then('compensation service is waiting for callback', () => {
      expect(undoService).to.have.length(1);
    });

    When('compensated', () => {
      undoService.pop().pop()();
    });

    And('definition completes', () => {
      return end;
    });

    And('service was taken again', () => {
      service = definition.getActivityById('service');
      expect(service.counters).to.have.property('taken', 3);
    });

    And('compensation service was also taken', () => {
      const task = definition.getActivityById('undoService');
      expect(task.counters).to.have.property('taken', 2);
    });
  });

  Scenario('A service task with bound compensate- and error event', () => {
    let context, definition;
    const execService = [];
    const undoService = [];
    Given('a service is compensated if errored occur', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="service" />
          <serviceTask id="service" implementation="\${environment.services.exec}" />
          <boundaryEvent id="compensation" attachedToRef="service">
            <compensateEventDefinition />
          </boundaryEvent>
          <boundaryEvent id="onError" attachedToRef="service">
            <errorEventDefinition />
          </boundaryEvent>
          <serviceTask id="undoService" isForCompensation="true" implementation="\${environment.services.compensate}" />
          <sequenceFlow id="flow2" sourceRef="service" targetRef="end1" />
          <sequenceFlow id="flow3" sourceRef="onError" targetRef="end2" />
          <endEvent id="end1" />
          <endEvent id="end2">
            <compensateEventDefinition />
          </endEvent>
          <association id="association_0" associationDirection="One" sourceRef="compensation" targetRef="undoService" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);

      definition = new Definition(context, {
        services: {
          exec(...args) {
            execService.push(args);
          },
          compensate(...args) {
            undoService.push(args);
          },
        },
      });
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('service waits for callback', () => {
      expect(execService).to.have.length(1);
    });

    And('compensation service is not started', () => {
      expect(undoService).to.have.length(0);
    });

    When('service completes with error', () => {
      const [, callback] = execService.pop();
      callback(new Error('volatile'));
    });

    Then('compensation service is waiting for callback', () => {
      expect(undoService).to.have.length(1);
    });

    let completeArgs, undoCallback;
    And('it has the execute complete data from the service task', () => {
      [completeArgs, undoCallback] = undoService.pop();

      expect(completeArgs)
        .to.have.property('content')
        .with.property('message')
        .with.property('fields')
        .with.property('routingKey', 'execute.error');
      expect(completeArgs.content.message).to.have.property('content');
      expect(completeArgs.content.message.content).to.have.property('id', 'service');
      expect(completeArgs.content.message.content).to.have.property('error').with.property('message', 'volatile');
    });

    When('compensation service completes', () => {
      undoCallback(null, true);
    });

    Then('definition completes', () => {
      return end;
    });

    let service;
    And('service was discarded once', () => {
      service = definition.getActivityById('service');
      expect(service.counters).to.have.property('discarded', 1);
    });

    And('compensation service taken once', () => {
      const task = definition.getActivityById('undoService');
      expect(task.counters).to.have.property('taken', 1);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('service completes', () => {
      const [, callback] = execService.pop();
      callback(null, { data: 1 });
    });

    Then('compensation service is NOT waiting for callback', () => {
      expect(undoService).to.have.length(0);
    });

    And('definition completes', () => {
      return end;
    });

    And('service was taken again', () => {
      service = definition.getActivityById('service');
      expect(service.counters).to.have.property('taken', 1);
    });

    And('compensation service is untouched', () => {
      const task = definition.getActivityById('undoService');
      expect(task.counters).to.have.property('taken', 1);
      expect(task.counters).to.have.property('discarded', 0);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('service completes with error', () => {
      const [, callback] = execService.pop();
      callback(new Error('indeterministic'));
    });

    Then('compensation service is waiting for callback again', () => {
      expect(undoService).to.have.length(1);
    });

    When('compensation service completes', () => {
      const [, callback] = undoService.pop();
      callback(null, true);
    });

    And('definition completes', () => {
      return end;
    });

    And('service was discarded again', () => {
      service = definition.getActivityById('service');
      expect(service.counters).to.have.property('discarded', 2);
    });

    And('compensation service is taken once again', () => {
      const task = definition.getActivityById('undoService');
      expect(task.counters).to.have.property('taken', 2);
    });

    When('definition is ran again', () => {
      definition.run();
    });

    And('service completes with error', () => {
      const [, callback] = execService.pop();
      callback(new Error('indeterministic'));
    });

    Then('compensation service is waiting for callback again', () => {
      expect(undoService).to.have.length(1);
    });

    let state;
    Given('definition is stopped and state is saved when compensation service is waiting for callback', () => {
      definition.stop();
      state = definition.getState();
    });

    When('definition is recovered and resumed', () => {
      definition = new Definition(context.clone(), {
        services: {
          exec(...args) {
            execService.push(args);
          },
          compensate(...args) {
            undoService.push(args);
          },
        },
      }).recover(state);
      definition.waitFor('end');
      definition.resume();
    });

    And('compensation service completes', () => {
      const [, callback] = undoService.pop();
      callback(null, true);
    });

    Then('definition completes', () => {
      return end;
    });

    And('service was discarded again', () => {
      service = definition.getActivityById('service');
      expect(service.counters).to.have.property('discarded', 3);
    });

    And('compensation service is taken once again', () => {
      const task = definition.getActivityById('undoService');
      expect(task.counters).to.have.property('taken', 3);
    });

    let errorState;
    When('definition is ran again, collecting state as soon as error occur', () => {
      definition.broker.subscribeOnce('event', 'activity.error', () => {
        errorState = definition.getState();
        definition.stop();
      });
      definition.run();
    });

    And('service completes with error', () => {
      const [, callback] = execService.pop();
      callback(new Error('indeterministic'));
    });

    Then('activity error state was collected', () => {
      expect(errorState).to.be.ok;
    });

    When('definition is recovered and resumed when error occured', () => {
      definition = new Definition(context.clone(), {
        services: {
          exec(...args) {
            execService.push(args);
          },
          compensate(...args) {
            undoService.push(args);
          },
        },
      }).recover(errorState);
      definition.waitFor('end');
      definition.resume();
    });

    And('compensation service completes', () => {
      const [, callback] = undoService.pop();
      callback(null, true);
    });

    Then('definition completes', () => {
      return end;
    });

    And('compensation service is taken once again', () => {
      const task = definition.getActivityById('undoService');
      expect(task.counters).to.have.property('taken', 4);
    });
  });

  Scenario('A multi-instance task with bound compensate- and error event', () => {
    let context, definition;
    const execService = [];
    const undoService = [];
    Given('a tripple multi-instance service is compensated if errored occur', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="service" />
          <serviceTask id="service" implementation="\${environment.services.exec}">
            <multiInstanceLoopCharacteristics>
              <loopCardinality>3</loopCardinality>
            </multiInstanceLoopCharacteristics>
          </serviceTask>
          <boundaryEvent id="compensation" attachedToRef="service">
            <compensateEventDefinition />
          </boundaryEvent>
          <boundaryEvent id="onError" attachedToRef="service">
            <errorEventDefinition />
          </boundaryEvent>
          <serviceTask id="undoService" isForCompensation="true" implementation="\${environment.services.compensate}" />
          <sequenceFlow id="flow2" sourceRef="service" targetRef="end1" />
          <sequenceFlow id="flow3" sourceRef="onError" targetRef="end2" />
          <endEvent id="end1" />
          <endEvent id="end2">
            <compensateEventDefinition />
          </endEvent>
          <association id="association_0" associationDirection="One" sourceRef="compensation" targetRef="undoService" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);

      definition = new Definition(context, {
        services: {
          exec(...args) {
            execService.push(args);
          },
          compensate(...args) {
            undoService.push(args);
          },
        },
      });
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('three service calls waits for callback', () => {
      expect(execService).to.have.length(3);
    });

    When('first two calls completes', () => {
      execService.shift()[1](null);
      execService.shift()[1](null);
    });

    But('but the last completes with error', () => {
      execService.shift()[1](new Error('volatile'));
    });

    let completeArgs, undoCallback;
    Then('compensation service is waiting for callback for first iteration', () => {
      expect(undoService).to.have.length(1);

      [completeArgs, undoCallback] = undoService.pop();
      expect(completeArgs)
        .to.have.property('content')
        .with.property('message')
        .with.property('fields')
        .with.property('routingKey', 'execute.completed');
      expect(completeArgs.content.message).to.have.property('content');
      expect(completeArgs.content.message.content).to.have.property('id', 'service');
      expect(completeArgs.content.message.content).to.have.property('isMultiInstance', true);
      expect(completeArgs.content.message.content).to.have.property('index', 0);
      expect(completeArgs.content.message.content.isRootScope).to.not.be.ok;
    });

    When('compensation for first iteration completes', () => {
      undoCallback(null, true);
    });

    Then('compensation service is waiting for callback for second iteration', () => {
      expect(undoService).to.have.length(1);

      [completeArgs, undoCallback] = undoService.pop();
      expect(completeArgs)
        .to.have.property('content')
        .with.property('message')
        .with.property('fields')
        .with.property('routingKey', 'execute.completed');
      expect(completeArgs.content.message).to.have.property('content');
      expect(completeArgs.content.message.content).to.have.property('id', 'service');
      expect(completeArgs.content.message.content).to.have.property('isMultiInstance', true);
      expect(completeArgs.content.message.content).to.have.property('index', 1);
      expect(completeArgs.content.message.content.isRootScope).to.not.be.ok;
    });

    When('compensation for second iteration completes', () => {
      undoCallback(null, true);
    });

    Then('compensation service is waiting for callback for third erroneous iteration', () => {
      expect(undoService).to.have.length(1);

      [completeArgs, undoCallback] = undoService.pop();
      expect(completeArgs)
        .to.have.property('content')
        .with.property('message')
        .with.property('fields')
        .with.property('routingKey', 'execute.error');
      expect(completeArgs.content.message).to.have.property('content');
      expect(completeArgs.content.message.content).to.have.property('id', 'service');
      expect(completeArgs.content.message.content).to.have.property('isMultiInstance', true);
      expect(completeArgs.content.message.content).to.have.property('index', 2);
      expect(completeArgs.content.message.content.isRootScope).to.not.be.ok;
      expect(completeArgs.content.message.content).to.have.property('error');
    });

    When('compensation for third iteration completes', () => {
      undoCallback(null, true);
    });

    Then('definition completes', () => {
      return end;
    });

    let service;
    And('service was discarded once', () => {
      service = definition.getActivityById('service');
      expect(service.counters).to.have.property('discarded', 1);
    });

    And('compensation service taken thrice', () => {
      const task = definition.getActivityById('undoService');
      expect(task.counters).to.have.property('taken', 3);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    When('all calls completes ok', () => {
      execService.shift()[1](null);
      execService.shift()[1](null);
      execService.shift()[1](null);
    });

    Then('compensation service is NOT waiting for callback', () => {
      expect(undoService).to.have.length(0);
    });

    And('definition completes', () => {
      return end;
    });

    And('service was taken again', () => {
      service = definition.getActivityById('service');
      expect(service.counters).to.have.property('taken', 1);
    });

    And('compensation service is untouched', () => {
      const task = definition.getActivityById('undoService');
      expect(task.counters).to.have.property('taken', 3);
      expect(task.counters).to.have.property('discarded', 0);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('service completes with error', () => {
      const [, callback] = execService.pop();
      callback(new Error('indeterministic'));
    });

    Then('compensation service is waiting for callback again', () => {
      expect(undoService).to.have.length(1);
    });

    When('compensation service completes', () => {
      const [, callback] = undoService.pop();
      callback(null, true);
    });

    And('definition completes', () => {
      return end;
    });

    And('service was discarded again', () => {
      service = definition.getActivityById('service');
      expect(service.counters).to.have.property('discarded', 2);
    });

    And('compensation service is taken once again', () => {
      const task = definition.getActivityById('undoService');
      expect(task.counters).to.have.property('taken', 4);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('service completes once', () => {
      const [, callback] = execService.shift();
      callback(null);
    });

    And('service completes with error', () => {
      const [, callback] = execService.pop();
      callback(new Error('indeterministic'));
    });

    Then('compensation service is waiting for callback again', () => {
      expect(undoService).to.have.length(1);
    });

    let state;
    Given('execution is stopped and state is saved', () => {
      definition.stop();
      state = definition.getState();
    });

    let recovered;
    const resumedUndoService = [];
    When('recovered and resumed', () => {
      recovered = new Definition(context.clone(), {
        services: {
          compensate(...args) {
            resumedUndoService.push(args);
          },
        },
      }).recover(JSON.parse(JSON.stringify(state)));
      end = recovered.waitFor('end');

      recovered.resume();
    });

    Then('compensation service awaits callback', () => {
      expect(resumedUndoService).to.have.length(1);
    });

    When('compensation service compensates for completed iteration', () => {
      expect(resumedUndoService[0][0].content.inbound[0].message.content).to.have.property('index', 0);

      const [, callback] = resumedUndoService.shift();
      callback(null, true);
    });

    And('compensation service compensates for errored iteration', () => {
      expect(resumedUndoService[0][0].content.inbound[0].message.content).to.have.property('index', 2);

      const [, callback] = resumedUndoService.shift();
      callback(null, true);
    });

    Then('definition completes', () => {
      return end;
    });

    And('service was discarded again', () => {
      service = recovered.getActivityById('service');
      expect(service.counters).to.have.property('discarded', 3);
    });

    And('compensation service is taken again', () => {
      const task = recovered.getActivityById('undoService');
      expect(task.counters).to.have.property('taken', 6);
    });
  });

  Scenario('A service task with double bound compensate- and one bound error event', () => {
    let context, definition;
    const execService = [];
    const undoService = [];
    Given('a service is compensated if errored occur', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="service" />
          <serviceTask id="service" implementation="\${environment.services.exec}" />
          <boundaryEvent id="compensation1" attachedToRef="service">
            <compensateEventDefinition />
          </boundaryEvent>
          <boundaryEvent id="compensation2" attachedToRef="service">
            <compensateEventDefinition />
          </boundaryEvent>
          <boundaryEvent id="onError" attachedToRef="service">
            <errorEventDefinition />
          </boundaryEvent>
          <serviceTask id="undoService1" isForCompensation="true" implementation="\${environment.services.compensate}" />
          <serviceTask id="undoService2" isForCompensation="true" implementation="\${environment.services.compensate}" />
          <sequenceFlow id="flow2" sourceRef="service" targetRef="end1" />
          <sequenceFlow id="flow3" sourceRef="onError" targetRef="end2" />
          <endEvent id="end1" />
          <endEvent id="end2">
            <compensateEventDefinition />
          </endEvent>
          <association id="association_1" associationDirection="One" sourceRef="compensation1" targetRef="undoService1" />
          <association id="association_2" associationDirection="One" sourceRef="compensation2" targetRef="undoService2" />
        </process>
      </definitions>`;
      context = await testHelpers.context(source);

      definition = new Definition(context, {
        services: {
          exec(...args) {
            execService.push(args);
          },
          compensate(...args) {
            undoService.push(args);
          },
        },
      });
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');

      definition.run();
    });

    Then('service waits for callback', () => {
      expect(execService).to.have.length(1);
    });

    When('service completes with error', () => {
      const [, callback] = execService.pop();
      callback(new Error('volatile'));
    });

    When('first compensation service completes', () => {
      undoService.pop().pop()(null, true);
    });

    And('first compensation service completes', () => {
      undoService.pop().pop()(null, true);
    });

    Then('definition completes', () => {
      return end;
    });

    And('both compensation listeners where taken', () => {
      expect(definition.getActivityById('compensation1').counters, 'first').to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('compensation2').counters, 'second').to.deep.equal({ taken: 1, discarded: 0 });
    });

    And('failing service task was discarded', () => {
      expect(definition.getActivityById('service').counters).to.deep.equal({ taken: 0, discarded: 1 });
    });

    And('error listener was taken', () => {
      expect(definition.getActivityById('onError').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    And('compensation services were taken', () => {
      expect(definition.getActivityById('undoService1').counters, 'first').to.deep.equal({ taken: 1, discarded: 0 });
      expect(definition.getActivityById('undoService2').counters, 'second').to.deep.equal({ taken: 1, discarded: 0 });
    });

    When('definition is ran again', () => {
      definition.run();
    });

    Then('service is waiting for callback', () => {
      expect(execService).to.have.length(1);
    });

    let stopped, state;
    Given('a listener that stops on caught compensation', () => {
      stopped = definition.waitFor('stop');
      definition.broker.subscribeTmp(
        'event',
        'activity.catch',
        (_, message) => {
          if (message.content.id === 'compensation2') {
            definition.stop();
            state = definition.getState();
            definition.broker.cancel(message.fields.consumerTag);
          }
        },
        { noAck: true }
      );
    });

    When('service completes with error', () => {
      const [, callback] = execService.pop();
      callback(new Error('volatile'));
    });

    Then('definition is stopped', () => {
      return stopped;
    });

    When('definition is recovered and resumed', () => {
      definition = new Definition(context.clone(), {
        services: {
          exec(...args) {
            execService.push(args);
          },
          compensate(...args) {
            undoService.push(args);
          },
        },
      }).recover(state);
      end = definition.waitFor('end');
      definition.resume();
    });

    Then('compensation services are waiting for callback again', () => {
      expect(undoService).to.have.length(4);
    });

    When('first compensation service completes', () => {
      undoService.pop().pop()(null, true);
    });

    And('first compensation service completes', () => {
      undoService.pop().pop()(null, true);
    });

    Then('definition completes', () => {
      return end;
    });

    And('both compensation listeners where taken', () => {
      expect(definition.getActivityById('compensation1').counters, 'first').to.deep.equal({ taken: 2, discarded: 0 });
      expect(definition.getActivityById('compensation2').counters, 'second').to.deep.equal({ taken: 2, discarded: 0 });
    });

    And('failing service task was discarded', () => {
      expect(definition.getActivityById('service').counters).to.deep.equal({ taken: 0, discarded: 2 });
    });

    And('error listener was taken', () => {
      expect(definition.getActivityById('onError').counters).to.deep.equal({ taken: 2, discarded: 0 });
    });

    And('compensation services were taken', () => {
      expect(definition.getActivityById('undoService1').counters, 'first').to.deep.equal({ taken: 2, discarded: 0 });
      expect(definition.getActivityById('undoService2').counters, 'second').to.deep.equal({ taken: 2, discarded: 0 });
    });
  });
});
