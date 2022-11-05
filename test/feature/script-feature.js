import Definition from '../../src/definition/Definition';
import testHelpers from '../helpers/testHelpers';

class Scripts {
  register({behaviour}) {
    if (!/^(javascript|js)$/i.test(behaviour.scriptFormat)) return;
  }
  compile() {}
  getScript() {}
}

Feature('Script', () => {
  Scenario('Register script fails', () => {
    let context, definition;

    Given('a process with a script task with unsupported script format', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="script-definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="my-process" isExecutable="true">
          <scriptTask id="task" scriptFormat="python">
            <script><![CDATA[
              import re
              m = re.search('(?<=abc)def', 'abcdef')
            ]]>
            </script>
          </scriptTask>
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
    });

    let err;
    When('definition run', () => {
      definition = new Definition(context, {scripts: new Scripts()});
      try {
        definition.run();
      } catch (e) {
        err = e;
      }
    });

    Then('error is thrown', () => {
      expect(err.message).to.equal('Script format python is unsupported or was not registered for <task>');
      definition.stop();
    });

    Given('async formatting is added', () => {
      definition = new Definition(context, {scripts: new Scripts()});
      const task = definition.getActivityById('task');
      task.on('enter', () => {
        task.broker.getQueue('format-run-q').queueMessage({routingKey: 'run.enter.format'}, {endRoutingKey: 'run.enter.complete'}, {persistent: false});
        setImmediate(() => {
          task.broker.publish('format', 'run.enter.complete', {data: 1}, {persistent: false});
        });
      });
    });

    let waitError;
    When('definition run', () => {
      waitError = definition.waitFor('error');
      definition.run();
    });

    Then('error is thrown', async () => {
      err = await waitError;
      expect(err.content.error.message).to.equal('Script format python is unsupported or was not registered for <task>');
    });
  });
});
