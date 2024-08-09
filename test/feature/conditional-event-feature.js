import { Definition } from '../../src/definition/Definition.js';
import testHelpers from '../helpers/testHelpers.js';
import factory from '../helpers/factory.js';
import js from '../resources/extensions/JsExtension.js';

const extensions = {
  js,
};

const boundJsEventSource = factory.resource('conditional-bound-js-event.bpmn');

Feature('Conditional event', () => {
  Scenario('A service with conditional bound expression event', () => {
    let definition, callback;
    Given('a process', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <serviceTask id="service" implementation="\${environment.services.test}" />
          <boundaryEvent id="conditionalEvent" attachedToRef="service" cancelActivity="true">
            <conditionalEventDefinition>
              <condition xsi:type="tFormalExpression">\${environment.services.conditionMet(content, properties.type)}</condition>
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

    And('a condition evaluation function', () => {
      definition.environment.addService('conditionMet', function conditionMet(_messageContent, type) {
        if (type !== 'signal') return false;
        return true;
      });
    });

    let completed;
    When('ran', () => {
      completed = definition.waitFor('leave');
      definition.run();
    });

    And('service completes', () => {
      callback();
    });

    Then('run completes', () => {
      return completed;
    });

    And('bound condition was discarded', () => {
      expect(definition.getActivityById('conditionalEvent').counters).to.deep.equal({ taken: 0, discarded: 1 });
    });

    let wait;
    When('ran again', () => {
      completed = definition.waitFor('leave');
      wait = definition.waitFor('wait');
      definition.run();
    });

    Then('bound condition is waiting', async () => {
      const event = await wait;
      expect(event.content).to.have.property('condition', 'expression');
    });

    When('condition is signalled', () => {
      definition.signal({ id: 'conditionalEvent' });
    });

    Then('run completes', () => {
      return completed;
    });

    And('bound condition was taken', () => {
      expect(definition.getActivityById('conditionalEvent').counters).to.deep.equal({ taken: 1, discarded: 1 });
    });

    Given('a bad condition evaluation function', () => {
      definition.environment.addService('conditionMet', () => {
        throw new Error('Unexpected');
      });
    });

    let errored;
    When('ran again', () => {
      errored = definition.waitFor('error');
      definition.run();
    });

    And('condition is signalled', () => {
      definition.signal({ id: 'conditionalEvent' });
    });

    Then('run fails', async () => {
      const err = await errored;
      expect(err.content.error).to.have.property('source').with.property('content').with.property('id', 'conditionalEvent');
    });

    And('bound condition was discarded', () => {
      expect(definition.getActivityById('conditionalEvent').counters).to.deep.equal({ taken: 1, discarded: 2 });
    });
  });

  Scenario('With bound javascript condition', () => {
    let context, definition;
    Given('a process matching scenario', async () => {
      context = await testHelpers.context(boundJsEventSource);
      definition = new Definition(context);
    });

    let wait, completed;
    When('ran', () => {
      wait = definition.waitFor('wait', (_, msg) => {
        return msg.content.id === 'cond';
      });
      completed = definition.waitFor('leave');
      definition.run();
    });

    And('conditional bound event is signalled', async () => {
      await wait;
      definition.signal({ id: 'cond' });
    });

    Then('run completes', async () => {
      await completed;
    });

    And('bound condition was taken', () => {
      expect(definition.getActivityById('cond').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    When('ran again', () => {
      wait = definition.waitFor('wait', (_, msg) => {
        return msg.content.id === 'cond';
      });
      completed = definition.waitFor('leave');
      definition.run();
    });

    And('task with attached condition is signalled', async () => {
      await wait;
      definition.signal({ id: 'task' });
    });

    Then('run completes', async () => {
      await completed;
    });

    And('bound condition was discared', () => {
      expect(definition.getActivityById('cond').counters).to.deep.equal({ taken: 1, discarded: 1 });
    });

    Given('ran once again', () => {
      wait = definition.waitFor('wait', (_, msg) => {
        return msg.content.id === 'cond';
      });
      definition.run();
    });

    let state;
    And('stopped while waiting for condition', async () => {
      await wait;
      definition.stop();
      state = definition.getState();
    });

    When('stopped run is resumed', () => {
      wait = definition.waitFor('wait', (_, msg) => {
        return msg.content.id === 'cond';
      });
      completed = definition.waitFor('leave');
      definition.resume();
    });

    Then('condition is waiting again', async () => {
      await wait;
    });

    When('task with attached condition is signalled', () => {
      definition.signal({ id: 'cond' });
    });

    Then('resumed run completes', async () => {
      await completed;
    });

    When('stopped state is used to recover and resume run', () => {
      definition = new Definition(context.clone()).recover(state);

      wait = definition.waitFor('wait', (_, msg) => {
        return msg.content.id === 'cond';
      });
      completed = definition.waitFor('leave');

      definition.resume();
    });

    Then('condition is waiting again', async () => {
      await wait;
    });

    And('task with attached condition is signalled', async () => {
      await wait;
      definition.signal({ id: 'cond' });
    });

    Then('recovered run completes', async () => {
      await completed;
    });
  });

  Scenario('recover resume', () => {
    let context, definition;
    Given('a process with bound javascript condition', async () => {
      const source = `
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="theProcess" isExecutable="true">
            <startEvent id="start" />
            <manualTask id="task" />
            <boundaryEvent id="cond" attachedToRef="task" cancelActivity="true">
              <conditionalEventDefinition>
                <condition xsi:type="tFormalExpression" language="js">
                  next(null, properties.type === 'signal' && content.message.type === "create");
                </condition>
              </conditionalEventDefinition>
            </boundaryEvent>
            <endEvent id="end" />
            <sequenceFlow id="flow0" sourceRef="start" targetRef="task" />
            <sequenceFlow id="flow1" sourceRef="task" targetRef="end" />
            <sequenceFlow id="flow2" sourceRef="cond" targetRef="end" />
          </process>
        </definitions>`;

      context = await testHelpers.context(source);

      definition = new Definition(context);
    });

    let state, stopped;
    When('run and saving state on activity condition', () => {
      definition = new Definition(context.clone());
      definition.waitFor('activity.condition', () => {
        state = definition.getState();
        definition.stop();
      });
      stopped = definition.waitFor('stop');

      definition.run();
    });

    Then('state is saved', async () => {
      await stopped;
    });

    When('recovered and resumed', () => {
      definition = new Definition(context.clone()).recover(state);
      definition.resume();

      definition.waitFor('activity.condition', () => {
        state = definition.getState();
        definition.stop();
      });
      stopped = definition.waitFor('stop');
    });

    And('condition is signalled with non-matching message', () => {
      definition.signal({ id: 'cond' });
    });

    Then('run is stopped', () => {
      return stopped;
    });

    let completed;
    When('recovered and resumed from signal', () => {
      definition = new Definition(context.clone()).recover(state);
      definition.resume();

      completed = definition.waitFor('leave');
    });

    And('condition is signalled with matching message', () => {
      definition.signal({ id: 'cond', type: 'create' });
    });

    Then('run completes', () => {
      return completed;
    });

    When('recovered and resumed from signal state again', () => {
      definition = new Definition(context.clone()).recover(state);
      definition.resume();

      stopped = definition.waitFor('stop');
    });

    And('condition is signalled with non-matching message and stopped on activity.condition', () => {
      definition.getActivityById('cond').broker.subscribeOnce('event', 'activity.condition', () => {
        definition.stop();
      });

      definition.signal({ id: 'cond' });
    });

    Then('run is stopped', () => {
      return stopped;
    });

    When('run is resumed', () => {
      definition.resume();
      completed = definition.waitFor('leave');
    });

    And('condition is signalled with matching message', () => {
      definition.signal({ id: 'cond', type: 'create' });
    });

    Then('resumed run completes', () => {
      return completed;
    });

    When('recovered and resumed from signal state yet again', () => {
      definition = new Definition(context.clone()).recover(state);
      definition.resume();

      completed = definition.waitFor('leave');
    });

    And('attached task completes', () => {
      definition.signal({ id: 'task' });
    });

    Then('resumed run completes', () => {
      return completed;
    });
  });

  Scenario('signalling', () => {
    let context, definition;
    Given('a process matching scenario', async () => {
      const source = `
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="theProcess" isExecutable="true">
            <startEvent id="start" />
            <manualTask id="task" />
            <boundaryEvent id="cond" attachedToRef="task" cancelActivity="true">
              <conditionalEventDefinition>
                <condition xsi:type="tFormalExpression" language="js">
                  next(null, properties.type === 'signal' && content.message.type === "create");
                </condition>
              </conditionalEventDefinition>
            </boundaryEvent>
            <endEvent id="end" />
            <sequenceFlow id="flow0" sourceRef="start" targetRef="task" />
            <sequenceFlow id="flow1" sourceRef="task" targetRef="end" />
            <sequenceFlow id="flow2" sourceRef="cond" targetRef="end" />
          </process>
        </definitions>`;

      context = await testHelpers.context(source);

      definition = new Definition(context);
    });

    let wait, completed;
    When('ran waiting for signal', () => {
      definition = new Definition(context.clone());
      wait = definition.waitFor('wait', (_, msg) => {
        return msg.content.id === 'cond';
      });
      completed = definition.waitFor('leave');

      definition.run();
    });

    And('signalled multiple times where one in the middle matches condition', async () => {
      await wait;

      for (let i = 0; i < 15; i++) {
        definition.signal({ id: 'cond', type: i === 8 ? 'create' : 'ignore' });
      }
    });

    Then('run completes', () => {
      return completed;
    });
  });

  Scenario('With bound bad javascript condition', () => {
    let context, definition, callback;
    Given('a process matching scenario', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <serviceTask id="service" implementation="\${environment.services.test}" />
          <boundaryEvent id="cond" attachedToRef="service" cancelActivity="true">
            <conditionalEventDefinition>
              <condition xsi:type="tFormalExpression" language="js">next(null, properties.type === 'signal' && content.foo.bar);</condition>
            </conditionalEventDefinition>
          </boundaryEvent>
          <endEvent id="end" />
          <sequenceFlow id="flow0" sourceRef="start" targetRef="service" />
          <sequenceFlow id="flow1" sourceRef="service" targetRef="end" />
          <sequenceFlow id="flow2" sourceRef="cond" targetRef="end" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
      context.environment.addService('test', (...args) => {
        callback = args.pop();
      });

      definition = new Definition(context);
    });

    let wait, errored;
    When('ran', () => {
      wait = definition.waitFor('wait', (_, msg) => {
        return msg.content.id === 'cond';
      });
      errored = definition.waitFor('error');
      definition.run();
    });

    And('conditional bound event is signalled', async () => {
      await wait;
      definition.signal({ id: 'cond' });
    });

    Then('run failed', async () => {
      await errored;
    });

    let completed;
    Given('ran again', () => {
      definition = new Definition(context.clone());
      wait = definition.waitFor('wait');
      completed = definition.waitFor('leave');
      definition.run();
    });

    When('task completes', async () => {
      await wait;
      callback();
    });

    Then('run completes', () => {
      return completed;
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
      definition = new Definition(context);
    });

    let completed;
    When('ran and condition is met', () => {
      definition.environment.addService('conditionMet', () => {
        return true;
      });

      completed = definition.waitFor('leave');
      definition.run();
    });

    Then('run completes', () => {
      return completed;
    });

    Given('a bad condition function', () => {
      definition.environment.addService('conditionMet', () => {
        if (count++ % 2) return false;
        throw new Error('Unexpected');
      });
    });

    let errored;
    When('ran again', () => {
      errored = definition.waitFor('error');
      definition.run();
    });

    Then('run fails', async () => {
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

    Then('run fails', async () => {
      const err = await errored;
      expect(err.content.error).to.have.property('source').with.property('content').with.property('id', 'start');
    });
  });

  Scenario('external script resource', () => {
    let definition;
    Given('a source with external resource condition', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:js="http://paed01.github.io/bpmn-engine/schema/2017/08/bpmn">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <manualTask id="task" />
          <boundaryEvent id="cond" attachedToRef="task" cancelActivity="true">
            <conditionalEventDefinition>
              <condition xsi:type="tFormalExpression" language="js" js:resource="./external.js" />
            </conditionalEventDefinition>
          </boundaryEvent>
          <endEvent id="end" />
          <sequenceFlow id="flow0" sourceRef="start" targetRef="task" />
          <sequenceFlow id="flow1" sourceRef="task" targetRef="end" />
          <sequenceFlow id="flow2" sourceRef="cond" targetRef="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, {
        extensions,
        scripts: {
          register(elm) {
            if (elm.behaviour.resource === './external.js') {
              return {
                execute(_executionContext, callback) {
                  return callback(null, { input: 3 });
                },
              };
            }
          },
          getScript(_, elm) {
            if (elm.behaviour.resource === './external.js') {
              return {
                execute(_executionContext, callback) {
                  return callback(null, { input: 3 });
                },
              };
            }
          },
        },
      });

      definition = new Definition(context);
    });

    let completed;
    When('ran and condition is met', () => {
      definition.environment.addService('conditionMet', () => {
        return true;
      });

      completed = definition.waitFor('leave');
      definition.run();
    });

    Then('run completes', () => {
      return completed;
    });
  });

  Scenario('condition script is slow', () => {
    let context, definition;
    Given('a process with bound javascript condition', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="service" implementation="\${environment.services.test}" />
          <boundaryEvent id="cond" attachedToRef="service" cancelActivity="true">
            <conditionalEventDefinition>
              <condition xsi:type="tFormalExpression" language="js">
                environment.services.conditionMet(properties.type, next);
              </condition>
            </conditionalEventDefinition>
          </boundaryEvent>
        </process>
      </definitions>`;

      context = await testHelpers.context(source);

      definition = new Definition(context);
    });

    And('service function completes immediately', () => {
      definition.environment.addService('test', (...args) => args.pop()());
    });

    let nextFunction;
    And('a slow condition function', () => {
      definition.environment.addService('conditionMet', (_type, next) => {
        nextFunction = next;
      });
    });

    let completed;
    When('run', () => {
      completed = definition.waitFor('leave');
      definition.run();
    });

    Then('run completes since service completed', () => {
      return completed;
    });

    But('condition still waits', () => {
      expect(nextFunction).to.be.ok;
    });

    When('condition completes', () => {
      nextFunction(null, true);
    });

    Then('it is ignored', () => {
      expect(definition.getActivityById('cond').counters).to.deep.equal({ taken: 0, discarded: 1 });
    });
  });
});
