import Definition from '../../src/definition/Definition';
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
});
