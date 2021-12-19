import Definition from '../../src/definition/Definition';
import factory from '../helpers/factory';

import testHelpers from '../helpers/testHelpers';

Feature('Outbound flows', () => {
  Scenario('A process containing a task with conditional flows', () => {
    let definition;
    Given('a task with one default flow, flow with script condition, and a third with expression', async () => {
      const source = factory.resource('conditional-flows.bpmn');
      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran with truthy script condition', () => {
      definition.environment.variables.take2 = true;
      definition.run();
    });

    Then('script flow is taken', () => {
      expect(definition.getActivityById('task2').counters).to.deep.equal({
        taken: 1,
        discarded: 0,
      });
    });

    And('the other two discarded', () => {
      expect(definition.getActivityById('task3').counters).to.deep.equal({
        taken: 0,
        discarded: 1,
      });
      expect(definition.getActivityById('task4').counters).to.deep.equal({
        taken: 0,
        discarded: 1,
      });
    });

    When('definition is ran with truthy expression', () => {
      definition.environment.variables.take2 = false;
      definition.environment.variables.take4 = true;
      definition.run();
    });

    Then('expression flow is taken', () => {
      expect(definition.getActivityById('task4').counters).to.deep.equal({
        taken: 1,
        discarded: 1,
      });
    });

    And('the other two discarded', () => {
      expect(definition.getActivityById('task2').counters).to.deep.equal({
        taken: 1,
        discarded: 1,
      });
      expect(definition.getActivityById('task3').counters).to.deep.equal({
        taken: 0,
        discarded: 2,
      });
    });

    When('definition is ran with falsy script and expression', () => {
      definition.environment.variables.take2 = false;
      definition.environment.variables.take4 = false;
      definition.run();
    });

    Then('default flow is taken', () => {
      expect(definition.getActivityById('task3').counters).to.deep.equal({
        taken: 1,
        discarded: 2,
      });
    });

    And('the other two discarded', () => {
      expect(definition.getActivityById('task2').counters).to.deep.equal({
        taken: 1,
        discarded: 2,
      });
      expect(definition.getActivityById('task4').counters).to.deep.equal({
        taken: 1,
        discarded: 2,
      });
    });
  });

  Scenario('conditional outbound script flow fails', () => {
    let definition;
    Given('an exclusive gateway with one default flow and flow with faulty script condition', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="command-definition"
        xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn"
        camunda="">
        <process id="my-process" isExecutable="true">
          <exclusiveGateway id="decision" name="Is user admin?" default="to-superuser" />
          <sequenceFlow id="to-superuser" sourceRef="decision" targetRef="superuser" />
          <sequenceFlow id="to-admin" sourceRef="decision" targetRef="admin">
            <conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(null, environment.form.item.type === 'computer');</conditionExpression>
          </sequenceFlow>
          <endEvent id="admin" name="User is admin" />
          <endEvent id="superuser" name="Super user" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let thrown;
    When('definition is ran', () => {
      thrown = definition.waitFor('error');
      definition.run();
    });

    Then('an error was thrown', async () => {
      const error = await thrown;
      expect(error.content.error instanceof Error).to.be.ok;
    });

    Given('an inclusive gateway with one default flow and flow with faulty script condition', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="command-definition"
        xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn"
        camunda="">
        <process id="my-process" isExecutable="true">
          <inclusiveGateway id="decision" name="Is user admin?" default="to-superuser" />
          <sequenceFlow id="to-superuser" sourceRef="decision" targetRef="superuser" />
          <sequenceFlow id="to-admin" sourceRef="decision" targetRef="admin">
            <conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(null, environment.form.item.type === 'computer');</conditionExpression>
          </sequenceFlow>
          <endEvent id="admin" name="User is admin" />
          <endEvent id="superuser" name="Super user" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran', () => {
      thrown = definition.waitFor('error');
      definition.run();
    });

    Then('an error was thrown', async () => {
      const error = await thrown;
      expect(error.content.error instanceof Error).to.be.ok;
    });

    Given('a event based gateway with one default flow and flow with faulty script condition', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="command-definition"
        xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn"
        camunda="">
        <process id="my-process" isExecutable="true">
          <eventBasedGateway id="decision" name="Is user admin?" default="to-superuser" />
          <sequenceFlow id="to-superuser" sourceRef="decision" targetRef="superuser" />
          <sequenceFlow id="to-admin" sourceRef="decision" targetRef="admin">
            <conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(null, environment.form.item.type === 'computer');</conditionExpression>
          </sequenceFlow>
          <endEvent id="admin" name="User is admin" />
          <endEvent id="superuser" name="Super user" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran', () => {
      thrown = definition.waitFor('error');
      definition.run();
    });

    Then('an error was thrown', async () => {
      const error = await thrown;
      expect(error.content.error instanceof Error).to.be.ok;
    });

    Given('a task with one default flow and flow with faulty script condition', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="command-definition"
        xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn"
        camunda="">
        <process id="my-process" isExecutable="true">
          <task id="decision" name="Is user admin?" default="to-superuser" />
          <sequenceFlow id="to-superuser" sourceRef="decision" targetRef="superuser" />
          <sequenceFlow id="to-admin" sourceRef="decision" targetRef="admin">
            <conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(null, environment.form.item.type === 'computer');</conditionExpression>
          </sequenceFlow>
          <endEvent id="admin" name="User is admin" />
          <endEvent id="superuser" name="Super user" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran', () => {
      thrown = definition.waitFor('error');
      definition.run();
    });

    Then('an error was thrown', async () => {
      const error = await thrown;
      expect(error.content.error instanceof Error).to.be.ok;
    });

    Given('a task with one default flow and flow with faulty script condition', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="command-definition"
        xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn"
        camunda="">
        <process id="my-process" isExecutable="true">
          <task id="decision" name="Is user admin?" default="to-superuser" />
          <sequenceFlow id="to-superuser" sourceRef="decision" targetRef="superuser" />
          <sequenceFlow id="to-admin" sourceRef="decision" targetRef="admin">
            <conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(null, environment.form.item.type === 'computer');</conditionExpression>
          </sequenceFlow>
          <endEvent id="admin" name="User is admin" />
          <endEvent id="superuser" name="Super user" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran', () => {
      thrown = definition.waitFor('error');
      definition.run();
    });

    Then('an error was thrown', async () => {
      const error = await thrown;
      expect(error.content.error instanceof Error).to.be.ok;
    });
  });

  Scenario('conditional outbound script calls next with error', () => {
    let definition;
    Given('an exclusive gateway with one default flow and flow that return error in next', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="command-definition"
        xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn"
        camunda="">
        <process id="my-process" isExecutable="true">
          <exclusiveGateway id="decision" name="Is user admin?" default="to-superuser" />
          <sequenceFlow id="to-superuser" sourceRef="decision" targetRef="superuser" />
          <sequenceFlow id="to-admin" sourceRef="decision" targetRef="admin">
            <conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(new Error('Condition error'));</conditionExpression>
          </sequenceFlow>
          <endEvent id="admin" name="User is admin" />
          <endEvent id="superuser" name="Super user" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let thrown;
    When('definition is ran', () => {
      thrown = definition.waitFor('error');
      definition.run();
    });

    Then('an error was thrown', async () => {
      const error = await thrown;
      expect(error.content.error instanceof Error).to.be.ok;
    });

    Given('an inclusive gateway with one default flow and flow that return error in next', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="command-definition"
        xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn"
        camunda="">
        <process id="my-process" isExecutable="true">
          <inclusiveGateway id="decision" name="Is user admin?" default="to-superuser" />
          <sequenceFlow id="to-superuser" sourceRef="decision" targetRef="superuser" />
          <sequenceFlow id="to-admin" sourceRef="decision" targetRef="admin">
            <conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(new Error('Condition error'));</conditionExpression>
          </sequenceFlow>
          <endEvent id="admin" name="User is admin" />
          <endEvent id="superuser" name="Super user" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran', () => {
      thrown = definition.waitFor('error');
      definition.run();
    });

    Then('an error was thrown', async () => {
      const error = await thrown;
      expect(error.content.error instanceof Error).to.be.ok;
    });

    Given('a event based gateway with one default flow and flow that return error in next', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="command-definition"
        xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn"
        camunda="">
        <process id="my-process" isExecutable="true">
          <eventBasedGateway id="decision" name="Is user admin?" default="to-superuser" />
          <sequenceFlow id="to-superuser" sourceRef="decision" targetRef="superuser" />
          <sequenceFlow id="to-admin" sourceRef="decision" targetRef="admin">
            <conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(new Error('Condition error'));</conditionExpression>
          </sequenceFlow>
          <endEvent id="admin" name="User is admin" />
          <endEvent id="superuser" name="Super user" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran', () => {
      thrown = definition.waitFor('error');
      definition.run();
    });

    Then('an error was thrown', async () => {
      const error = await thrown;
      expect(error.content.error instanceof Error).to.be.ok;
    });

    Given('a task with one default flow and flow that return error in next', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="command-definition"
        xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn"
        camunda="">
        <process id="my-process" isExecutable="true">
          <task id="decision" name="Is user admin?" default="to-superuser" />
          <sequenceFlow id="to-superuser" sourceRef="decision" targetRef="superuser" />
          <sequenceFlow id="to-admin" sourceRef="decision" targetRef="admin">
            <conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(new Error('Condition error'));</conditionExpression>
          </sequenceFlow>
          <endEvent id="admin" name="User is admin" />
          <endEvent id="superuser" name="Super user" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran', () => {
      thrown = definition.waitFor('error');
      definition.run();
    });

    Then('an error was thrown', async () => {
      const error = await thrown;
      expect(error.content.error instanceof Error).to.be.ok;
    });

    Given('a task with one default flow and flow that return error in next', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="command-definition"
        xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn"
        camunda="">
        <process id="my-process" isExecutable="true">
          <task id="decision" name="Is user admin?" default="to-superuser" />
          <sequenceFlow id="to-superuser" sourceRef="decision" targetRef="superuser" />
          <sequenceFlow id="to-admin" sourceRef="decision" targetRef="admin">
            <conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(new Error('Condition error'));</conditionExpression>
          </sequenceFlow>
          <endEvent id="admin" name="User is admin" />
          <endEvent id="superuser" name="Super user" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran', () => {
      thrown = definition.waitFor('error');
      definition.run();
    });

    Then('an error was thrown', async () => {
      const error = await thrown;
      expect(error.content.error instanceof Error).to.be.ok;
    });
  });

  Scenario('catch faulty sequence flow script condition', () => {
    let definition;
    Given('a subprocess with faulty sequence flow script condition and a catch error', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="command-definition"
        xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="my-process" isExecutable="true">
          <subProcess id="sub">
            <parallelGateway id="split" />
            <sequenceFlow id="to-task" sourceRef="split" targetRef="task" />
            <sequenceFlow id="to-timer" sourceRef="split" targetRef="timer" />
            <endEvent id="timer">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT2S</timeDuration>
              </timerEventDefinition>
            </endEvent>
            <task id="decision" name="Is user admin?" default="to-superuser" />
            <sequenceFlow id="to-admin" sourceRef="decision" targetRef="admin">
              <conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(null, environment.form.item.type === 'computer');</conditionExpression>
            </sequenceFlow>
            <endEvent id="admin" name="User is admin" />
            <endEvent id="superuser" name="Super user" />
          </subProcess>
          <boundaryEvent id="catch" attachedToRef="sub">
            <errorEventDefinition />
          </boundaryEvent>
          <sequenceFlow id="to-faulty" sourceRef="catch" targetRef="faulty" />
          <endEvent id="faulty" />
          <sequenceFlow id="to-success" sourceRef="sub" targetRef="success" />
          <endEvent id="success" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes and boundary catch was taken', async () => {
      await end;
      const caugth = definition.getActivityById('catch');
      expect(caugth.counters).to.deep.equal({taken: 1, discarded: 0});
      const faultyEnd = definition.getActivityById('faulty');
      expect(faultyEnd.counters).to.deep.equal({taken: 1, discarded: 0});
    });

    Given('a subprocess with a sequence flow that return error in next', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="command-definition"
        xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="my-process" isExecutable="true">
          <subProcess id="sub">
            <parallelGateway id="split" />
            <sequenceFlow id="to-task" sourceRef="split" targetRef="task" />
            <sequenceFlow id="to-timer" sourceRef="split" targetRef="timer" />
            <endEvent id="timer">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT2S</timeDuration>
              </timerEventDefinition>
            </endEvent>
            <task id="decision" name="Is user admin?" default="to-superuser" />
            <sequenceFlow id="to-admin" sourceRef="decision" targetRef="admin">
              <conditionExpression xsi:type="bpmn:tFormalExpression" language="javascript">next(new Error('Conditional failure'));</conditionExpression>
            </sequenceFlow>
            <endEvent id="admin" name="User is admin" />
            <endEvent id="superuser" name="Super user" />
          </subProcess>
          <boundaryEvent id="catch" attachedToRef="sub">
            <errorEventDefinition />
          </boundaryEvent>
          <sequenceFlow id="to-faulty" sourceRef="catch" targetRef="faulty" />
          <endEvent id="faulty" />
          <sequenceFlow id="to-success" sourceRef="sub" targetRef="success" />
          <endEvent id="success" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes and boundary catch was taken', async () => {
      await end;
      const caugth = definition.getActivityById('catch');
      expect(caugth.counters).to.deep.equal({taken: 1, discarded: 0});
      const faultyEnd = definition.getActivityById('faulty');
      expect(faultyEnd.counters).to.deep.equal({taken: 1, discarded: 0});
    });
  });
});
