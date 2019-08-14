import Definition from '../../src/definition/Definition';
import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';
import JsExtension from '../resources/extensions/JsExtension';

Feature('Linking', () => {
  Scenario('Link intermediate throw event & link intermediate catch event', () => {
    let definition;
    const logBook = [];
    Given('a process with two flows with logging, the first flow ends with link, the second catches the link and then logs', async () => {
      const source = factory.resource('link-event.bpmn');
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

  Scenario('Link in discard flow', () => {
    let definition;
    const logBook = [];
    Given('a decision desides if an intermediate catch event is discarded', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="decision" />
          <exclusiveGateway id="decision" default="flow2" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="end1" />
          <endEvent id="end1" />
          <sequenceFlow id="flow3" sourceRef="decision" targetRef="task1">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition}</conditionExpression>
          </sequenceFlow>
          <scriptTask id="task1" scriptFormat="javascript">
            <script>environment.services.log("task1"); next()</script>
          </scriptTask>
          <sequenceFlow id="flow4" sourceRef="task1" targetRef="throw" />
          <intermediateThrowEvent id="throw">
            <linkEventDefinition name="LINKA" />
          </intermediateThrowEvent>
          <intermediateCatchEvent id="catch">
            <linkEventDefinition name="LINKA" />
          </intermediateCatchEvent>
          <sequenceFlow id="flow5" sourceRef="catch" targetRef="task2" />
          <scriptTask id="task2" scriptFormat="javascript">
            <script>environment.services.log("task2"); next()</script>
          </scriptTask>
          <sequenceFlow id="flow6" sourceRef="task2" targetRef="end2" />
          <endEvent id="end2" />
        </process>
      </definitions>
      `;
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
    When('definition is ran with the decision to discard', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('definition completes immediately', () => {
      return end;
    });

    And('throw event was discarded', () => {
      expect(definition.getActivityById('throw').counters).to.have.property('discarded', 1);
      expect(definition.getActivityById('throw').counters).to.have.property('taken', 0);
    });

    And('catch event was discarded', () => {
      expect(definition.getActivityById('catch').counters).to.have.property('discarded', 1);
      expect(definition.getActivityById('catch').counters).to.have.property('taken', 0);
    });

    Given('decision changes to take', () => {
      definition.environment.variables.condition = true;
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('definition completes immediately', () => {
      return end;
    });

    And('throw event was taken', () => {
      expect(definition.getActivityById('throw').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('throw').counters).to.have.property('discarded', 1);
    });

    And('catch event was taken', () => {
      expect(definition.getActivityById('catch').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('catch').counters).to.have.property('discarded', 1);
    });
  });

  Scenario('Stop and resume', () => {
    let context, definition;
    Given('a user takes decision if an intermediate catch event is discarded', async () => {
      const source = `
      <definitions id="Def" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn"
        xmlns:js="http://paed01.github.io/bpmn-engine/schema/2017/08/bpmn">
        <process id="theProcess" isExecutable="true">
          <userTask id="start" js:result="condition" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="decision" />
          <exclusiveGateway id="decision" default="flow2" />
          <sequenceFlow id="flow2" sourceRef="decision" targetRef="end1" />
          <endEvent id="end1" />
          <sequenceFlow id="flow3" sourceRef="decision" targetRef="task1">
            <conditionExpression xsi:type="tFormalExpression">\${environment.output.condition}</conditionExpression>
          </sequenceFlow>
          <task id="task1" />
          <sequenceFlow id="flow4" sourceRef="task1" targetRef="throw" />
          <intermediateThrowEvent id="throw">
            <linkEventDefinition name="LINKA" />
          </intermediateThrowEvent>
          <intermediateCatchEvent id="catch">
            <linkEventDefinition name="LINKA" />
          </intermediateCatchEvent>
          <sequenceFlow id="flow5" sourceRef="catch" targetRef="task2" />
          <task id="task2" />
          <sequenceFlow id="flow6" sourceRef="task2" targetRef="end2" />
          <endEvent id="end2" />
        </process>
      </definitions>
      `;

      context = await testHelpers.context(source, {
        extensions: {js: JsExtension}
      });

      definition = Definition(context, {
        extensions: {
          js: JsExtension.extension
        }
      });
    });

    let wait, end;
    When('definition is ran', () => {
      wait = definition.waitFor('wait');
      end = definition.waitFor('end');
      definition.run();
    });

    let user;
    Then('definition waits for user task', async () => {
      user = await wait;
      expect(user).to.have.property('id', 'start');
    });

    And('throw event is waiting as well', () => {
      expect(definition.getActivityById('catch')).to.have.property('isRunning', true);
    });

    Given('execution is stopped', () => {
      definition.stop();
    });

    When('resumed', () => {
      definition.resume();
    });

    And('user takes decision to discard', () => {
      user.signal(false);
    });

    Then('definition completes', () => {
      return end;
    });

    And('throw event was discarded', () => {
      expect(definition.getActivityById('throw').counters).to.have.property('discarded', 1);
      expect(definition.getActivityById('throw').counters).to.have.property('taken', 0);
    });

    And('catch event was discarded', () => {
      expect(definition.getActivityById('catch').counters).to.have.property('discarded', 1);
      expect(definition.getActivityById('catch').counters).to.have.property('taken', 0);
    });

    When('definition is ran again', () => {
      wait = definition.waitFor('wait');
      end = definition.waitFor('end');
      definition.run();
    });

    Then('definition waits for user task', async () => {
      user = await wait;
      expect(user).to.have.property('id', 'start');
    });

    And('throw event is waiting as well', () => {
      expect(definition.getActivityById('catch')).to.have.property('isRunning', true);
    });

    Given('execution is stopped', () => {
      definition.stop();
    });

    let state;
    And('state is saved', () => {
      state = definition.getState();
    });

    When('definition is recovered and resumed', () => {
      definition = Definition(context, {
        extensions: {
          js: JsExtension.extension
        }
      }).recover(JSON.parse(JSON.stringify(state)));

      wait = definition.waitFor('wait');
      end = definition.waitFor('end');

      definition.resume();
    });


    Then('definition waits for user task', async () => {
      user = await wait;
      expect(user).to.have.property('id', 'start');
    });

    When('user takes decision to discard', () => {
      user.signal(true);
    });

    Then('definition completes', () => {
      return end;
    });

    And('throw event was taken', () => {
      expect(definition.getActivityById('throw').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('throw').counters).to.have.property('discarded', 1);
    });

    And('catch event was taken', () => {
      expect(definition.getActivityById('catch').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('catch').counters).to.have.property('discarded', 1);
    });
  });
});
