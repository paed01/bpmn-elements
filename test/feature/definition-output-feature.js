import Definition from '../../src/definition/Definition.js';
import testHelpers from '../helpers/testHelpers.js';

Feature('Definition output', () => {
  Scenario('Process completes with output', () => {
    let definition;
    Given('a process with output', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="script-definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="my-process" isExecutable="true">
          <scriptTask id="task" scriptFormat="js">
            <script><![CDATA[
              environment.output.foo = 'bar';
              next();
            ]]>
            </script>
          </scriptTask>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('definition state contain hoisted process output', () => {
      expect(definition.getState().environment.output).to.deep.equal({ foo: 'bar' });
    });
  });

  Scenario('Process fails after writing output', () => {
    let definition;
    Given('a process with output', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="script-definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="my-process" isExecutable="true">
          <scriptTask id="task" scriptFormat="js">
            <script><![CDATA[
              environment.output.foo = 'bar';

              baz();

              next();
            ]]>
            </script>
          </scriptTask>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let errored;
    When('ran', () => {
      errored = definition.waitFor('error');
      definition.run();
    });

    Then('run fails', () => {
      return errored;
    });

    And('definition state contain hoisted process output', () => {
      expect(definition.getState().environment.output).to.deep.equal({ foo: 'bar' });
    });
  });
});
