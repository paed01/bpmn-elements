import Definition from '../../src/definition/Definition.js';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';

const ebgSource = factory.resource('event-based-gateway.bpmn');
const sameTargetSource = factory.resource('event-based-gateway-with-same-target.bpmn');

Feature('EventBasedGateway', () => {
  Scenario('EventBasedGateway with attached intermediate timer and signal event', () => {
    let bp;
    Given('a process with gateway and intermediate catch events', async () => {
      const context = await testHelpers.context(ebgSource);
      [bp] = context.getProcesses();
    });

    let wait, timer, end;
    When('process is ran', () => {
      wait = bp.waitFor('activity.wait');
      timer = bp.waitFor('activity.timer');
      end = bp.waitFor('end');

      bp.run();
    });

    let timerApi;
    Then('timer is started', async () => {
      timerApi = await timer;
    });

    let signalApi;
    And('signal event is waiting for signal', async () => {
      signalApi = await wait;
    });

    When('process receives signal', () => {
      bp.signal(signalApi.content.signal);
    });

    Then('timer is discarded', () => {
      expect(timerApi.owner.counters).to.have.property('discarded', 1);
    });

    And('process completes run', () => {
      return end;
    });

    When('process is ran again', () => {
      wait = bp.waitFor('activity.wait');
      timer = bp.waitFor('activity.timer');
      end = bp.waitFor('end');

      bp.run();
    });

    Then('timer is started', async () => {
      timerApi = await timer;
    });

    And('signal event is waiting for signal', async () => {
      signalApi = await wait;
    });

    When('timer is cancelled', () => {
      bp.cancelActivity({ id: timerApi.id });
    });

    Then('timer is taken', () => {
      expect(timerApi.owner.counters).to.have.property('taken', 1);
      expect(timerApi.owner.counters).to.have.property('discarded', 1);
    });

    And('signal was discarded', () => {
      expect(signalApi.owner.counters).to.have.property('taken', 1);
      expect(signalApi.owner.counters).to.have.property('discarded', 1);
    });

    And('process completes run', () => {
      return end;
    });
  });

  Scenario('recovered gateway with intermediate timer and message event', () => {
    let definition, context;
    Given('a definition with user task, gateway, timeout and intermediate catch message event', async () => {
      const source = `
      <definitions id="EventBasedGateway" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <message id="Message_1" name="Continue Message" />
        <process id="Process_0" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-userTask" sourceRef="start" targetRef="userTask" />
          <userTask id="userTask" />
          <sequenceFlow id="to-gateway" sourceRef="userTask" targetRef="gateway" />
          <eventBasedGateway id="gateway" />
          <sequenceFlow id="to-messageEvent" sourceRef="gateway" targetRef="messageEvent" />
          <sequenceFlow id="to-timerEvent" sourceRef="gateway" targetRef="timerEvent" />
          <intermediateCatchEvent id="messageEvent">
            <messageEventDefinition messageRef="Message_1" />
          </intermediateCatchEvent>
          <intermediateCatchEvent id="timerEvent">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT1M</timeDuration>
            </timerEventDefinition>
          </intermediateCatchEvent>
          <sequenceFlow id="to-task1" sourceRef="messageEvent" targetRef="task1" />
          <task id="task1" />
          <sequenceFlow id="to-end" sourceRef="task1" targetRef="end" />
          <sequenceFlow id="to-timedout" sourceRef="timerEvent" targetRef="timedout" />
          <endEvent id="end" />
          <endEvent id="timedout">
            <bpmn:errorEventDefinition id="ErrorEventDefinition_1ugekgz" />
          </endEvent>
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let wait, timer, state;
    When('definition is ran with state saving at wait and timer', () => {
      definition.on('activity.wait', () => {
        state = definition.getState();
      });
      definition.on('activity.timer', () => {
        state = definition.getState();
      });

      wait = definition.waitFor('activity.wait');
      timer = definition.waitFor('activity.timer');

      definition.run();
    });

    And('user task is signaled', () => {
      definition.signal({
        id: 'userTask',
      });
    });

    Then('message event is waiting and timer is started', async () => {
      await timer;
      await wait;
    });

    Given('state is saved', (done) => {
      process.nextTick(done);
    });

    let end;
    When('definition is resumed and signaled', () => {
      definition.stop();
      definition = new Definition(context.clone());
      end = definition.waitFor('end');

      definition.recover(state);
      definition.resume();

      definition.signal({ id: 'Message_1' });
    });

    Then('definition completes run', () => {
      return end;
    });
  });

  Scenario('Resuming EventBasedGateway with attached intermediate timer and signal event', () => {
    let bp;
    Given('a process with gateway and intermediate catch events', async () => {
      const context = await testHelpers.context(ebgSource);
      [bp] = context.getProcesses();
    });

    let wait, timer;
    When('process is ran', () => {
      wait = bp.waitFor('activity.wait');
      timer = bp.waitFor('activity.timer');

      bp.run();
    });

    let timerApi;
    Then('timer is started', async () => {
      timerApi = await timer;
    });

    let signalApi;
    And('signal event is waiting for event', async () => {
      signalApi = await wait;
    });

    When('process is stopped', () => {
      bp.stop();
    });

    let end;
    And('resumed', () => {
      wait = bp.waitFor('activity.wait');
      timer = bp.waitFor('activity.timer');
      end = bp.waitFor('end');
      bp.resume();
    });

    Then('signal event is still waiting', async () => {
      signalApi = await wait;
    });

    And('timer is restarted', async () => {
      timerApi = await timer;
    });

    And('process is signaled', () => {
      bp.signal(signalApi.content.signal);
    });

    Then('timer is discarded', () => {
      expect(timerApi.owner.counters).to.have.property('discarded', 1);
    });

    And('process completes run', () => {
      return end;
    });
  });

  Scenario('gateway with event that completes immediately', () => {
    let definition, context;
    Given('a definition with event based gateway, timeout and intermediate catch message event', async () => {
      const source = `
      <definitions id="EventBasedGateway" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <message id="Message_1" name="Continue Message" />
        <process id="Process_0" isExecutable="true">
          <eventBasedGateway id="gateway" />
          <sequenceFlow id="to-messageEvent" sourceRef="gateway" targetRef="messageEvent" />
          <sequenceFlow id="to-timerEvent" sourceRef="gateway" targetRef="timerEvent" />
          <intermediateCatchEvent id="messageEvent">
            <messageEventDefinition messageRef="Message_1" />
          </intermediateCatchEvent>
          <intermediateCatchEvent id="timerEvent">
            <timerEventDefinition></timerEventDefinition>
          </intermediateCatchEvent>
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end;
    When('definition is ran with state saving at wait and timer', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('definition completes run', () => {
      return end;
    });
  });

  Scenario('an eventbased gateway two outbound flows with the same target and a second target', () => {
    let definition;
    let wait;
    let end;
    When('definition is ran', async () => {
      const gatewayContext = await testHelpers.context(sameTargetSource);
      definition = new Definition(gatewayContext);

      end = definition.waitFor('leave');
      wait = definition.waitFor('wait');

      definition.run();
    });

    let targetApi;
    Then('target is waiting for signal', async () => {
      targetApi = await wait;
    });

    When('target is signalled', () => {
      definition.signal({ id: targetApi.content.signal.id });
    });

    Then('execution completed', () => {
      return end;
    });

    When('ran again', () => {
      end = definition.waitFor('leave');
      wait = definition.waitFor('wait');

      definition.run();
    });

    Then('target is waiting for signal again', async () => {
      targetApi = await wait;
    });

    When('second target completes', () => {
      definition.environment.timers.executing.pop().callback();
    });

    Then('run completes', () => {
      return end;
    });

    And('first target was discarded once', () => {
      expect(definition.getActivityById(targetApi.id).counters).to.deep.equal({ taken: 1, discarded: 1 });
    });
  });
});
