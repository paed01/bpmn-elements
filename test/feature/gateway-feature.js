import camunda from 'camunda-bpmn-moddle/resources/camunda';
import Definition from '../../src/definition/Definition';
import factory from '../helpers/factory';
import got from 'got';
import nock from 'nock';

import testHelpers from '../helpers/testHelpers';

const extensions = {
  camunda: {
    moddleOptions: camunda,
  },
};

Feature('Gateway', () => {
  after(nock.cleanAll);

  Scenario('A process with an inclusive gateway', () => {
    let definition;
    Given('one default flow, second flow with script condition, and a third with expression', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="Definitions_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="mainProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="decisions" />
          <inclusiveGateway id="decisions" default="defaultFlow" />
          <sequenceFlow id="defaultFlow" sourceRef="decisions" targetRef="end1" />
          <sequenceFlow id="condFlow1" sourceRef="decisions" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression" language="javascript">this.environment.variables.condition.var1</conditionExpression>
          </sequenceFlow>
          <sequenceFlow id="condFlow2" sourceRef="decisions" targetRef="end3">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition2}</conditionExpression>
          </sequenceFlow>
          <endEvent id="end1" />
          <endEvent id="end2" />
          <endEvent id="end3" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = Definition(context);
    });

    When('definition is ran with falsy second and first condition script', () => {
      definition.environment.variables.condition = {var1: false};
      definition.run();
    });

    Then('default flow is taken', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
    });

    And('the other two discarded', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('discarded', 1);
      expect(definition.getActivityById('end3').counters).to.have.property('discarded', 1);
    });

    When('definition is ran with truthy second condition script', () => {
      definition.environment.variables.condition = {var1: true};
      definition.run();
    });

    Then('default flow is discarded', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end1').counters).to.have.property('discarded', 1);
    });

    And('the second flow is taken', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end2').counters).to.have.property('discarded', 1);
    });

    And('the third flow is discarded', () => {
      expect(definition.getActivityById('end3').counters).to.have.property('discarded', 2);
    });

    When('definition is ran with truthy second and third condition script', () => {
      definition.environment.variables.condition = {var1: true};
      definition.environment.variables.condition2 = true;
      definition.run();
    });

    Then('default flow is discarded', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end1').counters).to.have.property('discarded', 2);
    });

    And('the second flow is taken', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('taken', 2);
      expect(definition.getActivityById('end2').counters).to.have.property('discarded', 1);
    });

    And('the third flow is taken', () => {
      expect(definition.getActivityById('end3').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end3').counters).to.have.property('discarded', 2);
    });

    let error;
    When('definition is ran second flow type error', () => {
      definition.environment.variables.condition = undefined;
      definition.environment.variables.condition2 = true;
      definition.once('error', (err) => {
        error = err;
      });
      definition.run();
    });

    Then('run is errored', () => {
      expect(error).to.be.ok;
    });
  });

  Scenario('A process with an exclusive gateway', () => {
    let definition;
    Given('one default flow, second flow with script condition, and a third with expression', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="Definitions_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="mainProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="decisions" />
          <exclusiveGateway id="decisions" default="defaultFlow" />
          <sequenceFlow id="defaultFlow" sourceRef="decisions" targetRef="end1" />
          <sequenceFlow id="condFlow1" sourceRef="decisions" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression" language="javascript">this.environment.variables.condition.var1</conditionExpression>
          </sequenceFlow>
          <sequenceFlow id="condFlow2" sourceRef="decisions" targetRef="end3">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition2}</conditionExpression>
          </sequenceFlow>
          <endEvent id="end1" />
          <endEvent id="end2" />
          <endEvent id="end3" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = Definition(context);
    });

    When('definition is ran with falsy second and first condition script', () => {
      definition.environment.variables.condition = {var1: false};
      definition.run();
    });

    Then('default flow is taken', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
    });

    And('the other two discarded', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('discarded', 1);
      expect(definition.getActivityById('end3').counters).to.have.property('discarded', 1);
    });

    When('definition is ran with truthy second condition script', () => {
      definition.environment.variables.condition = {var1: true};
      definition.run();
    });

    Then('default flow is discarded', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end1').counters).to.have.property('discarded', 1);
    });

    And('the second flow is taken', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end2').counters).to.have.property('discarded', 1);
    });

    And('the third flow is discarded', () => {
      expect(definition.getActivityById('end3').counters).to.have.property('discarded', 2);
    });

    When('definition is ran with truthy second and third condition script', () => {
      definition.environment.variables.condition = {var1: true};
      definition.environment.variables.condition2 = true;
      definition.run();
    });

    Then('default flow is discarded', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end1').counters).to.have.property('discarded', 2);
    });

    And('the second flow is taken', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('taken', 2);
      expect(definition.getActivityById('end2').counters).to.have.property('discarded', 1);
    });

    And('the third flow is still discarded', () => {
      expect(definition.getActivityById('end3').counters).to.have.property('taken', 0);
      expect(definition.getActivityById('end3').counters).to.have.property('discarded', 3);
    });

    let error;
    When('definition is ran with second flow type error', () => {
      definition.environment.variables.condition = undefined;
      definition.environment.variables.condition2 = true;
      definition.once('error', (err) => {
        error = err;
      });
      definition.run();
    });

    Then('run is errored', () => {
      expect(error).to.be.ok;
    });
  });

  Scenario('Exclusive gateway that requires asynchronous rule information to take decision', () => {
    let context, definition;
    Given('a rule engine', () => {
      nock('https://rules.local')
        .get('/maxAmount')
        .reply(200, {
          value: 100,
        }, {
          'content-type': 'application/json'
        })
        .persist();
    });

    And('a flow with user amount, rule decision taking default flow or second flow with rule script condition', async () => {
      const source = factory.resource('async-decision.bpmn');
      context = await testHelpers.context(source, {extensions, extendFn});

      function extendFn(mappedBehaviour) {
        if (mappedBehaviour.$type !== 'bpmn:ExclusiveGateway') return;
        if (!mappedBehaviour.extensionElements) return;

        const properties = mappedBehaviour.extensionElements.values.find((e) => e.$type === 'camunda:Properties');
        if (!properties) return;

        const rulesNames = properties.values.find((p) => p.name === 'rules');
        return {rules: rulesNames.value.split(',').filter(Boolean)};
      }
    });

    And('a definition with rules extensions', () => {
      definition = Definition(context, {
        extensions: {
          rulesExtension,
          userInput,
        }
      });

      function rulesExtension(activity) {
        if (!activity.behaviour.rules) return;

        const {broker} = activity;

        broker.subscribeTmp('event', 'activity.enter', async () => {
          const endRoutingKey = 'run.rules.end';
          broker.publish('format', 'run.rules.start', { endRoutingKey });

          const rules = await Promise.all(activity.behaviour.rules.map(getRule));

          broker.publish('format', endRoutingKey, { rules: rules.reduce((result, rule) => {
            result[rule.rule] = rule.value;
            return result;
          }, {}) });
        }, {noAck: true});
      }

      async function getRule(rule) {
        const body = await got(rule, {
          prefixUrl: 'https://rules.local',
        }).json();

        return {rule, value: body.value};
      }

      function userInput(activity) {
        if (activity.type !== 'bpmn:UserTask') return;

        const {broker, environment} = activity;

        broker.subscribeTmp('event', 'activity.end', async (_, {content}) => {
          environment.output.amount = content.output.amount;
        }, {noAck: true});
      }
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('user is enters amount above rule value', () => {
      definition.signal({id: 'require-amount', amount: 140});
    });

    Then('execution completes', () => {
      return end;
    });

    And('default flow was taken', () => {
      const denied = definition.getActivityById('denied');
      expect(denied.counters).to.have.property('taken', 1);
      expect(denied.counters).to.have.property('discarded', 0);
    });

    And('script flow was discarded', () => {
      const accepted = definition.getActivityById('accepted');
      expect(accepted.counters).to.have.property('taken', 0);
      expect(accepted.counters).to.have.property('discarded', 1);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('user is enters allowed amount', () => {
      definition.signal({id: 'require-amount', amount: 40});
    });

    Then('execution completes', () => {
      return end;
    });

    And('default flow was discarded', () => {
      const denied = definition.getActivityById('denied');
      expect(denied.counters).to.have.property('taken', 1);
      expect(denied.counters).to.have.property('discarded', 1);
    });

    And('script flow was taken', () => {
      const accepted = definition.getActivityById('accepted');
      expect(accepted.counters).to.have.property('taken', 1);
      expect(accepted.counters).to.have.property('discarded', 1);
    });
  });

  Scenario('A process with an parallel join gateway with flows touched more than once before complete', () => {
    let definition;
    Given('a decision followed by a parallel gateway that has joined flows touched more than once', async () => {
      // const source = `
      // <?xml version="1.0" encoding="UTF-8"?>
      // <definitions id="Definitions_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      //   <process id="mainProcess" isExecutable="true">
      //     <startEvent id="start" />
      //     <sequenceFlow id="flow1" sourceRef="start" targetRef="decisions" />
      //     <exclusiveGateway id="decisions" default="defaultFlow" />
      //     <sequenceFlow id="defaultFlow" sourceRef="decisions" targetRef="multitask" />
      //     <sequenceFlow id="condFlow1" sourceRef="decisions" targetRef="multitask">
      //       <conditionExpression xsi:type="tFormalExpression" language="javascript">this.environment.variables.condition.var1</conditionExpression>
      //     </sequenceFlow>
      //     <sequenceFlow id="toJoin1" sourceRef="decisions" targetRef="join">
      //       <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition2}</conditionExpression>
      //     </sequenceFlow>
      //     <task id="multitask" />
      //     <sequenceFlow id="toJoin2" sourceRef="multitask" targetRef="join" />
      //     <parallelGateway id="join" />
      //     <sequenceFlow id="toEnd" sourceRef="join" targetRef="end" />
      //     <endEvent id="end" />
      //   </process>
      // </definitions>`;

      const context = await testHelpers.context(factory.resource('parallel-join-edgecase.bpmn'));
      definition = Definition(context);
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });
  });
});
