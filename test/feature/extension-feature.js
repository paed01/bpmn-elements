import testHelpers from '../helpers/testHelpers';
import Definition from '../../src/definition/Definition';
import camunda from 'camunda-bpmn-moddle/resources/camunda';

const extensions = {
  camunda: {
    moddleOptions: camunda,
  },
};

Feature('extensions', () => {
  Scenario('Process extension', () => {
    let definition;
    Given('a source with process execution listener extensions', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions id="theDefinition" name="Definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="theProcess" isExecutable="true" camunda:candidateStarterUsers="Root,Pal" camunda:versionTag="1">
          <extensionElements>
            <camunda:executionListener event="start">
              <camunda:script scriptFormat="javascript">
                this.environment.variables.startedAt = Date.now();
              </camunda:script>
            </camunda:executionListener>
            <camunda:executionListener event="end">
              <camunda:script scriptFormat="javascript">
                this.environment.variables.completedAt = Date.now();
              </camunda:script>
            </camunda:executionListener>
          </extensionElements>
          <startEvent id="activity" name="Start" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, {extensions});
      definition = Definition(context, {
        extensions: {
          executionListener
        }
      });

      function executionListener(elm) {
        if (elm.type === 'bpmn:Process') {
          executionListeners();
        }

        function executionListeners() {
          const {values} = elm.behaviour.extensionElements;

          values.forEach((extel) => {
            ExecutionListener(elm, extel);
          });
        }
      }

      function ExecutionListener({id, type, broker, environment}, {$type, event, script}) {
        if ($type !== 'camunda:ExecutionListener') return;
        const execScript = environment.scripts.compile(script.scriptFormat, `${type}/${id}/on${event}`, script.value);
        broker.subscribeTmp('event', `process.${event}`, onEvent, {noAck: true, priority: 1000});

        function onEvent(_, message) {
          execScript.runInNewContext({...message, environment});
        }
      }
    });

    let bp;
    Then('process behaviour contains the extended attributes', () => {
      [bp] = definition.getProcesses();
      expect(bp.behaviour).to.have.property('candidateStarterUsers', 'Root,Pal');
      expect(bp.behaviour).to.have.property('versionTag', '1');
    });

    let completed;
    When('run and complete process', () => {
      completed = bp.waitFor('leave');
      bp.run();
      return completed;
    });

    Then('extension execution listeners have executed', () => {
      expect(bp.environment.variables).to.have.property('startedAt').that.is.above(0);
      expect(bp.environment.variables).to.have.property('completedAt').that.is.above(0);
    });
  });
});
