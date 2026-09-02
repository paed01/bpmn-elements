import { Definition } from 'bpmn-elements';
import testHelpers from '../helpers/testHelpers.js';

Feature('Resume re-activates extensions', () => {
  Scenario('Stop while a start-event extension is blocking enter formatting, then resume the same instance', () => {
    let definition;
    const activations = [];
    Given('a process whose start event blocks formatting and an extension that tracks activation', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-end" sourceRef="start" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        extensions: {
          blockOnEnter(activity) {
            if (activity.id !== 'start') return;
            const broker = activity.broker;
            activity.on('enter', (api) => {
              if (api.fields.redelivered) return;
              // Publish a blocking format that is never resolved before the stop.
              broker.publish('format', 'run.enter.format', { endRoutingKey: 'run.enter.complete' });
            });
            return {
              activate() {
                activations.push(activity.id);
              },
              deactivate() {},
            };
          },
        },
      });
    });

    When('ran', () => {
      definition.run();
    });

    Then('the start event rests at status formatting', () => {
      expect(definition.getActivityById('start').status).to.equal('formatting');
    });

    let activationsBeforeResume;
    When('stopped and resumed on the same instance', () => {
      definition.stop();
      activationsBeforeResume = activations.length;
    });

    let end;
    And('resumed', () => {
      end = definition.waitFor('end');
      definition.resume();
    });

    Then('the run resumes instead of stalling at formatting', () => {
      return Promise.race([
        end,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`resume stalled at status '${definition.getActivityById('start').status}'`)), 500)
        ),
      ]);
    });

    And('the start event extension was re-activated on resume', () => {
      expect(activations.length).to.be.greaterThan(activationsBeforeResume);
    });
  });

  Scenario('Stop at status started in step mode, then resume the same instance', () => {
    let definition, activity;
    Given('a stepped process with an extension that maps output when activated', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="p" isExecutable="true">
          <startEvent id="a" />
          <sequenceFlow id="to-end" sourceRef="a" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        settings: { step: true },
        extensions: {
          io(element) {
            if (element.id !== 'a') return;
            const broker = element.broker;
            let consumerTag;
            return {
              // Mirrors an io output mapping: subscribes on activate, cancels on deactivate.
              activate() {
                if (consumerTag) return;
                consumerTag = broker.subscribeTmp(
                  'event',
                  'activity.end',
                  () => {
                    element.environment.output.aMapped = true;
                  },
                  { noAck: true }
                ).consumerTag;
              },
              deactivate() {
                if (consumerTag) {
                  broker.cancel(consumerTag);
                  consumerTag = undefined;
                }
              },
            };
          },
        },
      });
      activity = definition.getActivityById('a');
    });

    When('ran and stepped until the start event rests at status started', () => {
      definition.run();
      let guard = 0;
      while (activity.status !== 'started' && guard++ < 20) activity.next();
    });

    Then('it rests at status started', () => {
      expect(activity.status).to.equal('started');
    });

    When('stopped and resumed on the same instance', () => {
      definition.stop();
      definition.resume();
    });

    And('stepping continues to completion', () => {
      let guard = 0;
      while (activity.status !== undefined && guard++ < 20) activity.next();
      const end = definition.getActivityById('end');
      guard = 0;
      while (end.status !== undefined && guard++ < 20) end.next();
    });

    Then('the start event completed', () => {
      expect(activity.counters).to.have.property('taken', 1);
    });

    And('the activate-driven output mapping was not dropped', () => {
      expect(definition.environment.output).to.have.property('aMapped', true);
    });
  });
});
