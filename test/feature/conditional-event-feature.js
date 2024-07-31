import { Definition } from '../../src/definition/Definition.js';
import testHelpers from '../helpers/testHelpers.js';
import factory from '../helpers/factory.js';

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

    let waiting;
    When('ran again', () => {
      completed = definition.waitFor('leave');
      waiting = definition.waitFor('wait');
      definition.run();
    });

    And('condition is signalled', async () => {
      await waiting;
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

    Then('run is errored', async () => {
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
