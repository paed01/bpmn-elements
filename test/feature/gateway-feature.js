import { Definition } from 'bpmn-elements';
import factory from '../helpers/factory.js';
import nock from 'nock';

import testHelpers from '../helpers/testHelpers.js';

const extensions = {
  camunda: {
    moddleOptions: testHelpers.camundaBpmnModdle,
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
            <conditionExpression xsi:type="tFormalExpression" language="javascript">next(null, this.environment.variables.condition.var1)</conditionExpression>
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
      definition = new Definition(context);
    });

    When('definition is ran with falsy second and first condition script', () => {
      definition.environment.variables.condition = { var1: false };
      definition.run();
    });

    Then('default flow is taken', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
    });

    And('the other two are not discarded', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('discarded', 0);
      expect(definition.getActivityById('end3').counters).to.have.property('discarded', 0);
    });

    When('definition is ran with truthy second condition script', () => {
      definition.environment.variables.condition = { var1: true };
      definition.run();
    });

    Then('default flow is not taken again and not discarded', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end1').counters).to.have.property('discarded', 0);
    });

    And('the second flow is taken', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end2').counters).to.have.property('discarded', 0);
    });

    And('the third flow is not discarded', () => {
      expect(definition.getActivityById('end3').counters).to.have.property('discarded', 0);
    });

    When('definition is ran with truthy second and third condition script', () => {
      definition.environment.variables.condition = { var1: true };
      definition.environment.variables.condition2 = true;
      definition.run();
    });

    Then('default flow is not taken and not discarded', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end1').counters).to.have.property('discarded', 0);
    });

    And('the second flow is taken', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('taken', 2);
      expect(definition.getActivityById('end2').counters).to.have.property('discarded', 0);
    });

    And('the third flow is taken', () => {
      expect(definition.getActivityById('end3').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end3').counters).to.have.property('discarded', 0);
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
            <conditionExpression xsi:type="tFormalExpression" language="javascript">next(null, this.environment.variables.condition.var1)</conditionExpression>
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
      definition = new Definition(context);
    });

    When('definition is ran with falsy second and first condition script', () => {
      definition.environment.variables.condition = { var1: false };
      definition.run();
    });

    Then('default flow is taken', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
    });

    And('the other two are not discarded', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('discarded', 0);
      expect(definition.getActivityById('end3').counters).to.have.property('discarded', 0);
    });

    When('definition is ran with truthy second condition script', () => {
      definition.environment.variables.condition = { var1: true };
      definition.run();
    });

    Then('default flow is not taken again and not discarded', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end1').counters).to.have.property('discarded', 0);
    });

    And('the second flow is taken', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end2').counters).to.have.property('discarded', 0);
    });

    And('the third flow is not discarded', () => {
      expect(definition.getActivityById('end3').counters).to.have.property('discarded', 0);
    });

    When('definition is ran with truthy second and third condition script', () => {
      definition.environment.variables.condition = { var1: true };
      definition.environment.variables.condition2 = true;
      definition.run();
    });

    Then('default flow is not taken and not discarded', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end1').counters).to.have.property('discarded', 0);
    });

    And('the second flow is taken', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('taken', 2);
      expect(definition.getActivityById('end2').counters).to.have.property('discarded', 0);
    });

    And('the third flow is still not taken and not discarded', () => {
      expect(definition.getActivityById('end3').counters).to.have.property('taken', 0);
      expect(definition.getActivityById('end3').counters).to.have.property('discarded', 0);
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
        .reply(
          200,
          {
            value: 100,
          },
          {
            'content-type': 'application/json',
          }
        )
        .persist();
    });

    And('a flow with user amount, rule decision taking default flow or second flow with rule script condition', async () => {
      const source = factory.resource('async-decision.bpmn');
      context = await testHelpers.context(source, { extensions, extendFn });

      function extendFn(mappedBehaviour) {
        if (mappedBehaviour.$type !== 'bpmn:ExclusiveGateway') return;
        if (!mappedBehaviour.extensionElements) return;

        const properties = mappedBehaviour.extensionElements.values.find((e) => e.$type === 'camunda:Properties');
        if (!properties) return;

        const rulesNames = properties.values.find((p) => p.name === 'rules');
        return { rules: rulesNames.value.split(',').filter(Boolean) };
      }
    });

    And('a definition with rules extensions', () => {
      definition = new Definition(context, {
        extensions: {
          rulesExtension,
          userInput,
        },
      });

      function rulesExtension(activity) {
        if (!activity.behaviour.rules) return;

        const { broker } = activity;

        broker.subscribeTmp(
          'event',
          'activity.enter',
          async () => {
            const endRoutingKey = 'run.rules.end';
            broker.publish('format', 'run.rules.start', { endRoutingKey });

            const rules = await Promise.all(activity.behaviour.rules.map(getRule));

            broker.publish('format', endRoutingKey, {
              rules: rules.reduce((result, rule) => {
                result[rule.rule] = rule.value;
                return result;
              }, {}),
            });
          },
          { noAck: true }
        );
      }

      async function getRule(rule) {
        const body = await fetch(new URL(rule, 'https://rules.local')).then((res) => res.json());

        // @ts-expect-error type coverage
        return { rule, value: body.value };
      }

      function userInput(activity) {
        if (activity.type !== 'bpmn:UserTask') return;

        const { broker, environment } = activity;

        broker.subscribeTmp(
          'event',
          'activity.end',
          (_, { content }) => {
            environment.output.amount = content.output.amount;
          },
          { noAck: true }
        );
      }
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('user is enters amount above rule value', () => {
      definition.signal({ id: 'require-amount', amount: 140 });
    });

    Then('execution completes', () => {
      return end;
    });

    And('default flow was taken', () => {
      const denied = definition.getActivityById('denied');
      expect(denied.counters).to.have.property('taken', 1);
      expect(denied.counters).to.have.property('discarded', 0);
    });

    And('script flow was not taken', () => {
      const accepted = definition.getActivityById('accepted');
      expect(accepted.counters).to.have.property('taken', 0);
      expect(accepted.counters).to.have.property('discarded', 0);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('user is enters allowed amount', () => {
      definition.signal({ id: 'require-amount', amount: 40 });
    });

    Then('execution completes', () => {
      return end;
    });

    And('default flow was not taken again', () => {
      const denied = definition.getActivityById('denied');
      expect(denied.counters).to.have.property('taken', 1);
      expect(denied.counters).to.have.property('discarded', 0);
    });

    And('script flow was taken', () => {
      const accepted = definition.getActivityById('accepted');
      expect(accepted.counters).to.have.property('taken', 1);
      expect(accepted.counters).to.have.property('discarded', 0);
    });
  });

  Scenario('A process with an parallel join gateway with flows touched more than once before complete', () => {
    let definition;
    Given('a decision followed by a parallel gateway that has joined flows touched more than once', async () => {
      const context = await testHelpers.context(factory.resource('parallel-join-edgecase.bpmn'));
      definition = new Definition(context);
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

  Scenario('A process with an exclusive gateway with asynchronous conditions', () => {
    let definition;
    Given('one default flow, second flow with async script condition, and a third with expression', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="Definitions_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="mainProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="decisions" />
          <exclusiveGateway id="decisions" default="defaultFlow" />
          <sequenceFlow id="defaultFlow" sourceRef="decisions" targetRef="end1" />
          <sequenceFlow id="condFlow1" sourceRef="decisions" targetRef="end2">
            <conditionExpression xsi:type="tFormalExpression" language="javascript">this.environment.services.evaluateRule('my-rule', this.environment.variables, next);</conditionExpression>
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
      definition = new Definition(context);
    });

    When('definition is ran with falsy second and first condition script', () => {
      definition.environment.variables.condition = { var1: false };
      definition.environment.services.evaluateRule = function evaluateRule(_name, variables, callback) {
        return new Promise((resolve) => {
          resolve(variables.condition.var1);
        })
          .then((result) => {
            callback(null, result);
          })
          .catch((err) => {
            callback(err);
          });
      };
      definition.run();
    });

    Then('default flow is taken', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
    });

    And('the other two are not discarded', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('discarded', 0);
      expect(definition.getActivityById('end3').counters).to.have.property('discarded', 0);
    });

    When('definition is ran with truthy second condition script', () => {
      definition.environment.variables.condition = { var1: true };
      definition.run();
    });

    Then('default flow is not taken again and not discarded', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end1').counters).to.have.property('discarded', 0);
    });

    And('the second flow is taken', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end2').counters).to.have.property('discarded', 0);
    });

    And('the third flow is not discarded', () => {
      expect(definition.getActivityById('end3').counters).to.have.property('discarded', 0);
    });

    When('definition is ran with truthy second and third condition script', () => {
      definition.environment.variables.condition = { var1: true };
      definition.environment.variables.condition2 = true;
      definition.run();
    });

    Then('default flow is not taken and not discarded', () => {
      expect(definition.getActivityById('end1').counters).to.have.property('taken', 1);
      expect(definition.getActivityById('end1').counters).to.have.property('discarded', 0);
    });

    And('the second flow is taken', () => {
      expect(definition.getActivityById('end2').counters).to.have.property('taken', 2);
      expect(definition.getActivityById('end2').counters).to.have.property('discarded', 0);
    });

    And('the third flow is still not taken and not discarded', () => {
      expect(definition.getActivityById('end3').counters).to.have.property('taken', 0);
      expect(definition.getActivityById('end3').counters).to.have.property('discarded', 0);
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

  ['inclusiveGateway', 'parallelGateway'].forEach((gatewayType) => {
    Scenario(`A ${gatewayType} with one incoming sequence flow fed by an uncontrolled merge`, () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-fork" sourceRef="start" targetRef="fork" />
          <parallelGateway id="fork" />
          <sequenceFlow id="to-fast" sourceRef="fork" targetRef="fast" />
          <sequenceFlow id="to-slow" sourceRef="fork" targetRef="slow" />
          <task id="fast" />
          <serviceTask id="slow" implementation="\${environment.services.slow}" />
          <sequenceFlow id="from-fast" sourceRef="fast" targetRef="merge" />
          <sequenceFlow id="from-slow" sourceRef="slow" targetRef="merge" />
          <task id="merge" />
          <sequenceFlow id="to-gateway" sourceRef="merge" targetRef="gateway" />
          <${gatewayType} id="gateway" />
          <sequenceFlow id="to-after" sourceRef="gateway" targetRef="after" />
          <task id="after" />
          <sequenceFlow id="to-end" sourceRef="after" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      /** @type {CallableFunction | undefined} */
      let slowCallback;
      let gatewayActed = false;

      /** Complete the slow branch once the gateway has either converged or fired */
      function releaseSlow() {
        if (!gatewayActed || !slowCallback) return;
        const next = slowCallback;
        slowCallback = undefined;
        next();
      }

      let context;
      /** @type {Definition} */
      let definition;
      Given('a fork into a fast and a slow branch merged by a task feeding the gateway through its only incoming flow', async () => {
        context = await testHelpers.context(source);
        definition = new Definition(context, {
          services: {
            /**
             * @param {any} _
             * @param {CallableFunction} next
             */
            slow(_, next) {
              slowCallback = next;
              releaseSlow();
            },
          },
        });
      });

      let leave;
      /** @type {string[]} */
      const sequence = [];
      When('definition is ran with the slow branch held until the gateway has acted', () => {
        definition.broker.subscribeTmp(
          'event',
          '#',
          (routingKey, msg) => {
            if (routingKey.indexOf('.shake') > -1) return sequence.push(routingKey);
            const id = msg.content.id;
            if (id === 'gateway' && (routingKey === 'activity.converge' || routingKey === 'activity.end')) {
              sequence.push(`${id} ${routingKey}`);
              gatewayActed = true;
              releaseSlow();
            } else if (id === 'slow' && routingKey === 'activity.end') {
              sequence.push(`${id} ${routingKey}`);
            }
          },
          { noAck: true }
        );
        leave = definition.waitFor('leave');
        definition.run();
      });

      Then('run completes', () => {
        return leave;
      });

      And('the gateway fired on the first merged token without converging, before the slow branch completed', () => {
        expect(sequence).to.deep.equal(['gateway activity.end', 'slow activity.end', 'gateway activity.end']);
      });

      And('the gateway fired once per merged token', () => {
        expect(definition.getActivityById('merge').counters).to.deep.equal({ taken: 2, discarded: 0 });
        expect(definition.getActivityById('gateway').counters).to.deep.equal({ taken: 2, discarded: 0 });
        expect(definition.getActivityById('after').counters).to.deep.equal({ taken: 2, discarded: 0 });
        expect(definition.getActivityById('end').counters).to.deep.equal({ taken: 2, discarded: 0 });
      });

      And('nothing is postponed', () => {
        expect(definition.getPostponed()).to.have.length(0);
      });
    });
  });
});
