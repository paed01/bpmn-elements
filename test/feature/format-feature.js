import Definition from '../../src/definition/Definition';
import testHelpers from '../helpers/testHelpers';

Feature('Stop and resume', () => {
  Scenario('Stop and resume at activity wait', () => {
    let definition;
    Given('a process with form start event, user tasks, and a service task', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="formatProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-service-task" sourceRef="start" targetRef="service-task" />
          <serviceTask id="service-task" implementation="\${environment.services.saveState}" />
          <sequenceFlow id="to-end" sourceRef="service-task" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = Definition(context, {
        services: {
          saveState({content}, ...args) {
            process.nextTick(() => {
              states.push(content.id);
              args.pop()();
            });
          },
        },
        extensions: {
          saveStateOnEnd(activity) {

            activity.on('end', (api) => {
              if (api.fields.redelivered) return;
              const {broker} = activity;
              broker.publish('format', 'run.end.state', {endRoutingKey: 'run.end.saved'});

              api.environment.services.saveState(api, () => {
                broker.publish('format', 'run.end.saved', {stateSavedAt: new Date()});
              });
            });
          },
        }
      });
    });

    let end;
    const states = [];
    When('ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('run completes', () => {
      expect(states).to.have.members(['start', 'service-task', 'service-task', 'end', 'formatProcess']);
    });
  });
});
