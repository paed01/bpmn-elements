import Definition from '../../src/definition/Definition';
import js from '../resources/extensions/JsExtension';
import testHelpers from '../helpers/testHelpers';

Feature('Task loop', () => {
  Scenario('Standard loop characteristics', () => {
    let definition;
    const iterations = [];
    Given('a process with one standard loop task with condition', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="TaskLoopProcess" isExecutable="true">
          <task id="task">
            <standardLoopCharacteristics>
              <loopCondition xsi:type="bpmn:tFormalExpression">\${environment.services.stopLoop()}</loopCondition>
            </standardLoopCharacteristics>
          </task>
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);

      definition = Definition(context, {
        services: {
          stopLoop(completeMessage) {
            iterations.push(completeMessage);
            if (completeMessage.content.index === 3) return true;
          }
        }
      });
    });

    let leave;
    When('definition is run', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('definition completes when condition is met', () => {
      return leave;
    });

    And('task was looped expected number of times', () => {
      expect(iterations).to.have.length(4);
      expect(iterations.every(({fields}) => fields.routingKey === 'execute.completed'), 'at completed').to.be.true;
    });
  });

  Scenario('Standard loop characteristics that performs test before iteration', () => {
    let definition;
    const iterations = [];
    Given('a process with one standard loop task with condition and test before', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="TaskLoopProcess" isExecutable="true">
          <task id="task">
            <standardLoopCharacteristics testBefore="true">
              <loopCondition xsi:type="bpmn:tFormalExpression">\${environment.services.stopLoop()}</loopCondition>
            </standardLoopCharacteristics>
          </task>
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);

      definition = Definition(context, {
        services: {
          stopLoop(startMessage) {
            iterations.push(startMessage);
            if (startMessage.content.index === 3) return true;
          }
        }
      });
    });

    let leave;
    When('definition is run', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('definition completes when condition is met', () => {
      return leave;
    });

    And('task was looped expected number of times', () => {
      expect(iterations).to.have.length(4);
    });
  });

  Scenario('Standard loop characteristics with cardinality', () => {
    let definition;
    const iterations = [];
    Given('a process with one standard loop task with condition and loop maximum', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="TaskLoopProcess" isExecutable="true">
          <task id="task">
            <standardLoopCharacteristics loopMaximum="4">
              <loopCondition xsi:type="bpmn:tFormalExpression">\${environment.services.stopLoop()}</loopCondition>
            </standardLoopCharacteristics>
          </task>
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);

      definition = Definition(context, {
        services: {
          stopLoop(startMessage) {
            iterations.push(startMessage);
            if (startMessage.content.index === 5) return true;
          }
        }
      });
    });

    let leave;
    When('definition is run', () => {
      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('definition completes when condition is met', () => {
      return leave;
    });

    And('task was looped expected number of times', () => {
      expect(iterations).to.have.length(4);
    });
  });

  Scenario('ScriptTask with parallel loop characteristics over collection', () => {
    let context, definition;
    Given('a process with one collection looped script task', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="TaskLoopProcess" isExecutable="true">
          <scriptTask id="task" scriptFormat="javascript" js:result="iterated">
            <multiInstanceLoopCharacteristics isSequential="false" js:collection="\${environment.variables.list}" />
            <script><![CDATA[
              next(null, content.item.idx);
            ]]></script>
          </scriptTask>
        </process>
      </definitions>`;
      context = await testHelpers.context(source, {
        extensions: {js},
      });
    });

    let leave;
    When('definition is run with 500 items', () => {
      definition = Definition(context, {
        settings: {
          batchSize: 100,
        },
        variables: {
          list: new Array(500).fill().map((_, idx) => ({idx}))
        },
      });

      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('definition completes', () => {
      return leave;
    }).timeout(10000);

    And('task was looped expected number of times', () => {
      expect(definition.environment.output.iterated).to.have.length(500);
    });

    When('definition is run with 0 items', () => {
      definition = Definition(context, {
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

  Scenario('ScriptTask with parallel loop characteristics over collection with cardinality', () => {
    let context, definition;
    Given('a process with one collection looped script task', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="TaskLoopProcess" isExecutable="true">
          <scriptTask id="task" scriptFormat="javascript" js:result="iterated">
            <multiInstanceLoopCharacteristics isSequential="false" js:collection="\${environment.variables.list}">
              <loopCardinality xsi:type="tFormalExpression">\${environment.variables.cardinality}</loopCardinality>
            </multiInstanceLoopCharacteristics>
            <script><![CDATA[
              next(null, content.item.idx);
            ]]></script>
          </scriptTask>
        </process>
      </definitions>`;
      context = await testHelpers.context(source, {
        extensions: {js},
      });
    });

    let leave;
    const cardinality = 11;
    When('definition is run with collection and cardinality', () => {
      definition = Definition(context, {
        settings: {
          batchSize: 10,
        },
        variables: {
          cardinality,
          list: new Array(50).fill().map((_, idx) => ({idx}))
        },
      });

      leave = definition.waitFor('leave');
      definition.run();
    });

    Then('definition completes when cardinality is met', () => {
      return leave;
    });

    And('task was looped expected number of times', () => {
      expect(definition.environment.output.iterated).to.have.length(cardinality);
    });
  });

  Scenario('Sequential loop characteristics errors', () => {
    let context, definition;
    Given('a process with one loop task with condition and loop maximum', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="TaskLoopProcess" isExecutable="true">
          <scriptTask id="task" scriptFormat="javascript" js:result="iterated">
            <multiInstanceLoopCharacteristics isSequential="true">
              <loopCardinality xsi:type="tFormalExpression">\${environment.variables.cardinality}</loopCardinality>
            </multiInstanceLoopCharacteristics>
            <script><![CDATA[
              next(null, content.item.idx);
            ]]></script>
          </scriptTask>
        </process>
      </definitions>`;
      context = await testHelpers.context(source, {
        extensions: {js},
      });
    });

    let execError;
    When('definition is run with cardinality that is not a number', () => {
      definition = Definition(context, {
        settings: {
          batchSize: 100,
        },
        variables: {
          cardinality: 'apapap',
        }
      });

      execError = definition.waitFor('error');
      definition.run();
    });

    Then('definition breaks', async () => {
      const {content} = await execError;
      expect(content.error.message).to.equal('<task> invalid loop cardinality >NaN<');
    });
  });

  Scenario('Parallel loop characteristics errors', () => {
    let context, definition;
    Given('a process with one loop task with condition and loop maximum', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="TaskLoopProcess" isExecutable="true">
          <scriptTask id="task" scriptFormat="javascript" js:result="iterated">
            <multiInstanceLoopCharacteristics isSequential="false">
              <loopCardinality xsi:type="tFormalExpression">\${environment.variables.cardinality}</loopCardinality>
            </multiInstanceLoopCharacteristics>
            <script><![CDATA[
              next(null, content.index);
            ]]></script>
          </scriptTask>
        </process>
      </definitions>`;
      context = await testHelpers.context(source, {
        extensions: {js},
      });
    });

    let execError;
    When('definition is run with string cardinality', () => {
      definition = Definition(context, {
        variables: {
          cardinality: 'apapap',
        }
      });

      execError = definition.waitFor('error');
      definition.run();
    });

    Then('definition breaks', async () => {
      const {content} = await execError;
      expect(content.error.message).to.equal('<task> invalid loop cardinality >NaN<');
    });

    When('definition is run with negative cardinality', () => {
      definition = Definition(context, {
        variables: {
          cardinality: -1,
        }
      });

      execError = definition.waitFor('error');
      definition.run();
    });

    Then('definition breaks', async () => {
      const {content} = await execError;
      expect(content.error.message).to.equal('<task> invalid loop cardinality >-1<');
    });

    When('definition is run without cardinality', () => {
      definition = Definition(context, {
        variables: {
          cardinality: undefined,
        }
      });

      execError = definition.waitFor('error');
      definition.run();
    });

    Then('definition breaks', async () => {
      const {content} = await execError;
      expect(content.error.message).to.equal('<task> cardinality or collection is required in parallel loops');
    });

    let runEnd;
    When('definition is run with boolean false (0) cardinality', () => {
      definition = Definition(context, {
        variables: {
          cardinality: false,
        }
      });

      runEnd = definition.waitFor('end');
      definition.run();
    });

    Then('definition runs through', () => {
      return runEnd;
    });

    When('definition is run with boolean true (1) cardinality', () => {
      definition = Definition(context, {
        variables: {
          cardinality: false,
        }
      });

      runEnd = definition.waitFor('end');
      definition.run();
    });

    Then('definition runs through', () => {
      return runEnd;
    });

    Given('a process with parallel loop with empty cardinality', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="TaskLoopProcess" isExecutable="true">
          <scriptTask id="task" scriptFormat="javascript" js:result="iterated">
            <multiInstanceLoopCharacteristics isSequential="false">
              <loopCardinality xsi:type="tFormalExpression"></loopCardinality>
              <completionCondition xsi:type="tFormalExpression">\${content.item.stop}</completionCondition>
            </multiInstanceLoopCharacteristics>
            <script><![CDATA[
              next(null, content.item.idx);
            ]]></script>
          </scriptTask>
        </process>
      </definitions>`;
      context = await testHelpers.context(source, {
        extensions: {js},
      });
    });

    When('definition is run', () => {
      definition = Definition(context, {
        variables: {
          cardinality: 'apapap',
        }
      });

      execError = definition.waitFor('error');
      definition.run();
    });

    Then('definition breaks', async () => {
      const {content} = await execError;
      expect(content.error.message).to.equal('<task> cardinality or collection is required in parallel loops');
    });

    Given('a process with parallel loop stop condition only', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="TaskLoopProcess" isExecutable="true">
          <scriptTask id="task" scriptFormat="javascript" js:result="iterated">
            <multiInstanceLoopCharacteristics isSequential="false">
              <completionCondition xsi:type="tFormalExpression">\${content.item.stop}</completionCondition>
            </multiInstanceLoopCharacteristics>
            <script><![CDATA[
              next(null, content.item.idx);
            ]]></script>
          </scriptTask>
        </process>
      </definitions>`;
      context = await testHelpers.context(source, {
        extensions: {js},
      });
    });

    When('definition is run', () => {
      definition = Definition(context, {
        variables: {
          cardinality: 'apapap',
        }
      });

      execError = definition.waitFor('error');
      definition.run();
    });

    Then('definition breaks since cardinality is required', async () => {
      const {content} = await execError;
      expect(content.error.message).to.equal('<task> cardinality or collection is required in parallel loops');
    });

    Given('a process with parallel loop over collection', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="TaskLoopProcess" isExecutable="true">
          <scriptTask id="task" scriptFormat="javascript" js:result="iterated">
            <multiInstanceLoopCharacteristics isSequential="false" js:collection="\${environment.variables.list}">
              <loopCardinality xsi:type="tFormalExpression">199</loopCardinality>
            </multiInstanceLoopCharacteristics>
            <script><![CDATA[
              next(null, content.item.idx);
            ]]></script>
          </scriptTask>
        </process>
      </definitions>`;
      context = await testHelpers.context(source, {
        extensions: {js},
      });
    });

    When('definition is run with collection that throws', () => {
      definition = Definition(context, {
        variables: {
          list: {
            get length() {
              throw new Error('cannot');
            }
          },
        }
      });

      execError = definition.waitFor('error');
      definition.run();
    });

    Then('definition breaks since collection item cannot be read', async () => {
      const {content} = await execError;
      expect(content.error.message).to.equal('cannot');
    });
  });
});
