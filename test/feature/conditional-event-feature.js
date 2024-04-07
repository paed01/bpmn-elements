import { Definition } from '../../src/definition/Definition.js';
import testHelpers from '../helpers/testHelpers.js';

Feature('Conditional event', () => {
  Scenario('A service with conditional bound event', () => {
    let definition, callback;
    Given('a process', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <serviceTask id="service" implementation="\${environment.services.test}" />
          <boundaryEvent id="conditionalEvent" attachedToRef="service" cancelActivity="true">
            <conditionalEventDefinition>
              <condition xsi:type="tFormalExpression">\${environment.services.conditionMet()}</condition>
            </conditionalEventDefinition>
          </boundaryEvent>
          <endEvent id="end" />
          <sequenceFlow id="flow0" sourceRef="start" targetRef="service" />
          <sequenceFlow id="flow1" sourceRef="service" targetRef="end" />
          <sequenceFlow id="flow2" sourceRef="conditionalEvent" targetRef="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      context.environment.addService('test', (...args) => {
        callback = args.pop();
      });

      definition = new Definition(context);
    });

    And('a bad condition function', () => {
      definition.environment.addService('conditionMet', () => {
        throw new Error('Unexpected');
      });
    });

    let errored;
    When('ran', () => {
      errored = definition.waitFor('error');
      definition.run();
    });

    And('service completes', () => {
      callback();
    });

    Then('run is errored', async () => {
      const err = await errored;
      expect(err.content.error).to.have.property('source').with.property('content').with.property('id', 'conditionalEvent');
    });
  });

  Scenario('A service with conditional bound event', () => {
    let definition, callback;
    Given('a process', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <serviceTask id="service" implementation="\${environment.services.test}" />
          <boundaryEvent id="conditionalEvent" attachedToRef="service" cancelActivity="true">
            <conditionalEventDefinition>
              <condition xsi:type="tFormalExpression">\${environment.services.conditionMet()}</condition>
            </conditionalEventDefinition>
          </boundaryEvent>
          <endEvent id="end" />
          <sequenceFlow id="flow0" sourceRef="start" targetRef="service" />
          <sequenceFlow id="flow1" sourceRef="service" targetRef="end" />
          <sequenceFlow id="flow2" sourceRef="conditionalEvent" targetRef="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      context.environment.addService('test', (...args) => {
        callback = args.pop();
      });

      definition = new Definition(context);
    });

    And('a bad condition function', () => {
      definition.environment.addService('conditionMet', () => {
        throw new Error('Unexpected');
      });
    });

    let errored;
    When('ran', () => {
      errored = definition.waitFor('error');
      definition.run();
    });

    And('service completes', () => {
      callback();
    });

    Then('run is errored', async () => {
      const err = await errored;
      expect(err.content.error).to.have.property('source').with.property('content').with.property('id', 'conditionalEvent');
    });
  });

  Scenario('A conditional start event', () => {
    let definition;
    let count = 0;
    Given('a process', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start">
            <conditionalEventDefinition>
              <condition xsi:type="tFormalExpression">\${environment.services.conditionMet()}</condition>
            </conditionalEventDefinition>
          </startEvent>
          <sequenceFlow id="to-end" sourceRef="start" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      context.environment.variables.count = 0;
      definition = new Definition(context);
    });

    And('a bad condition function', () => {
      definition.environment.addService('conditionMet', () => {
        if (count++ % 2) return false;
        throw new Error('Unexpected');
      });
    });

    let errored;
    When('ran', () => {
      errored = definition.waitFor('error');
      definition.run();
    });

    Then('run is errored', async () => {
      const err = await errored;
      expect(err.content.error).to.have.property('source').with.property('content').with.property('id', 'start');
    });

    When('ran again where start waits to be signaled', () => {
      errored = definition.waitFor('error');
      definition.run();
    });

    let event;
    Then('start event is awaiting signal', () => {
      event = definition.getPostponed()[0];
      expect(event).to.have.property('id', 'start');
    });

    When('start event is signaled', () => {
      event.signal();
    });

    Then('run is errored', async () => {
      const err = await errored;
      expect(err.content.error).to.have.property('source').with.property('content').with.property('id', 'start');
    });
  });
});
