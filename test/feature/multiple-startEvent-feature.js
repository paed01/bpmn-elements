import Definition from '../../src/definition/Definition.js';
import testHelpers from '../helpers/testHelpers.js';

Feature('Multiple start events', () => {
  Scenario('Two start events waiting to be signaled ending up in a task', () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>
    <definitions id="command-definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
      <process id="multiple-start-process" isExecutable="true">
        <startEvent id="start1">
          <signalEventDefinition />
        </startEvent>
        <startEvent id="start2">
          <signalEventDefinition signalRef="Message_1" />
        </startEvent>
        <sequenceFlow id="from-start1" sourceRef="start1" targetRef="task" />
        <sequenceFlow id="from-start2" sourceRef="start2" targetRef="task" />
        <task id="task" />
        <sequenceFlow id="to-decision" sourceRef="task" targetRef="decision" />
        <exclusiveGateway id="decision" default="to-end" />
        <sequenceFlow id="to-named-end" sourceRef="decision" targetRef="named-end">
          <conditionExpression xsi:type="tFormalExpression" language="javascript">next(null, environment.output.start2)</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="to-end" sourceRef="decision" targetRef="end" />
        <endEvent id="named-end" name="Named completed" />
        <endEvent id="end" name="Anonymous completed" />
      </process>
      <signal id="Message_1" name="start2" />
    </definitions>`;

    let definition;
    Given('a process with multiple start events, a joining task and an end event', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        extensions: {
          output(element) {
            if (element.type !== 'bpmn:Process') return;

            const {broker, environment} = element;
            broker.subscribeTmp('event', 'activity.end', (_, {content}) => {
              environment.output[content.id] = 1;
            }, {noAck: true});
          },
        },
      });
    });

    When('process is ran', () => {
      definition.run();
    });

    And('first start event is signaled', () => {
      definition.signal();
    });

    Then('first end event is taken', () => {
      const endEvent = definition.getActivityById('end');
      expect(endEvent.counters).to.deep.equal({taken: 1, discarded: 1});
    });

    And('second end event is discarded', () => {
      const endEvent = definition.getActivityById('named-end');
      expect(endEvent.counters).to.deep.equal({taken: 0, discarded: 2});
    });

    And('process is completed', () => {
      expect(definition.counters).to.deep.equal({
        completed: 1,
        discarded: 0,
      });
    });

    When('process is ran again', () => {
      definition.run();
    });

    And('second start event is signaled', () => {
      definition.signal({id: 'Message_1'});
    });

    Then('second end event is taken', () => {
      const endEvent = definition.getActivityById('named-end');
      expect(endEvent.counters).to.deep.equal({taken: 1, discarded: 3});
    });

    And('first end event is discarded', () => {
      const endEvent = definition.getActivityById('end');
      expect(endEvent.counters).to.deep.equal({taken: 1, discarded: 3});
    });

    And('process is completed', () => {
      expect(definition.counters).to.deep.equal({
        completed: 2,
        discarded: 0,
      });
    });
  });

  Scenario('Two start events waiting to be signaled ending up in a parallel join', () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>
    <definitions id="command-definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
      <process id="multiple-start-process" isExecutable="true">
        <startEvent id="start1">
          <signalEventDefinition />
        </startEvent>
        <startEvent id="start2">
          <signalEventDefinition signalRef="Message_1" />
        </startEvent>
        <sequenceFlow id="from-start1" sourceRef="start1" targetRef="join" />
        <sequenceFlow id="from-start2" sourceRef="start2" targetRef="join" />
        <parallelGateway id="join" />
        <sequenceFlow id="to-decision" sourceRef="join" targetRef="decision" />
        <exclusiveGateway id="decision" default="to-end" />
        <sequenceFlow id="to-named-end" sourceRef="decision" targetRef="named-end">
          <conditionExpression xsi:type="tFormalExpression" language="javascript">next(null, environment.output.start2)</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="to-end" sourceRef="decision" targetRef="end" />
        <endEvent id="named-end" name="Named completed" />
        <endEvent id="end" name="Anonymous completed" />
      </process>
      <signal id="Message_1" name="start2" />
    </definitions>`;

    let definition;
    Given('a process with multiple start events, a joining task and an end event', async () => {
      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        extensions: {
          output(element) {
            if (element.type !== 'bpmn:Process') return;

            const {broker, environment} = element;
            broker.subscribeTmp('event', 'activity.end', (_, {content}) => {
              environment.output[content.id] = 1;
            }, {noAck: true});
          },
        },
      });
    });

    When('process is ran', () => {
      definition.run();
    });

    And('first start event is signaled', () => {
      definition.signal();
    });

    Then('parallel join is pending', () => {
      const join = definition.getActivityById('join');
      expect(join.counters).to.deep.equal({taken: 0, discarded: 0});
    });

    When('second start event is signaled', () => {
      definition.signal({id: 'Message_1'});
    });

    Then('process is completed', () => {
      expect(definition.counters).to.deep.equal({
        completed: 1,
        discarded: 0,
      });
    });

    Then('first end event is discarded', () => {
      const endEvent = definition.getActivityById('end');
      expect(endEvent.counters).to.deep.equal({taken: 0, discarded: 1});
    });

    And('second end event is taken', () => {
      const endEvent = definition.getActivityById('named-end');
      expect(endEvent.counters).to.deep.equal({taken: 1, discarded: 0});
    });

    When('process is ran again', () => {
      definition.run();
    });

    And('start events are signaled', () => {
      definition.signal();
      definition.signal({id: 'Message_1'});
    });

    Then('first end event is discarded', () => {
      const endEvent = definition.getActivityById('end');
      expect(endEvent.counters).to.deep.equal({taken: 0, discarded: 2});
    });

    And('second end event is taken', () => {
      const endEvent = definition.getActivityById('named-end');
      expect(endEvent.counters).to.deep.equal({taken: 2, discarded: 0});
    });

    And('process is completed', () => {
      expect(definition.counters).to.deep.equal({
        completed: 2,
        discarded: 0,
      });
    });
  });
});
