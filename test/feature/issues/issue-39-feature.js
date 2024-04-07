import { Definition, SequenceFlow } from '../../../src/index.js';
import testHelpers from '../../helpers/testHelpers.js';

const source = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions id="Definitions_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="mainProcess" isExecutable="true">
    <startEvent id="start" />
    <sequenceFlow id="to-decisions" sourceRef="start" targetRef="decisions" />
    <exclusiveGateway id="decisions" default="to-defaultend" />
    <sequenceFlow id="to-defaultend" sourceRef="decisions" targetRef="defaultend" />
    <sequenceFlow id="to-theotherone" sourceRef="decisions" targetRef="theotherone">
      <conditionExpression xsi:type="tFormalExpression">\${environment.services.discard()}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="to-takenend" sourceRef="decisions" targetRef="takenend">
      <conditionExpression xsi:type="tFormalExpression">\${environment.services.take()}</conditionExpression>
    </sequenceFlow>
    <endEvent id="defaultend" />
    <endEvent id="theotherone" />
    <endEvent id="takenend" />
  </process>
</definitions>`;

Feature('Issue 39 - resolve SequenceFlow expression promise', () => {
  Scenario('expression function returns promise', () => {
    let context, definition, end;
    When('definition is ran with exclusive gataway with three flows and expression services that returns promise', async () => {
      context = await testHelpers.context(source, {
        types: {
          SequenceFlow: FlorianSequenceFlow,
        },
      });
      definition = new Definition(context, {
        services: {
          take() {
            return Promise.resolve(true);
          },
          discard() {
            return Promise.resolve(false);
          },
        },
      });
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('promise resolved and took correct end event', () => {
      expect(definition.getActivityById('takenend').counters).to.deep.equal({ taken: 1, discarded: 0 });
    });

    And('discarded default and the other one', () => {
      expect(definition.getActivityById('defaultend').counters, 'default').to.deep.equal({ taken: 0, discarded: 1 });
      expect(definition.getActivityById('theotherone').counters, 'the other one').to.deep.equal({ taken: 0, discarded: 1 });
    });
  });
});

class FlorianSequenceFlow extends SequenceFlow {
  getCondition() {
    const condition = super.getCondition();
    if (condition?.type !== 'expression') return condition;

    const execute = condition.execute;
    condition.execute = asyncExecute.bind(condition);

    return condition;

    function asyncExecute(message, callback) {
      execute.call(condition, message, (executeErr, result) => {
        if (executeErr) return callback(executeErr);
        return Promise.resolve(result)
          .then((r) => (callback ? callback(null, r) : result))
          .catch((err) => (callback ? callback(err) : err));
      });
    }
  }
}
