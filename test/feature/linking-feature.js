import { Definition } from 'bpmn-elements';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';
import JsExtension from '../resources/extensions/JsExtension.js';
import { getTakeServices } from '../helpers/services-helper.js';

Feature('Linking', () => {
  Scenario('Link intermediate throw event & link intermediate catch event', () => {
    let definition;
    const logBook = [];
    Given('a process with two flows with logging, the first flow ends with link, the second catches the link and then logs', async () => {
      const source = factory.resource('link-event.bpmn');
      const context = await testHelpers.context(source);

      definition = new Definition(context, {
        services: {
          log(...args) {
            logBook.push(...args);
          },
        },
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

  [false, true].forEach((skipDiscard) => {
    describe(`run with skipDiscard=${skipDiscard}`, () => {
      Scenario('basic link event definition', () => {
        /** @type {Definition} */
        let definition;
        Given('a flow matching scenario', async () => {
          const source = factory.resource('link-basic.bpmn');
          const context = await testHelpers.context(source);

          definition = new Definition(context, {
            settings: {
              skipDiscard,
            },
            services: getTakeServices(),
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

        And('throw event was not reached (default flow taken)', () => {
          expect(definition.getActivityById('throw').counters).to.deep.equal({ taken: 0, discarded: skipDiscard ? 0 : 1 });
        });

        And('catch event stayed dormant', () => {
          expect(definition.getActivityById('catch').counters).to.deep.equal({ taken: 0, discarded: 0 });
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
          expect(definition.getActivityById('throw').counters).to.have.property('discarded', skipDiscard ? 0 : 1);
        });

        And('catch event was taken', () => {
          expect(definition.getActivityById('catch').counters).to.have.property('taken', 1);
          expect(definition.getActivityById('catch').counters).to.have.property('discarded', 0);
        });
      });

      Scenario('Link within discard flow', () => {
        /** @type {Definition} */
        let definition;
        const logBook = [];
        Given('a decision decides if an intermediate catch event is discarded', async () => {
          const source = `
          <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
            <process id="theProcess" isExecutable="true">
              <startEvent id="start" />
              <sequenceFlow id="to-decision" sourceRef="start" targetRef="decision" />
              <exclusiveGateway id="decision" default="to-end1" />
              <sequenceFlow id="to-end1" sourceRef="decision" targetRef="end1" />
              <endEvent id="end1" />
              <sequenceFlow id="to-task1" sourceRef="decision" targetRef="task1">
                <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition}</conditionExpression>
              </sequenceFlow>
              <scriptTask id="task1" scriptFormat="javascript">
                <script>environment.services.log("task1"); next()</script>
              </scriptTask>
              <sequenceFlow id="to-throw" sourceRef="task1" targetRef="throw" />
              <intermediateThrowEvent id="throw">
                <linkEventDefinition name="LINKA" />
              </intermediateThrowEvent>
              <intermediateCatchEvent id="catch">
                <linkEventDefinition name="LINKA" />
              </intermediateCatchEvent>
              <sequenceFlow id="from-catch" sourceRef="catch" targetRef="task2" />
              <scriptTask id="task2" scriptFormat="javascript">
                <script>environment.services.log("task2"); next()</script>
              </scriptTask>
              <sequenceFlow id="to-end2" sourceRef="task2" targetRef="end2" />
              <endEvent id="end2" />
            </process>
          </definitions>
          `;
          const context = await testHelpers.context(source);

          definition = new Definition(context, {
            settings: {
              skipDiscard,
            },
            services: {
              log(...args) {
                logBook.push(...args);
              },
            },
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
          expect(definition.getActivityById('throw').counters).to.have.property('discarded', skipDiscard ? 0 : 1);
          expect(definition.getActivityById('throw').counters).to.have.property('taken', 0);
        });

        And('catch event was discarded', () => {
          expect(definition.getActivityById('catch').counters).to.have.property('discarded', 0);
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
          expect(definition.getActivityById('throw').counters).to.have.property('discarded', skipDiscard ? 0 : 1);
        });

        And('catch event was taken', () => {
          expect(definition.getActivityById('catch').counters).to.have.property('taken', 1);
          expect(definition.getActivityById('catch').counters).to.have.property('discarded', 0);
        });
      });

      Scenario('Link within discard flow reversed order', () => {
        let definition;
        const logBook = [];
        Given('a decision decides if an intermediate catch event is discarded', async () => {
          const source = `
          <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
            <process id="theProcess" isExecutable="true">
              <intermediateCatchEvent id="catch">
                <linkEventDefinition name="LINKA" />
              </intermediateCatchEvent>
              <sequenceFlow id="from-catch" sourceRef="catch" targetRef="task2" />
              <scriptTask id="task2" scriptFormat="javascript">
                <script>environment.services.log("task2"); next()</script>
              </scriptTask>
              <sequenceFlow id="to-end2" sourceRef="task2" targetRef="end2" />
              <endEvent id="end2" />
              <startEvent id="start" />
              <sequenceFlow id="to-decision" sourceRef="start" targetRef="decision" />
              <exclusiveGateway id="decision" default="to-end1" />
              <sequenceFlow id="to-end1" sourceRef="decision" targetRef="end1" />
              <endEvent id="end1" />
              <sequenceFlow id="to-task1" sourceRef="decision" targetRef="task1">
                <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition}</conditionExpression>
              </sequenceFlow>
              <scriptTask id="task1" scriptFormat="javascript">
                <script>environment.services.log("task1"); next()</script>
              </scriptTask>
              <sequenceFlow id="to-throw" sourceRef="task1" targetRef="throw" />
              <intermediateThrowEvent id="throw">
                <linkEventDefinition name="LINKA" />
              </intermediateThrowEvent>
            </process>
          </definitions>
          `;
          const context = await testHelpers.context(source);

          definition = new Definition(context, {
            settings: {
              skipDiscard,
            },
            services: {
              log(...args) {
                logBook.push(...args);
              },
            },
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
          expect(definition.getActivityById('throw').counters).to.have.property('discarded', skipDiscard ? 0 : 1);
          expect(definition.getActivityById('throw').counters).to.have.property('taken', 0);
        });

        And('catch event was discarded', () => {
          expect(definition.getActivityById('catch').counters).to.have.property('discarded', 0);
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
          expect(definition.getActivityById('throw').counters).to.have.property('discarded', skipDiscard ? 0 : 1);
        });

        And('catch event was taken', () => {
          expect(definition.getActivityById('catch').counters).to.have.property('taken', 1);
          expect(definition.getActivityById('catch').counters).to.have.property('discarded', 0);
        });
      });

      Scenario('Stop and resume', () => {
        let context, definition;
        Given('a user is asked to take decision if an intermediate catch event is discarded or not', async () => {
          const source = `
          <definitions id="Def" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn"
            xmlns:js="http://paed01.github.io/bpmn-engine/schema/2017/08/bpmn">
            <process id="theProcess" isExecutable="true">
              <userTask id="start" js:result="condition" />
              <sequenceFlow id="to-decision" sourceRef="start" targetRef="decision" />
              <exclusiveGateway id="decision" default="to-end1" />
              <sequenceFlow id="to-end1" sourceRef="decision" targetRef="end1" />
              <endEvent id="end1" />
              <sequenceFlow id="to-task1" sourceRef="decision" targetRef="task1">
                <conditionExpression xsi:type="tFormalExpression">\${environment.output.condition}</conditionExpression>
              </sequenceFlow>
              <task id="task1" />
              <sequenceFlow id="to-throw" sourceRef="task1" targetRef="throw" />
              <intermediateThrowEvent id="throw">
                <linkEventDefinition name="LINKA" />
              </intermediateThrowEvent>
              <intermediateCatchEvent id="catch">
                <linkEventDefinition name="LINKA" />
              </intermediateCatchEvent>
              <sequenceFlow id="to-task2" sourceRef="catch" targetRef="task2" />
              <task id="task2" />
              <sequenceFlow id="to-end2" sourceRef="task2" targetRef="end2" />
              <endEvent id="end2" />
            </process>
          </definitions>
          `;

          context = await testHelpers.context(source, {
            extensions: { js: JsExtension },
          });

          definition = new Definition(context, {
            settings: {
              skipDiscard,
            },
            extensions: {
              js: JsExtension.extension,
            },
          });
        });

        let wait, end;
        When('definition is ran', () => {
          wait = definition.waitFor('wait');
          end = definition.waitFor('end');
          definition.run();
        });

        let user;
        Then('definition waits for user to decide', async () => {
          user = await wait;
          expect(user).to.have.property('id', 'start');
        });

        And('catch is dormant — not running while waiting for the throw', () => {
          expect(definition.getActivityById('catch')).to.have.property('isRunning', false);
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
          expect(definition.getActivityById('throw').counters).to.have.property('discarded', skipDiscard ? 0 : 1);
          expect(definition.getActivityById('throw').counters).to.have.property('taken', 0);
        });

        And('catch event was discarded', () => {
          expect(definition.getActivityById('catch').counters).to.have.property('discarded', 0);
          expect(definition.getActivityById('catch').counters).to.have.property('taken', 0);
        });

        When('definition is ran again', () => {
          wait = definition.waitFor('wait');
          end = definition.waitFor('end');
          definition.run();
        });

        Then('definition waits for user to decide', async () => {
          user = await wait;
          expect(user).to.have.property('id', 'start');
        });

        And('catch is dormant — not running while waiting for the throw', () => {
          expect(definition.getActivityById('catch')).to.have.property('isRunning', false);
        });

        Given('execution is stopped', () => {
          definition.stop();
        });

        let state;
        And('state is saved', () => {
          state = definition.getState();
        });

        When('definition is recovered and resumed', () => {
          definition = new Definition(context, {
            extensions: {
              js: JsExtension.extension,
            },
          }).recover(JSON.parse(JSON.stringify(state)));

          wait = definition.waitFor('wait');
          end = definition.waitFor('end');

          definition.resume();
        });

        Then('definition waits for user to decide', async () => {
          user = await wait;
          expect(user).to.have.property('id', 'start');
        });

        When('user takes decision to proceed', () => {
          user.signal(true);
        });

        Then('definition completes', () => {
          return end;
        });

        And('throw event was taken', () => {
          expect(definition.getActivityById('throw').counters).to.have.property('taken', 1);
          expect(definition.getActivityById('throw').counters).to.have.property('discarded', skipDiscard ? 0 : 1);
        });

        And('catch event was taken', () => {
          expect(definition.getActivityById('catch').counters).to.have.property('taken', 1);
          expect(definition.getActivityById('catch').counters).to.have.property('discarded', 0);
        });
      });

      Scenario('a flow with link event to bypass parallel join', () => {
        let context, definition;
        Given('a flow with link event definitions and a bypassed parallel gateway', async () => {
          const source = factory.resource('link-to-bypass-parallel-join.bpmn');

          context = await testHelpers.context(source);

          definition = new Definition(context, {
            variables: {
              condition: true,
            },
            settings: {
              skipDiscard,
            },
          });
        });

        let end;
        When('definition is ran with condition to take link', () => {
          end = definition.waitFor('end');
          definition.run();
        });

        Then('run completes', () => {
          return end;
        });

        And('end was taken', () => {
          expect(definition.getActivityById('end').counters).to.have.property('taken', 1);
        });

        When('definition is ran with condition to discard link', () => {
          end = definition.waitFor('end');

          definition.environment.variables.condition = false;

          definition.run();
        });

        Then('run completes', () => {
          return end;
        });

        And('end was taken', () => {
          expect(definition.getActivityById('end').counters).to.have.property('taken', 2);
        });
      });

      Scenario('a flow with link event to complete parallel join', () => {
        let context, definition;
        Given('a flow matching scenario', async () => {
          const source = factory.resource('link-to-parallel-join.bpmn');

          context = await testHelpers.context(source);

          definition = new Definition(context, {
            variables: {
              condition: true,
            },
            settings: {
              skipDiscard,
            },
          });
        });

        let end;
        When('definition is ran with condition to take link', () => {
          end = definition.waitFor('end');
          definition.run();
        });

        Then('run completes', () => {
          return end;
        });

        And('end was taken', () => {
          expect(definition.getActivityById('end').counters).to.have.property('taken', 1);
        });

        When('definition is ran with condition to discard link', () => {
          end = definition.waitFor('end');

          definition.environment.variables.condition = false;

          definition.run();
        });

        Then('run completes', () => {
          return end;
        });

        And('end was taken', () => {
          expect(definition.getActivityById('end').counters).to.have.property('taken', 2);
        });
      });

      Scenario('a parallel join waits for a peer reached through a link', () => {
        let definition;
        Given('a fork where one branch reaches the join directly and the other via a waiting task and a link', async () => {
          const source = `
          <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
            <process id="theProcess" isExecutable="true">
              <startEvent id="start" />
              <sequenceFlow id="to-fork" sourceRef="start" targetRef="fork" />
              <parallelGateway id="fork" />
              <sequenceFlow id="to-direct" sourceRef="fork" targetRef="direct" />
              <sequenceFlow id="to-waiting" sourceRef="fork" targetRef="waiting" />
              <task id="direct" />
              <userTask id="waiting" />
              <sequenceFlow id="direct-to-join" sourceRef="direct" targetRef="join" />
              <sequenceFlow id="waiting-to-throw" sourceRef="waiting" targetRef="throw" />
              <intermediateThrowEvent id="throw"><linkEventDefinition name="LINKA" /></intermediateThrowEvent>
              <intermediateCatchEvent id="catch"><linkEventDefinition name="LINKA" /></intermediateCatchEvent>
              <sequenceFlow id="catch-to-join" sourceRef="catch" targetRef="join" />
              <parallelGateway id="join" />
              <sequenceFlow id="to-end" sourceRef="join" targetRef="end" />
              <endEvent id="end" />
            </process>
          </definitions>`;
          definition = new Definition(await testHelpers.context(source), { settings: { skipDiscard } });
        });

        let end;
        When('definition is ran', () => {
          end = definition.waitFor('end');
          definition.run();
        });

        Then('the join discovered the link-fed peer and is not taken until it arrives', () => {
          expect(definition.getActivityById('join').counters).to.have.property('taken', 0);
          expect(definition.getPostponed().some((a) => a.id === 'waiting')).to.be.true;
        });

        When('the waiting task on the link branch is signalled', () => {
          definition.signal({ id: 'waiting' });
        });

        Then('run completes', () => {
          return end;
        });

        And('the join was taken exactly once', () => {
          expect(definition.getActivityById('join').counters).to.have.property('taken', 1);
        });

        And('end was taken once', () => {
          expect(definition.getActivityById('end').counters).to.have.property('taken', 1);
        });
      });

      Scenario('a flow with link event to bypass logic', () => {
        let context, definition;
        Given('a flow with link event definition to bypass major part of logic', async () => {
          const source = factory.resource('link-to-bypass-logic.bpmn');

          context = await testHelpers.context(source);

          definition = new Definition(context, {
            variables: {
              condition: true,
            },
            settings: {
              skipDiscard,
            },
          });
        });

        let end;
        When('definition is ran with condition to take link', () => {
          end = definition.waitFor('end');
          definition.run();
        });

        Then('run completes', () => {
          return end;
        });

        And('end was taken once', () => {
          expect(definition.getActivityById('end').counters).to.have.property('taken', 1);
        });

        When('definition is ran with condition to discard link', () => {
          end = definition.waitFor('end');

          definition.environment.variables.condition = false;

          definition.run();
        });

        Then('run completes', () => {
          return end;
        });

        And('end was taken again', () => {
          expect(definition.getActivityById('end').counters).to.have.property('taken', 3);
        });
      });

      Scenario('a flow with multiple link events to bypass logic', () => {
        let context, definition;
        Given('a flow matching scenario', async () => {
          const source = factory.resource('multiple-links-to-bypass-logic.bpmn');

          context = await testHelpers.context(source);

          definition = new Definition(context, {
            variables: {
              condition1: true,
            },
            settings: {
              skipDiscard,
            },
          });
        });

        let end;
        When('definition is ran with condition to take link 1', () => {
          end = definition.waitFor('end');
          definition.run();
        });

        Then('run completes', () => {
          return end;
        });

        And('end was taken once', () => {
          expect(definition.getActivityById('end').counters).to.have.property('taken', 1);
        });

        When('definition is ran with condition to take link 2', () => {
          end = definition.waitFor('end');

          definition.environment.variables.condition1 = false;
          definition.environment.variables.condition2 = true;

          definition.run();
        });

        Then('run completes', () => {
          return end;
        });

        And('end was taken again', () => {
          expect(definition.getActivityById('end').counters).to.have.property('taken', 2);
        });

        When('definition is ran with condition to take both links', () => {
          end = definition.waitFor('end');

          definition.environment.variables.condition1 = true;
          definition.environment.variables.condition2 = true;

          definition.run();
        });

        Then('run completes', () => {
          return end;
        });

        And('end was taken twice', () => {
          expect(definition.getActivityById('end').counters).to.have.property('taken', 4);
        });

        When('definition is ran with condition to discard both links', () => {
          end = definition.waitFor('end');

          definition.environment.variables.condition1 = false;
          definition.environment.variables.condition2 = false;

          definition.run();
        });

        Then('run completes', () => {
          return end;
        });

        And('end was taken twice', () => {
          expect(definition.getActivityById('end').counters).to.have.property('taken', 6);
        });
      });

      Scenario('a flow with multiple named link throw and catch events', () => {
        /** @type {Definition} */
        let definition;
        Given('a flow with an inclusive gateway routing to one or both link throw events', async () => {
          const source = factory.resource('link-multiple.bpmn');
          const context = await testHelpers.context(source);

          definition = new Definition(context, {
            variables: {
              take1: true,
            },
            settings: {
              skipDiscard,
            },
          });
        });

        let end;
        When('definition is ran with condition to take LINKA only', () => {
          end = definition.waitFor('end');
          definition.run();
        });

        Then('run completes', () => {
          return end;
        });

        And('LINKA end was taken once', () => {
          expect(definition.getActivityById('end-a').counters).to.have.property('taken', 1);
        });

        And('LINKB end stayed dormant', () => {
          expect(definition.getActivityById('end-b').counters).to.have.property('taken', 0);
        });

        When('definition is ran with condition to take LINKB only', () => {
          end = definition.waitFor('end');

          definition.environment.variables.take1 = false;
          definition.environment.variables.take2 = true;

          definition.run();
        });

        Then('run completes', () => {
          return end;
        });

        And('LINKA end was not taken again', () => {
          expect(definition.getActivityById('end-a').counters).to.have.property('taken', 1);
        });

        And('LINKB end was taken once', () => {
          expect(definition.getActivityById('end-b').counters).to.have.property('taken', 1);
        });

        When('definition is ran with condition to take both links', () => {
          end = definition.waitFor('end');

          definition.environment.variables.take1 = true;
          definition.environment.variables.take2 = true;

          definition.run();
        });

        Then('run completes', () => {
          return end;
        });

        And('LINKA end was taken again', () => {
          expect(definition.getActivityById('end-a').counters).to.have.property('taken', 2);
        });

        And('LINKB end was taken again', () => {
          expect(definition.getActivityById('end-b').counters).to.have.property('taken', 2);
        });
      });
    });
  });
});
