import { Definition } from 'bpmn-elements';
import testHelpers from '../helpers/testHelpers.js';
import factory from '../helpers/factory.js';

Feature('Multiple start events', () => {
  [false, true].forEach((skipDiscard) => {
    describe(`run ${skipDiscard ? 'with' : 'without'} skipDiscard setting`, () => {
      Scenario('Two start events waiting to be signaled ending up in a task', () => {
        const source = factory.resource('multiple-signal-startevents.bpmn');

        let definition;
        Given('a process with multiple start events, a joining task and an end event', async () => {
          const context = await testHelpers.context(source);
          definition = new Definition(context, {
            settings: {
              skipDiscard,
            },
            extensions: {
              output(element) {
                if (element.type !== 'bpmn:Process') return;

                const { broker, environment } = element;
                broker.subscribeTmp(
                  'event',
                  'activity.end',
                  (_, { content }) => {
                    environment.output[content.id] = 1;
                  },
                  { noAck: true }
                );
              },
            },
          });
        });

        let leave;
        When('process is ran', () => {
          leave = definition.waitFor('leave');
          definition.run();
        });

        And('first start event is signaled', () => {
          definition.signal();
        });

        Then('first end event is taken', () => {
          const endEvent = definition.getActivityById('end');
          expect(endEvent.counters).to.deep.equal({ taken: 1, discarded: skipDiscard ? 0 : 1 });
        });

        And('second end event is not taken', () => {
          const endEvent = definition.getActivityById('named-end');
          expect(endEvent.counters).to.deep.equal({ taken: 0, discarded: skipDiscard ? 0 : 2 });
        });

        And('process is completed', async () => {
          await leave;
          expect(definition.counters).to.deep.equal({
            completed: 1,
            discarded: 0,
          });
        });

        When('process is ran again', () => {
          leave = definition.waitFor('leave');
          definition.run();
        });

        And('second start event is signaled', () => {
          const start2 = definition.getPostponed().find(({ id }) => id === 'start2');
          definition.signal(start2.content.signal);
        });

        Then('second end event is taken', () => {
          const endEvent = definition.getActivityById('named-end');
          expect(endEvent.counters).to.deep.equal({ taken: 1, discarded: skipDiscard ? 0 : 3 });
        });

        And('first end event is discarded', () => {
          const endEvent = definition.getActivityById('end');
          expect(endEvent.counters).to.deep.equal({ taken: 1, discarded: skipDiscard ? 0 : 3 });
        });

        And('process is completed', async () => {
          await leave;

          const pending = definition.getPostponed().map(({ id }) => id);

          expect(definition.counters, `pending <${pending}>`).to.deep.equal({
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
            environment: {
              settings: {
                skipDiscard,
              },
            },
            extensions: {
              output(element) {
                if (element.type !== 'bpmn:Process') return;

                const { broker, environment } = element;
                broker.subscribeTmp(
                  'event',
                  'activity.end',
                  (_, { content }) => {
                    environment.output[content.id] = 1;
                  },
                  { noAck: true }
                );
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
          expect(join.counters).to.deep.equal({ taken: 0, discarded: 0 });
        });

        When('second start event is signaled', () => {
          definition.signal({ id: 'Message_1' });
        });

        Then('process is completed', () => {
          expect(definition.counters).to.deep.equal({
            completed: 1,
            discarded: 0,
          });
        });

        Then('first end event is not taken', () => {
          const endEvent = definition.getActivityById('end');
          expect(endEvent.counters).to.deep.equal({ taken: 0, discarded: 0 });
        });

        And('second end event is taken', () => {
          const endEvent = definition.getActivityById('named-end');
          expect(endEvent.counters).to.deep.equal({ taken: 1, discarded: 0 });
        });

        When('process is ran again', () => {
          definition.run();
        });

        And('start events are signaled', () => {
          definition.signal();
          definition.signal({ id: 'Message_1' });
        });

        Then('first end event is not taken', () => {
          const endEvent = definition.getActivityById('end');
          expect(endEvent.counters).to.deep.equal({ taken: 0, discarded: 0 });
        });

        And('second end event is taken', () => {
          const endEvent = definition.getActivityById('named-end');
          expect(endEvent.counters).to.deep.equal({ taken: 2, discarded: 0 });
        });

        And('process is completed', () => {
          expect(definition.counters).to.deep.equal({
            completed: 2,
            discarded: 0,
          });
        });
      });

      Scenario('Two start events joined by a task followed by a parallel fork', () => {
        const source = `<?xml version="1.0" encoding="UTF-8"?>
        <definitions id="command-definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
          <process id="multiple-start-process" isExecutable="true">
            <startEvent id="start1">
              <signalEventDefinition />
            </startEvent>
            <startEvent id="start2">
              <signalEventDefinition signalRef="Signal2" />
            </startEvent>
            <sequenceFlow id="from-start1" sourceRef="start1" targetRef="task" />
            <sequenceFlow id="from-start2" sourceRef="start2" targetRef="task" />
            <task id="task" />
            <sequenceFlow id="from-task" sourceRef="task" targetRef="fork" />
            <parallelGateway id="fork" />
            <sequenceFlow id="to-end1" sourceRef="fork" targetRef="end1" />
            <sequenceFlow id="to-end2" sourceRef="fork" targetRef="end2" />
            <endEvent id="end1" />
            <endEvent id="end2" />
          </process>
          <signal id="Signal2" name="start2" />
        </definitions>`;

        let context;
        /** @type {Definition} */
        let definition;
        Given('a process with multiple signal start events, a joining task and a subsequent fork', async () => {
          context = await testHelpers.context(source);
          definition = new Definition(context, {
            settings: { skipDiscard },
          });
        });

        And('the subsequent fork is a parallel gateway but not a parallel join', () => {
          const fork = definition.getActivityById('fork');
          expect(fork.isParallelGateway, 'isParallelGateway').to.be.true;
          expect(fork.isParallelJoin, 'isParallelJoin').to.be.false;
          expect(fork.inbound).to.have.length(1);
          expect(fork.outbound).to.have.length(2);
        });

        let leave;
        When('process is ran', () => {
          leave = definition.waitFor('leave');
          definition.run();
        });

        And('both start events are signaled', () => {
          definition.signal();
          definition.signal({ id: 'Signal2' });
        });

        Then('process is completed', async () => {
          await leave;
          expect(definition.counters).to.deep.equal({
            completed: 1,
            discarded: 0,
          });
        });

        And('joining task was taken twice', () => {
          const task = definition.getActivityById('task');
          expect(task.counters).to.deep.equal({ taken: 2, discarded: 0 });
        });

        And('fork was aggregated to a single firing via peer monitoring', () => {
          const fork = definition.getActivityById('fork');
          expect(fork.counters).to.deep.equal({ taken: 1, discarded: 0 });
        });

        And('both end events were taken once', () => {
          expect(definition.getActivityById('end1').counters).to.deep.equal({ taken: 1, discarded: 0 });
          expect(definition.getActivityById('end2').counters).to.deep.equal({ taken: 1, discarded: 0 });
        });

        When('process is ran again', () => {
          leave = definition.waitFor('leave');
          definition.run();
        });

        And('both start events are signaled in the reverse order', () => {
          definition.signal({ id: 'Signal2' });
          definition.signal();
        });

        Then('process is completed', async () => {
          await leave;
          expect(definition.counters).to.deep.equal({
            completed: 2,
            discarded: 0,
          });
        });

        And('fork was aggregated to a single firing per run', () => {
          const fork = definition.getActivityById('fork');
          expect(fork.counters).to.deep.equal({ taken: 2, discarded: 0 });
        });
      });
    });
  });
});
