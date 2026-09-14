import { Definition } from 'bpmn-elements';
import js from '../resources/extensions/JsExtension.js';
import testHelpers from '../helpers/testHelpers.js';
import factory from '../helpers/factory.js';

Feature('Sub-process', () => {
  Scenario('SubProcess with parallel loop characteristics over collection', () => {
    let context, definition;
    Given('a process with one collection looped sub process with script task', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="TaskLoopProcess" isExecutable="true">
          <subProcess id="looped" js:result="iterated">
            <multiInstanceLoopCharacteristics isSequential="false" js:collection="\${environment.variables.list}" />
            <startEvent id="start" />
            <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
            <serviceTask id="task" implementation="\${environment.services.serviceFn}" js:result="result" />
            <sequenceFlow id="to-end" sourceRef="task" targetRef="end" />
            <endEvent id="end" />
          </subProcess>
        </process>
      </definitions>`;
      context = await testHelpers.context(source, {
        extensions: { js },
        services: {
          serviceFn(ctx, next) {
            process.nextTick(next, null, ctx.environment.variables.content.item);
          },
        },
      });
    });

    let leave;
    When('definition is run with 101 items and batch size 50', () => {
      definition = new Definition(context, {
        settings: {
          batchSize: 50,
        },
        variables: {
          list: new Array(101).fill().map((_, idx) => ({ idx })),
        },
      });

      leave = definition.waitFor('leave');
      definition.run();
    }).timeout(10000);

    Then('definition completes', () => {
      return leave;
    }).timeout(10000);

    And('task was looped expected number of times', () => {
      expect(definition.environment.output.iterated).to.have.length(101);
    });

    When('definition is run with 0 items', () => {
      definition = new Definition(context, {
        settings: {
          batchSize: 100,
        },
        variables: {
          list: [],
        },
      });

      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('definition completes when condition is met', () => {
      return leave;
    }).timeout(10000);

    And('task was looped expected number of times', () => {
      expect(definition.environment.output.iterated).to.have.length(0);
    });
  });

  Scenario('SubProcess with sequential loop characteristics over collection', () => {
    let context, definition;
    Given('a process with one collection looped sub process with script task', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="TaskLoopProcess" isExecutable="true">
          <subProcess id="looped" js:result="iterated">
            <multiInstanceLoopCharacteristics isSequential="true" js:collection="\${environment.variables.list}" />
            <startEvent id="start" />
            <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
            <serviceTask id="task" implementation="\${environment.services.serviceFn}" js:result="result" />
            <sequenceFlow id="to-end" sourceRef="task" targetRef="end" />
            <endEvent id="end" />
          </subProcess>
        </process>
      </definitions>`;
      context = await testHelpers.context(source, {
        extensions: { js },
        services: {
          serviceFn(ctx, next) {
            process.nextTick(next, null, ctx.environment.variables.content.item);
          },
        },
      });
    });

    let leave;
    When('run definition with 101 items', () => {
      definition = new Definition(context, {
        variables: {
          list: new Array(101).fill().map((_, idx) => ({ idx })),
        },
      });

      leave = definition.waitFor('leave');
      definition.run();
    }).timeout(10000);

    Then('definition completes', () => {
      return leave;
    }).timeout(10000);

    And('task was looped expected number of times', () => {
      expect(definition.environment.output.iterated).to.have.length(101);
    });

    When('definition is run with 0 items', () => {
      definition = new Definition(context, {
        settings: {
          batchSize: 100,
        },
        variables: {
          list: [],
        },
      });

      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('definition completes when condition is met', () => {
      return leave;
    }).timeout(10000);

    And('task was looped expected number of times', () => {
      expect(definition.environment.output.iterated).to.have.length(0);
    });
  });

  Scenario('SubProcess with sequential loop characteristics with loopback so that it runs again', () => {
    let context, definition;
    Given('a process matching feature', async () => {
      const source = factory.resource('misp-loopback.bpmn');
      context = await testHelpers.context(source);
    });

    let leave;
    When('running definition with instruction to loop back', () => {
      definition = new Definition(context, {
        variables: {
          cardinality: 10,
          loopback: true,
        },
      });
      leave = definition.waitFor('leave');
      definition.run();
    }).timeout(10000);

    Then('definition completes', () => {
      return leave;
    }).timeout(10000);

    And('sub process was taken twice with no lingering references', () => {
      const sub = definition.getActivityById('sub');
      expect(sub.counters).to.have.property('taken', 2);

      expect(sub.broker.consumerCount, 'broker.consumerCount').to.equal(3);
    });

    When('running definition again', () => {
      leave = definition.waitFor('leave');
      definition.run();
    }).timeout(10000);

    Then('definition completes', () => {
      return leave;
    }).timeout(10000);

    And('sub process was taken four times', () => {
      const sub = definition.getActivityById('sub');
      expect(sub.counters).to.have.property('taken', 4);

      expect(sub.broker.consumerCount, 'broker.consumerCount').to.equal(3);
    });
  });

  Scenario('SubProcess with parallel loop characteristics with loopback', () => {
    let context, definition;
    Given('a process matching feature', async () => {
      const source = factory.resource('misp-parallel-loopback.bpmn');
      context = await testHelpers.context(source);
    });

    let leave;
    When('running definition with instruction to loop back', () => {
      definition = new Definition(context, {
        variables: {
          cardinality: 10,
          loopback: true,
        },
      });
      leave = definition.waitFor('leave');

      definition.on('activity.wait', (api) => api.signal());

      definition.run();
    }).timeout(10000);

    Then('definition completes', () => {
      return leave;
    }).timeout(10000);

    And('sub process was taken twice', () => {
      const sub = definition.getActivityById('sub');
      expect(sub.counters).to.have.property('taken', 2);
      expect(sub.broker.consumerCount, 'broker.consumerCount').to.equal(3);
    });

    describe('stopped and resumed', () => {
      let stopped;
      When('running definition again', () => {
        definition = new Definition(context, {
          variables: {
            cardinality: 10,
            loopback: true,
          },
        });

        stopped = definition.waitFor('stop');

        definition.run();
      }).timeout(10000);

      let subExecution;
      And('stopped when iteration has started', () => {
        const [sub] = definition.getPostponed();

        subExecution = sub.owner.execution.source;
        expect(sub.getExecuting(), 'running iterations').to.have.length(10);

        definition.stop();
      });

      Then('definition run is stopped', () => {
        return stopped;
      }).timeout(10000);

      let sub;
      And('sub process is stopped', () => {
        sub = definition.getActivityById('sub');
        expect(sub.counters).to.have.property('discarded', 0);
        expect(sub.counters).to.have.property('taken', 0);
      });

      And('leaves no lingering references', () => {
        expect(sub.broker.consumerCount, 'broker.consumerCount').to.equal(1);
        expect(subExecution.executions, 'sub process behaviour executions').to.have.length(10);
      });

      When('resumed', () => {
        leave = definition.waitFor('leave');

        definition.on('activity.wait', (api) => api.signal());

        definition.resume();
      });

      Then('definition run completes', () => {
        return leave;
      }).timeout(10000);

      And('sub process is taken twice', () => {
        sub = definition.getActivityById('sub');
        expect(sub.counters).to.have.property('taken', 2);
        expect(sub.counters).to.have.property('discarded', 0);
      });

      And('leaves no lingering references', () => {
        expect(sub.broker.consumerCount, 'broker.consumerCount').to.equal(3);
        expect(subExecution.executions, 'sub process behaviour executions').to.have.length(0);
      });
    });

    describe('where one iteration fails', () => {
      let errored;
      When('running definition again', () => {
        definition = new Definition(context, {
          variables: {
            cardinality: 10,
            loopback: true,
          },
        });

        errored = definition.waitFor('error');

        definition.run();
      }).timeout(10000);

      let subExecution;
      And('one iteration fails', () => {
        const [sub] = definition.getPostponed();

        subExecution = sub.owner.execution.source;
        expect(sub.getExecuting(), 'running iterations').to.have.length(10);

        const waiting = sub.getPostponed().filter((e) => e.type === 'bpmn:UserTask');
        expect(waiting, 'waiting tasks').to.have.length(10);

        waiting[4].fail(new Error('break'));
      });

      Then('definition run fails', () => {
        return errored;
      }).timeout(10000);

      let sub;
      And('sub process was discarded once and not taken', () => {
        sub = definition.getActivityById('sub');
        expect(sub.counters).to.have.property('discarded', 1);
        expect(sub.counters).to.have.property('taken', 0);
      });

      And('leaves no lingering references', () => {
        expect(sub.broker.consumerCount, 'broker.consumerCount').to.equal(3);
        expect(subExecution.executions, 'sub process behaviour executions').to.have.length(0);
      });
    });

    describe('where one iteration is discarded', () => {
      When('running definition again', () => {
        definition = new Definition(context, {
          variables: {
            cardinality: 10,
            loopback: true,
          },
        });

        leave = definition.waitFor('leave');

        definition.run();
      }).timeout(10000);

      let subExecution;
      And('one iteration is discarded', () => {
        const [sub] = definition.getPostponed();

        subExecution = sub.owner.execution.source;
        const iterations = sub.getExecuting();
        expect(iterations, 'running iterations').to.have.length(10);

        iterations[2].discard();

        const waiting = sub.getPostponed().filter((e) => e.type === 'bpmn:UserTask');
        expect(waiting, 'waiting tasks').to.have.length(9);

        definition.on('activity.wait', (api) => api.signal());

        for (const task of waiting) task.signal();
      });

      Then('definition run completes', () => {
        return leave;
      }).timeout(10000);

      let sub;
      And('sub process was taken twice and not discarded', () => {
        sub = definition.getActivityById('sub');
        expect(sub.counters).to.have.property('taken', 2);
        expect(sub.counters).to.have.property('discarded', 0);
      });

      And('leaves no lingering references', () => {
        expect(sub.broker.consumerCount, 'broker.consumerCount').to.equal(3);
        expect(subExecution.executions, 'sub process behaviour executions').to.have.length(0);
      });
    });

    describe('the entire sub process is discarded', () => {
      When('running definition again', () => {
        definition = new Definition(context, {
          variables: {
            cardinality: 10,
            loopback: true,
          },
        });

        leave = definition.waitFor('leave');

        definition.run();
      }).timeout(10000);

      let subExecution;
      And('sub process is discarded', () => {
        const [sub] = definition.getPostponed();

        subExecution = sub.owner.execution.source;
        const iterations = sub.getExecuting();
        expect(iterations, 'running iterations').to.have.length(10);

        sub.discard();
      });

      Then('definition run completes', () => {
        return leave;
      }).timeout(10000);

      let sub;
      And('sub process was discarded once and not taken', () => {
        sub = definition.getActivityById('sub');
        expect(sub.counters).to.have.property('discarded', 1);
        expect(sub.counters).to.have.property('taken', 0);
      });

      And('leaves no lingering references', () => {
        expect(sub.broker.consumerCount, 'broker.consumerCount').to.equal(3);
        expect(subExecution.executions, 'sub process behaviour executions').to.have.length(0);
      });
    });
  });

  Scenario('sub process receives input as variables.input', () => {
    let definition;
    const capturedInput = [];
    Given('a process whose sub process formats input and records it', async () => {
      const source = `
      <definitions id="Def" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <process id="main-process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-sub" sourceRef="start" targetRef="sub" />
          <subProcess id="sub">
            <serviceTask id="task" implementation="\${environment.services.recordInput}" />
          </subProcess>
        </process>
      </definitions>`;
      const context = await testHelpers.context(source, {
        services: {
          recordInput(scope, callback) {
            capturedInput.push(scope.environment.variables.input);
            callback();
          },
        },
        extensions: {
          subInput: { extension: subInput },
        },
      });
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

    And('the sub process execution received the formatted input as variables.input', () => {
      expect(capturedInput).to.deep.equal([{ shoeSize: 42 }]);
    });
  });

  Scenario('multi-instance sub process passes the loop context as input', () => {
    let definition;
    const capturedInput = [];
    Given('a process with a sub process looping over a collection that records its input', async () => {
      const source = `
      <definitions id="Def" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:js="http://paed01.github.io/bpmn-engine/schema/2017/08/bpmn">
        <process id="main-process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-sub" sourceRef="start" targetRef="sub" />
          <subProcess id="sub">
            <multiInstanceLoopCharacteristics isSequential="false" js:collection="\${environment.variables.items}" />
            <serviceTask id="task" implementation="\${environment.services.recordInput}" />
          </subProcess>
        </process>
      </definitions>`;
      const context = await testHelpers.context(source, {
        variables: { items: ['one', 'two', 'three'] },
        services: {
          recordInput(scope, callback) {
            capturedInput.push(scope.environment.variables.input);
            callback();
          },
        },
        extensions: { js },
      });
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

    And('each sub process iteration received its loop context as variables.input', () => {
      expect(capturedInput.slice().sort((a, b) => a.index - b.index)).to.deep.equal([
        { isSequential: false, index: 0, cardinality: 3, item: 'one' },
        { isSequential: false, index: 1, cardinality: 3, item: 'two' },
        { isSequential: false, index: 2, cardinality: 3, item: 'three' },
      ]);
    });
  });

  Scenario('nested multi-instance sub processes looping over the same input variable', () => {
    let definition;
    const captured = [];
    Given('a sub process whose nested sub process loops over the same top-level input.collection', async () => {
      const source = `
      <definitions id="Def" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:js="http://paed01.github.io/bpmn-engine/schema/2017/08/bpmn">
        <process id="main-process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-sub" sourceRef="start" targetRef="sub" />
          <subProcess id="sub">
            <multiInstanceLoopCharacteristics isSequential="true" js:collection="\${environment.variables.input.collection}" js:elementVariable="outer" />
            <subProcess id="subsub">
              <multiInstanceLoopCharacteristics isSequential="false" js:collection="\${environment.variables.input.collection}" js:elementVariable="inner" />
              <serviceTask id="task" implementation="\${environment.services.recordInput}" />
            </subProcess>
          </subProcess>
        </process>
      </definitions>`;
      const context = await testHelpers.context(source, {
        variables: { input: { collection: ['a', 'b'] } },
        services: {
          recordInput(scope, callback) {
            const input = scope.environment.variables.input;
            captured.push({ outer: input.outer, inner: input.inner, collection: input.collection, isSequential: input.isSequential });
            callback();
          },
        },
        extensions: { js },
      });
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

    And('the inner loop still resolved its collection from the untouched top-level input', () => {
      expect(captured).to.deep.equal([
        { outer: 'a', inner: 'a', collection: ['a', 'b'], isSequential: false },
        { outer: 'a', inner: 'b', collection: ['a', 'b'], isSequential: false },
        { outer: 'b', inner: 'a', collection: ['a', 'b'], isSequential: false },
        { outer: 'b', inner: 'b', collection: ['a', 'b'], isSequential: false },
      ]);
    });
  });
});

function subInput(elm) {
  if (elm.id !== 'sub') return;
  return {
    activate() {
      elm.broker.subscribeTmp(
        'event',
        'activity.enter',
        () => {
          elm.broker
            .getQueue('format-run-q')
            .queueMessage({ routingKey: 'run.input.format' }, { input: { shoeSize: 42 } }, { persistent: false });
        },
        { noAck: true, consumerTag: '_sub-input' }
      );
    },
    deactivate() {
      elm.broker.cancel('_sub-input');
    },
  };
}
