import { Definition, OutputExtension } from 'bpmn-elements';
import testHelpers from '../helpers/testHelpers.js';

const source = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="theProcess" isExecutable="true">
    <startEvent id="start" />
    <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
    <userTask id="task" />
    <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
    <endEvent id="end" />
  </process>
</definitions>`;

Feature('Assign output', () => {
  Scenario('Definition runs with settings.assignOutput', () => {
    let definition;
    Given('a definition with a user task and settings.assignOutput', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, { settings: { assignOutput: 'id' } });
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('user task is signalled with output', () => {
      definition.getPostponed()[0].signal({ result: 42 });
    });

    Then('definition completes', () => {
      return end;
    });

    And('environment output holds the signalled task output', () => {
      expect(definition.environment.output).to.deep.equal({ task: { result: 42 } });
    });

    And('no output extension consumer lingers on the completed task', () => {
      expect(definition.getActivityById('task').broker.getConsumer('_output-extension')).to.not.be.ok;
    });
  });

  Scenario('Definition runs with settings.assignOutput auto', () => {
    let definition;
    Given('a definition with a user task and settings.assignOutput auto', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, { settings: { assignOutput: 'auto' } });
    });

    let end;
    When('definition is ran and user task is signalled with object output', () => {
      end = definition.waitFor('end');
      definition.run();
      definition.getPostponed()[0].signal({ result: 42 });
    });

    Then('definition completes', () => {
      return end;
    });

    And('object output is assigned to environment output', () => {
      expect(definition.environment.output).to.deep.equal({ result: 42 });
    });

    Given('another definition with settings.assignOutput auto', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, { settings: { assignOutput: 'auto' } });
    });

    When('definition is ran and user task is signalled with non-object output', () => {
      end = definition.waitFor('end');
      definition.run();
      definition.getPostponed()[0].signal(42);
    });

    Then('definition completes', () => {
      return end;
    });

    And('non-object output is keyed by activity id', () => {
      expect(definition.environment.output).to.deep.equal({ task: 42 });
    });

    Given('another definition with settings.assignOutput auto', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, { settings: { assignOutput: 'auto' } });
    });

    When('definition is ran and user task is signalled with array output', () => {
      end = definition.waitFor('end');
      definition.run();
      definition.getPostponed()[0].signal([1, 2]);
    });

    Then('definition completes', () => {
      return end;
    });

    And('array output is keyed by activity id', () => {
      expect(definition.environment.output).to.deep.equal({ task: [1, 2] });
    });
  });

  Scenario('Definition runs with settings.assignOutput off', () => {
    let definition;
    Given('a definition with a user task and settings.assignOutput off', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, { settings: { assignOutput: 'off' } });
    });

    let end;
    When('definition is ran and user task is signalled', () => {
      end = definition.waitFor('end');
      definition.run();
      definition.getPostponed()[0].signal({ result: 42 });
    });

    Then('definition completes', () => {
      return end;
    });

    And('environment output is empty', () => {
      expect(definition.environment.output).to.deep.equal({});
    });
  });

  Scenario('Definition runs without settings.assignOutput', () => {
    let definition;
    Given('a definition with a user task', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    let end;
    When('definition is ran and user task is signalled', () => {
      end = definition.waitFor('end');
      definition.run();
      definition.getPostponed()[0].signal({ result: 42 });
    });

    Then('definition completes', () => {
      return end;
    });

    And('environment output is empty', () => {
      expect(definition.environment.output).to.deep.equal({});
    });
  });

  Scenario('Extension declines to attach to the user task', () => {
    let definition;
    Given('a definition with an extension that only attaches to the start event, and settings.assignOutput', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        settings: { assignOutput: 'id' },
        extensions: {
          startOnly(activity, { environment }) {
            if (activity.id !== 'start') return;
            activity.on('end', () => {
              environment.output.startExtension = true;
            });
          },
        },
      });
    });

    let end;
    When('definition is ran and user task is signalled', () => {
      end = definition.waitFor('end');
      definition.run();
      definition.getPostponed()[0].signal({ result: 42 });
    });

    Then('definition completes', () => {
      return end;
    });

    And('the built-in output extension covered the user task, but not the start event', () => {
      expect(definition.environment.output).to.deep.equal({ startExtension: true, task: { result: 42 } });
    });
  });

  Scenario('Extension attaches to the user task', () => {
    let definition;
    Given('a definition with an extension that returns a lifecycle object for every activity, and settings.assignOutput', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        settings: { assignOutput: 'id' },
        extensions: {
          all(activity, { environment }) {
            activity.on('end', (api) => {
              environment.output[`ext-${api.id}`] = api.content.output ?? null;
            });
            return {};
          },
        },
      });
    });

    let end;
    When('definition is ran and user task is signalled', () => {
      end = definition.waitFor('end');
      definition.run();
      definition.getPostponed()[0].signal({ result: 42 });
    });

    Then('definition completes', () => {
      return end;
    });

    And('only the user extension assigned output', () => {
      expect(definition.environment.output).to.deep.equal({ 'ext-start': null, 'ext-task': { result: 42 }, 'ext-end': null });
    });
  });

  Scenario('Exported OutputExtension is registered as a user extension', () => {
    let definition;
    Given('a definition with OutputExtension registered under extensions, without settings.assignOutput', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        extensions: {
          output(activity, ctx) {
            if (activity.id !== 'task') return;
            return new OutputExtension(activity, ctx, 'id');
          },
        },
      });
    });

    let end;
    When('definition is ran and user task is signalled', () => {
      end = definition.waitFor('end');
      definition.run();
      definition.getPostponed()[0].signal({ result: 45 });
    });

    Then('definition completes', () => {
      return end;
    });

    And('environment output holds the signalled task output only', () => {
      expect(definition.environment.output).to.deep.equal({ task: { result: 45 } });
    });
  });

  Scenario('Exported OutputExtension is registered without assign type', () => {
    let definition;
    Given('a definition with OutputExtension registered under extensions without assign type', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        extensions: {
          output(activity, ctx) {
            return new OutputExtension(activity, ctx);
          },
        },
      });
    });

    let end;
    When('definition is ran and user task is signalled', () => {
      end = definition.waitFor('end');
      definition.run();
      definition.getPostponed()[0].signal({ result: 45 });
    });

    Then('definition completes', () => {
      return end;
    });

    And('environment output is empty since missing assign type is treated as off', () => {
      expect(definition.environment.output).to.deep.equal({});
    });
  });

  Scenario('Activity with IO specification combined with settings.assignOutput', () => {
    const ioSource = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
        <userTask id="task">
          <ioSpecification id="inputSpec">
            <dataOutput id="userOutput" name="result" />
          </ioSpecification>
          <dataOutputAssociation id="doa_1" sourceRef="userOutput" targetRef="DataObjectReference_1" />
        </userTask>
        <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
        <endEvent id="end" />
        <dataObjectReference id="DataObjectReference_1" dataObjectRef="DataObject_1" />
        <dataObject id="DataObject_1" />
      </process>
    </definitions>`;

    const signalOutput = { ioSpecification: { dataOutputs: [{ id: 'userOutput', value: 3 }] } };

    let definition;
    Given('a definition with a user task with IO specification and settings.assignOutput id', async () => {
      const context = await testHelpers.context(ioSource);
      definition = new Definition(context, { settings: { assignOutput: 'id' } });
    });

    let end;
    When('definition is ran and user task is signalled with data output', () => {
      end = definition.waitFor('end');
      definition.run();
      definition.getPostponed()[0].signal(signalOutput);
    });

    Then('definition completes', () => {
      return end;
    });

    And('data object is written by the IO extension', () => {
      expect(definition.getProcessById('theProcess').environment.variables._data).to.have.property('DataObject_1', 3);
    });

    And('the signalled output is keyed by activity id, untouched by IO formatting', () => {
      expect(definition.environment.output).to.deep.equal({ task: signalOutput });
    });

    Given('a definition with a user task with IO specification and settings.assignOutput auto', async () => {
      const context = await testHelpers.context(ioSource);
      definition = new Definition(context, { settings: { assignOutput: 'auto' } });
    });

    When('definition is ran and user task is signalled with data output', () => {
      end = definition.waitFor('end');
      definition.run();
      definition.getPostponed()[0].signal(signalOutput);
    });

    Then('definition completes', () => {
      return end;
    });

    And('data object is written by the IO extension', () => {
      expect(definition.getProcessById('theProcess').environment.variables._data).to.have.property('DataObject_1', 3);
    });

    And('the signalled output is merged onto environment output, untouched by IO formatting', () => {
      expect(definition.environment.output).to.deep.equal(signalOutput);
    });
  });

  Scenario('Stepped run rests at status end, is recovered and resumed', () => {
    let definition, task;
    Given('a stepped definition with a user task and settings.assignOutput', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, { settings: { assignOutput: 'id', step: true } });
      task = definition.getActivityById('task');
    });

    When('definition is stepped to the user task wait, signalled, and stepped until the task rests at status end', () => {
      definition.run();
      stepUntil(definition, () => definition.getPostponed().some((api) => api.id === 'task' && api.content.state === 'wait'));
      definition
        .getPostponed()
        .find((api) => api.id === 'task')
        .signal({ result: 44 });
      stepUntil(definition, () => task.status === 'end');
    });

    Then('the task rests at status end with output assigned to the running process environment', () => {
      expect(task.status).to.equal('end');
      expect(definition.getRunningProcesses()[0].environment.output).to.deep.equal({ task: { result: 44 } });
    });

    let state;
    When('definition is stopped and state saved', () => {
      definition.stop();
      state = definition.getState();
    });

    let end;
    And('definition is recovered, resumed, and stepped to completion', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, { settings: { assignOutput: 'id' } }).recover(state);
      end = definition.waitFor('end');
      definition.resume();
      stepUntil(definition, () => !definition.getRunningProcesses().length);
    });

    Then('definition completes', () => {
      return end;
    });

    And('environment output holds the output assigned before the stop, once', () => {
      expect(definition.environment.output).to.deep.equal({ task: { result: 44 } });
    });

    And('no output extension consumer lingers on the task', () => {
      expect(definition.getActivityById('task').broker.getConsumer('_output-extension')).to.not.be.ok;
    });
  });

  Scenario('Stop and resume with settings.assignOutput', () => {
    let definition;
    Given('a definition with a user task and settings.assignOutput', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, { settings: { assignOutput: 'id' } });
    });

    let state;
    When('definition is ran, stopped, and state saved', () => {
      definition.run();
      definition.stop();
      state = definition.getState();
    });

    let end;
    And('definition is recovered and resumed', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, { settings: { assignOutput: 'id' } }).recover(state);
      end = definition.waitFor('end');
      definition.resume();
    });

    And('user task is signalled with output', () => {
      definition.getPostponed()[0].signal({ result: 43 });
    });

    Then('definition completes', () => {
      return end;
    });

    And('environment output holds the signalled task output', () => {
      expect(definition.environment.output).to.deep.equal({ task: { result: 43 } });
    });
  });
});

function stepUntil(definition, predicate) {
  let guard = 0;
  while (!predicate() && guard++ < 50) {
    for (const bp of definition.getRunningProcesses()) {
      for (const activity of bp.getActivities()) activity.next();
    }
  }
}
