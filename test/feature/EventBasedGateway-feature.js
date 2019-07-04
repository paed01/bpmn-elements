import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';

const ebgSource = factory.resource('event-based-gateway.bpmn');

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

    When('process receives signal', async () => {
      bp.signal(signalApi.content.signal);
    });

    Then('timer is discarded', async () => {
      expect(timerApi.owner.counters).to.have.property('discarded', 1);
    });

    And('process completes run', async () => {
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
    And('resumed', async () => {
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

    And('process is signaled', async () => {
      bp.signal(signalApi.content.signal);
    });

    Then('timer is discarded', async () => {
      expect(timerApi.owner.counters).to.have.property('discarded', 1);
    });

    And('process completes run', async () => {
      return end;
    });
  });
});
