import { Definition } from 'bpmn-elements';
import testHelpers from '../helpers/testHelpers.js';

Feature('Shaking', () => {
  Scenario('a process with two start events', () => {
    let definition;
    Given('two start events, both waiting for a message and both ending with the same end event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="messageProcess" isExecutable="true">
          <startEvent id="start1">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <startEvent id="start2">
            <messageEventDefinition messageRef="Message2" />
          </startEvent>
          <sequenceFlow id="from12end" sourceRef="start1" targetRef="end" />
          <sequenceFlow id="from22end" sourceRef="start2" targetRef="end" />
          <endEvent id="end" />
        </process>
        <message id="Message1" name="Start by name" />
        <message id="Message2" name="Start by me" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    const messages = [];
    When('definition is ran', () => {
      definition.broker.subscribeTmp(
        'event',
        '*.shake.*',
        (routingKey) => {
          messages.push(routingKey);
        },
        { noAck: true }
      );

      definition.run();
    });

    // Multiple start events no longer trigger a graph shake on run; they are torn down on
    // completion directly. The shake remains available on demand.
    Then('the start events are not shaken on run', () => {
      expect(messages, messages.join()).to.have.length(0);
    });

    let start1, start2;
    And('both start events are waiting for message', () => {
      [start1, start2] = definition.getPostponed();
      expect(start1).to.have.property('id', 'start1');
      expect(start2).to.have.property('id', 'start2');
    });

    let result;
    When('definition is shaken on demand', () => {
      result = definition.shake();
    });

    Then('execution sequence is presented for each start event', () => {
      const sequence1 = result.start1[0].sequence;
      expect(sequence1[0]).to.have.property('id', 'start1');
      expect(sequence1[1]).to.have.property('id', 'from12end');
      expect(sequence1[2]).to.have.property('id', 'end');
      expect(sequence1).to.have.length(3);

      const sequence2 = result.start2[0].sequence;
      expect(sequence2[0]).to.have.property('id', 'start2');
      expect(sequence2[1]).to.have.property('id', 'from22end');
      expect(sequence2[2]).to.have.property('id', 'end');
      expect(sequence2).to.have.length(3);
    });
  });

  Scenario('a process with a loopback flow', () => {
    let definition;
    Given('two start events, the second contains a looped flow', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="messageProcess" isExecutable="true">
          <startEvent id="start1">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <sequenceFlow id="from12end" sourceRef="start1" targetRef="end" />
          <startEvent id="start2">
            <messageEventDefinition messageRef="Message2" />
          </startEvent>
          <sequenceFlow id="from22Task" sourceRef="start2" targetRef="task" />
          <task id="task" />
          <sequenceFlow id="fromTask2Gateway" sourceRef="task" targetRef="gateway" />
          <exclusiveGateway id="gateway" default="defaultFlow" />
          <sequenceFlow id="defaultFlow" sourceRef="gateway" targetRef="end" />
          <sequenceFlow id="back2Task" sourceRef="gateway" targetRef="task">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition}</conditionExpression>
          </sequenceFlow>
          <endEvent id="end" />
        </process>
        <message id="Message1" name="Start by name" />
        <message id="Message2" name="Start by me" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    const messages = [];
    When('definition is ran', () => {
      definition.broker.subscribeTmp(
        'event',
        '*.shake.*',
        (routingKey) => {
          messages.push(routingKey);
        },
        { noAck: true }
      );

      definition.run();
    });

    Then('the start events are not shaken on run', () => {
      expect(messages, messages.join()).to.have.length(0);
    });

    let result;
    When('definition is shaken on demand', () => {
      result = definition.shake();
    });

    Then('execution sequence is presented for the first start event', () => {
      const sequence = result.start1[0].sequence;
      expect(sequence[0]).to.have.property('id', 'start1');
      expect(sequence[1]).to.have.property('id', 'from12end');
      expect(sequence[2]).to.have.property('id', 'end');
      expect(sequence).to.have.length(3);
    });

    And('execution sequence is presented for the second start event', () => {
      expect(result.start2[0]).to.have.property('isLooped', false);
      const sequence = result.start2[0].sequence;
      expect(sequence[0]).to.have.property('id', 'start2');
      expect(sequence[1]).to.have.property('id', 'from22Task');
      expect(sequence[2]).to.have.property('id', 'task');
      expect(sequence[3]).to.have.property('id', 'fromTask2Gateway');
      expect(sequence[4]).to.have.property('id', 'gateway');
      expect(sequence[5]).to.have.property('id', 'defaultFlow');
      expect(sequence[6]).to.have.property('id', 'end');
      expect(sequence).to.have.length(7);
    });

    And('second start event loop sequence is presented', () => {
      expect(result.start2[1]).to.have.property('isLooped', true);
      const sequence = result.start2[1].sequence;

      expect(sequence).to.have.length(7);
      expect(sequence[0]).to.have.property('id', 'start2');
      expect(sequence[1]).to.have.property('id', 'from22Task');
      expect(sequence[2]).to.have.property('id', 'task');
      expect(sequence[3]).to.have.property('id', 'fromTask2Gateway');
      expect(sequence[4]).to.have.property('id', 'gateway');
      expect(sequence[5]).to.have.property('id', 'back2Task');
      expect(sequence[6]).to.have.property('id', 'task');
    });

    let start1, start2;
    And('both start events are waiting for message', () => {
      [start1, start2] = definition.getPostponed();
      expect(start1).to.have.property('id', 'start1');
      expect(start2).to.have.property('id', 'start2');
    });
  });

  Scenario('manual shaking', () => {
    let context;
    Given('two start events, the second contains a looped flow, a user task', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="messageProcess" isExecutable="true">
          <startEvent id="start1">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <sequenceFlow id="from12end" sourceRef="start1" targetRef="end" />
          <startEvent id="start2">
            <messageEventDefinition messageRef="Message2" />
          </startEvent>
          <sequenceFlow id="from22Task" sourceRef="start2" targetRef="task" />
          <userTask id="task" />
          <sequenceFlow id="fromTask2Gateway" sourceRef="task" targetRef="gateway" />
          <exclusiveGateway id="gateway" default="defaultFlow" />
          <sequenceFlow id="defaultFlow" sourceRef="gateway" targetRef="end" />
          <sequenceFlow id="back2Task" sourceRef="gateway" targetRef="task">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition}</conditionExpression>
          </sequenceFlow>
          <endEvent id="end" />
        </process>
        <message id="Message1" name="Start by name" />
        <message id="Message2" name="Start by me" />
      </definitions>`;

      context = await testHelpers.context(source);
    });

    let result;
    [true, false].forEach((run) => {
      describe(run ? 'running definition' : 'definition is not running', () => {
        let definition;
        Given('definition is initiated', () => {
          definition = new Definition(context.clone());
        });

        if (run) {
          And('definition is running', () => {
            definition.run();
            definition.signal({ id: 'Message2' });
          });
        }

        const messages = [];
        And('shake messages are collected', () => {
          definition.broker.subscribeTmp(
            'event',
            '*.shake#',
            (routingKey) => {
              messages.push(routingKey);
            },
            { noAck: true }
          );
        });

        When('definition shakes first start event', () => {
          messages.splice(0);
          result = definition.shake('start1');
        });

        Then('execution sequences are returned', () => {
          expect(result).to.have.property('start1');
          expect(result.start1).that.is.an('array').with.length(1);
          const sequence = result.start1[0];
          expect(sequence.sequence[0]).to.have.property('id', 'start1');
          expect(sequence.sequence[1]).to.have.property('id', 'from12end');
          expect(sequence.sequence[2]).to.have.property('id', 'end');
          expect(sequence.sequence).to.have.length(3);

          expect(Object.keys(result)).to.deep.equal(['start1']);
        });

        And('event messsages are forwarded from event activity', () => {
          expect(messages).to.have.length(2);
        });

        When('definition shakes all', () => {
          messages.splice(0);
          result = definition.shake();
        });

        Then('the second start event two run sequences', () => {
          expect(result).to.have.property('start2');
          expect(result.start2).that.is.an('array').with.length(2);
        });

        And('first sequence runs to end event', () => {
          const sequence = result.start2[0];
          expect(sequence).to.have.property('isLooped', false);
          expect(sequence.sequence[0]).to.have.property('id', 'start2');
          expect(sequence.sequence[1]).to.have.property('id', 'from22Task');
          expect(sequence.sequence[2]).to.have.property('id', 'task');
          expect(sequence.sequence[3]).to.have.property('id', 'fromTask2Gateway');
          expect(sequence.sequence[4]).to.have.property('id', 'gateway');
          expect(sequence.sequence[5]).to.have.property('id', 'defaultFlow');
          expect(sequence.sequence[6]).to.have.property('id', 'end');
          expect(sequence.sequence).to.have.length(7);
        });

        And('second sequence is looped', () => {
          const sequence = result.start2[1];
          expect(sequence).to.have.property('isLooped', true);
          expect(sequence.sequence[0]).to.have.property('id', 'start2');
          expect(sequence.sequence[1]).to.have.property('id', 'from22Task');
          expect(sequence.sequence[2]).to.have.property('id', 'task');
          expect(sequence.sequence[3]).to.have.property('id', 'fromTask2Gateway');
          expect(sequence.sequence[4]).to.have.property('id', 'gateway');
          expect(sequence.sequence[5]).to.have.property('id', 'back2Task');
          expect(sequence.sequence[6]).to.have.property('id', 'task');
          expect(sequence.sequence).to.have.length(7);
        });

        And('event messsages are forwarded from event activity', () => {
          expect(messages).to.include('activity.shake.end');
        });

        When('an activity with inbound flows is shaken', () => {
          messages.splice(0);
          result = definition.shake('gateway');
        });

        Then('the activity has the expected run sequences', () => {
          expect(result).to.have.property('gateway');
          expect(result.gateway).that.is.an('array');

          let sequence = result.gateway[0];
          expect(sequence).to.have.property('isLooped', false);
          expect(sequence.sequence[0]).to.have.property('id', 'gateway');
          expect(sequence.sequence[1]).to.have.property('id', 'defaultFlow');
          expect(sequence.sequence[2]).to.have.property('id', 'end');
          expect(sequence.sequence).to.have.length(3);

          sequence = result.gateway[1];

          expect(sequence.sequence[0]).to.have.property('id', 'gateway');
          expect(sequence.sequence[1]).to.have.property('id', 'back2Task');
          expect(sequence.sequence[2]).to.have.property('id', 'task');
          expect(sequence.sequence[3]).to.have.property('id', 'fromTask2Gateway');
          expect(sequence.sequence).to.have.length(4);
          expect(sequence).to.have.property('isLooped', true);

          expect(result.gateway).to.have.length(2);
        });

        When('an unknown activity is shaken', () => {
          messages.splice(0);
          result = definition.shake('hittepa');
        });

        Then('no run sequence is returned', () => {
          expect(result).to.be.undefined;
        });

        When('an a message element is shaken', () => {
          messages.splice(0);
          result = definition.shake('Message1');
        });

        Then('no run sequence is returned', () => {
          expect(result).to.be.undefined;
        });

        if (run) {
          let end;
          When('user task is signaled', () => {
            end = definition.waitFor('end');
            definition.signal({ id: 'task' });
          });

          Then('run completes', () => {
            return end;
          });
        }
      });
    });

    describe('stopped and resumed', () => {
      let definition;
      Given('definition is running', () => {
        definition = new Definition(context.clone());
        definition.run();
        definition.once('wait', () => {
          definition.stop();
        });
        definition.signal({ id: 'Message2' });
      });

      And('is stopped on user task wait', () => {
        expect(definition).to.have.property('stopped', true);
      });

      When('definition shakes user task', () => {
        result = definition.shake('task');
      });

      Then('execution sequences are returned', () => {
        expect(result).to.have.property('task');
        expect(result.task).that.is.an('array').with.length(2);
        let sequence = result.task[0];
        expect(sequence.sequence[0]).to.have.property('id', 'task');
        expect(sequence.sequence[1]).to.have.property('id', 'fromTask2Gateway');
        expect(sequence.sequence[2]).to.have.property('id', 'gateway');
        expect(sequence.sequence[3]).to.have.property('id', 'defaultFlow');
        expect(sequence.sequence[4]).to.have.property('id', 'end');
        expect(sequence.sequence).to.have.length(5);

        sequence = result.task[1];
        expect(sequence).to.have.property('isLooped', true);
        expect(sequence.sequence[0]).to.have.property('id', 'task');
        expect(sequence.sequence[1]).to.have.property('id', 'fromTask2Gateway');
        expect(sequence.sequence[2]).to.have.property('id', 'gateway');
        expect(sequence.sequence[3]).to.have.property('id', 'back2Task');
        expect(sequence.sequence).to.have.length(4);

        expect(Object.keys(result)).to.deep.equal(['task']);
      });

      When('definition is resumed', () => {
        definition.resume();
        expect(definition).to.have.property('stopped', false);
        expect(definition).to.have.property('isRunning', true);
      });

      And('definition shakes user task', () => {
        result = definition.shake('task');
      });

      Then('execution sequences are returned', () => {
        expect(result).to.have.property('task');
        expect(result.task).that.is.an('array').with.length(2);
        let sequence = result.task[0];
        expect(sequence.sequence[0]).to.have.property('id', 'task');
        expect(sequence.sequence[1]).to.have.property('id', 'fromTask2Gateway');
        expect(sequence.sequence[2]).to.have.property('id', 'gateway');
        expect(sequence.sequence[3]).to.have.property('id', 'defaultFlow');
        expect(sequence.sequence[4]).to.have.property('id', 'end');
        expect(sequence.sequence).to.have.length(5);

        sequence = result.task[1];
        expect(sequence).to.have.property('isLooped', true);
        expect(sequence.sequence[0]).to.have.property('id', 'task');
        expect(sequence.sequence[1]).to.have.property('id', 'fromTask2Gateway');
        expect(sequence.sequence[2]).to.have.property('id', 'gateway');
        expect(sequence.sequence[3]).to.have.property('id', 'back2Task');
        expect(sequence.sequence).to.have.length(4);

        expect(Object.keys(result)).to.deep.equal(['task']);
      });

      let end;
      When('user task is signaled', () => {
        end = definition.waitFor('leave');
        definition.signal({ id: 'task' });
      });

      Then('execution completes', () => {
        return end;
      });
    });

    describe('stopped and recovered', () => {
      let definition, state;
      Given('definition is running', () => {
        definition = new Definition(context.clone());
        definition.run();
        definition.once('wait', () => {
          definition.stop();
        });
        definition.once('stop', () => {
          state = definition.getState();
        });
        definition.signal({ id: 'Message2' });
      });

      And('state is saved on user task wait', () => {
        expect(definition).to.have.property('stopped', true);
      });

      When('definition is recovered', () => {
        definition = new Definition(context.clone());
        definition.recover(state);
        expect(definition).to.have.property('isRunning', false);
        expect(definition).to.have.property('stopped', true);
      });

      And('definition shakes user task', () => {
        result = definition.shake('task');
      });

      Then('execution sequences are returned', () => {
        expect(result).to.have.property('task');
        expect(result.task).that.is.an('array').with.length(2);
        let sequence = result.task[0];
        expect(sequence.sequence[0]).to.have.property('id', 'task');
        expect(sequence.sequence[1]).to.have.property('id', 'fromTask2Gateway');
        expect(sequence.sequence[2]).to.have.property('id', 'gateway');
        expect(sequence.sequence[3]).to.have.property('id', 'defaultFlow');
        expect(sequence.sequence[4]).to.have.property('id', 'end');
        expect(sequence.sequence).to.have.length(5);

        sequence = result.task[1];
        expect(sequence).to.have.property('isLooped', true);
        expect(sequence.sequence[0]).to.have.property('id', 'task');
        expect(sequence.sequence[1]).to.have.property('id', 'fromTask2Gateway');
        expect(sequence.sequence[2]).to.have.property('id', 'gateway');
        expect(sequence.sequence[3]).to.have.property('id', 'back2Task');
        expect(sequence.sequence).to.have.length(4);

        expect(Object.keys(result)).to.deep.equal(['task']);
      });

      let end;
      When('definition is resumed and user task is signaled', () => {
        end = definition.waitFor('leave');
        definition.resume();
        definition.signal({ id: 'task' });
      });

      Then('execution completes', () => {
        return end;
      });
    });
  });

  Scenario('shaking a sub process', () => {
    let context;
    Given('a flow with sub process', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="withSubProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-sub" sourceRef="start" targetRef="sub" />
          <subProcess id="sub">
            <userTask id="task" />
            <sequenceFlow id="to-subend" sourceRef="task" targetRef="subend" />
            <endEvent id="subend" />
          </subProcess>
          <sequenceFlow id="to-end" sourceRef="sub" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
    });

    let result;
    [true, false].forEach((run) => {
      describe(run ? 'running definition' : 'definition is not running', () => {
        let definition;
        Given('definition is initiated', () => {
          definition = new Definition(context.clone());
        });

        if (run) {
          And('definition is running', () => {
            definition.run();
          });
        }

        When('start event is shook', () => {
          result = definition.shake('start');
        });

        Then('execution sequences are returned', () => {
          expect(result).to.have.property('start');
          expect(result.start).that.is.an('array').with.length(1);
          const sequence = result.start[0];
          expect(sequence.sequence[0]).to.have.property('id', 'start');
          expect(sequence.sequence[1]).to.have.property('id', 'to-sub');
          expect(sequence.sequence[2]).to.have.property('id', 'sub');
          expect(sequence.sequence[3]).to.have.property('id', 'to-end');
          expect(sequence.sequence[4]).to.have.property('id', 'end');
          expect(sequence.sequence).to.have.length(5);

          expect(Object.keys(result)).to.deep.equal(['start']);
        });

        And('sub process sequence is included', () => {
          const subProcess = result.start[0].sequence[2];

          expect(subProcess).to.be.an('object').with.property('sequence').that.is.an('object').with.property('task');
          expect(subProcess.sequence.task).to.be.an('array').with.length(1);
          expect(subProcess.sequence.task[0]).to.have.property('sequence').that.is.an('array').with.length(3);
          const sequence = subProcess.sequence.task[0].sequence;
          expect(subProcess.sequence.task[0]).to.have.property('sequence').that.is.an('array').with.length(3);

          expect(sequence[0]).to.have.property('id', 'task');
          expect(sequence[1]).to.have.property('id', 'to-subend');
          expect(sequence[2]).to.have.property('id', 'subend');
        });
      });
    });
  });

  Scenario('shaking a task by api call', () => {
    let context;
    Given('a flow with a task in the middle, a loop back to task gateway, and an end event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="withSubProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-sub" sourceRef="start" targetRef="task" />
          <userTask id="task" />
          <sequenceFlow id="to-gw" sourceRef="task" targetRef="gw" />
          <exclusiveGateway id="gw" default="to-end" />
          <sequenceFlow id="from-gw" sourceRef="gw" targetRef="task" />
          <sequenceFlow id="to-end" sourceRef="gw" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
    });

    describe('definition is running', () => {
      let definition;
      Given('definition is initiated', () => {
        definition = new Definition(context.clone());
      });

      And('definition is running', () => {
        definition.run();
      });

      const messages = [];
      And('shake messages are collected', () => {
        definition.broker.subscribeTmp(
          'event',
          '*.shake#',
          (_, msg) => {
            messages.push(msg);
          },
          { noAck: true }
        );
      });

      When('task is shook by api', () => {
        messages.splice(0);
        const [task] = definition.getPostponed();
        task.sendApiMessage('shake');
      });

      Then('sequences is returned', () => {
        const shakeEndMessage = messages.pop();
        expect(shakeEndMessage.fields).to.have.property('routingKey', 'activity.shake.end');
        expect(shakeEndMessage.content.sequence).to.have.length(5);
        expect(shakeEndMessage.content.sequence[0]).to.have.property('id', 'task');
        expect(shakeEndMessage.content.sequence[1]).to.have.property('id', 'to-gw');
        expect(shakeEndMessage.content.sequence[2]).to.have.property('id', 'gw');
        expect(shakeEndMessage.content.sequence[3]).to.have.property('id', 'to-end');
        expect(shakeEndMessage.content.sequence[4]).to.have.property('id', 'end');
      });
    });
  });

  Scenario('a process with paired link throw and catch', () => {
    let definition;
    Given('a process where a link throw is followed by a link catch leading to the end', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-throw" sourceRef="start" targetRef="throw" />
          <intermediateThrowEvent id="throw">
            <linkEventDefinition name="LINKA" />
          </intermediateThrowEvent>
          <intermediateCatchEvent id="catch">
            <linkEventDefinition name="LINKA" />
          </intermediateCatchEvent>
          <sequenceFlow id="from-catch" sourceRef="catch" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context);
    });

    const linkedMessages = [];
    const shakeEndMessages = [];
    let result;
    When('definition is shaken from start', () => {
      definition.broker.subscribeTmp(
        'event',
        'activity.shake.linked',
        (_, msg) => {
          linkedMessages.push(msg);
        },
        { noAck: true }
      );

      definition.broker.subscribeTmp(
        'event',
        'activity.shake.end',
        (_, msg) => {
          shakeEndMessages.push(msg);
        },
        { noAck: true }
      );

      result = definition.shake('start');
    });

    Then('the catch publishes a linked-shake response with the chain back to the throw', () => {
      expect(linkedMessages).to.have.length(1);
      const ids = linkedMessages[0].content.sequence.map((s) => s.id);
      expect(ids).to.include.members(['throw', 'catch']);
      expect(linkedMessages[0].content).to.have.property('isLinked', true);
      expect(linkedMessages[0].content).to.have.property('targetId', 'catch');
    });

    And('the shake walk continues past the catch and reaches the end event', () => {
      const reachedEnd = shakeEndMessages.some((m) => m.content.sequence.some((s) => s.id === 'end'));
      expect(reachedEnd, 'shake.end with end in sequence').to.be.true;
      const endSequence = shakeEndMessages.map((m) => m.content.sequence.map((s) => s.id)).find((ids) => ids.includes('end'));
      expect(endSequence).to.include.members(['catch', 'from-catch', 'end']);
    });

    And('the shake result for start contains a sequence reaching the end via the link', () => {
      expect(result).to.have.property('start').that.is.an('array');
      const sequenceIds = result.start.map((s) => s.sequence.map((e) => e.id));
      expect(sequenceIds.some((ids) => ids.includes('throw') && ids.includes('catch') && ids.includes('end'))).to.be.true;
    });

    And('the throwing link event is not marked as an end', () => {
      expect(definition.getActivityById('throw')).to.have.property('isEnd', false);
    });

    And('the throw does not terminate a shake sequence as a dead end', () => {
      for (const msg of shakeEndMessages) {
        const ids = msg.content.sequence.map((s) => s.id);
        expect(ids[ids.length - 1], ids.join()).to.not.equal('throw');
      }
      const resultIds = result.start.map((s) => s.sequence.map((e) => e.id));
      expect(
        resultIds.every((ids) => ids[ids.length - 1] !== 'throw'),
        resultIds.join(' | ')
      ).to.be.true;
    });
  });

  Scenario('a converging parallel gateway discovers its peers once and reuses them', () => {
    let definition;
    Given('a process with a parallel fork and join', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-fork" sourceRef="start" targetRef="fork" />
          <parallelGateway id="fork" />
          <sequenceFlow id="to-t1" sourceRef="fork" targetRef="t1" />
          <sequenceFlow id="to-t2" sourceRef="fork" targetRef="t2" />
          <task id="t1" />
          <task id="t2" />
          <sequenceFlow id="from-t1" sourceRef="t1" targetRef="join" />
          <sequenceFlow id="from-t2" sourceRef="t2" targetRef="join" />
          <parallelGateway id="join" />
          <sequenceFlow id="to-end" sourceRef="join" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      definition = new Definition(await testHelpers.context(source));
    });

    let shakes;
    function countShakes() {
      shakes = 0;
      definition.broker.subscribeTmp('event', 'activity.shake.end', () => (shakes += 1), { noAck: true, consumerTag: '_test-shakes' });
    }

    When('definition is ran the first time', async () => {
      countShakes();
      const left = definition.waitFor('leave');
      definition.run();
      await left;
      definition.broker.cancel('_test-shakes');
    });

    Then('the converging gateway discovered its peers by shaking', () => {
      expect(shakes, 'shake on first run').to.be.above(0);
    });

    And('the parallel join completed', () => {
      expect(definition.getActivityById('join').counters).to.have.property('taken', 1);
    });

    When('the same definition is ran again', async () => {
      countShakes();
      const left = definition.waitFor('leave');
      definition.run();
      await left;
      definition.broker.cancel('_test-shakes');
    });

    Then('the cached peers are reused without shaking again', () => {
      expect(shakes, 'no shake on second run').to.equal(0);
    });

    And('the parallel join completed again', () => {
      expect(definition.getActivityById('join').counters).to.have.property('taken', 2);
    });
  });

  Scenario('a shaken converging parallel gateway emits activity.shake.converge', () => {
    let definition;
    Given('a process with a parallel fork and join', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-fork" sourceRef="start" targetRef="fork" />
          <parallelGateway id="fork" />
          <sequenceFlow id="to-t1" sourceRef="fork" targetRef="t1" />
          <sequenceFlow id="to-t2" sourceRef="fork" targetRef="t2" />
          <task id="t1" />
          <task id="t2" />
          <sequenceFlow id="from-t1" sourceRef="t1" targetRef="join" />
          <sequenceFlow id="from-t2" sourceRef="t2" targetRef="join" />
          <parallelGateway id="join" />
          <sequenceFlow id="to-end" sourceRef="join" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;
      definition = new Definition(await testHelpers.context(source));
    });

    const convergeMessages = [];
    When('definition is shaken from start', () => {
      definition.broker.subscribeTmp(
        'event',
        'activity.shake.converge',
        (_, msg) => {
          convergeMessages.push(msg);
        },
        { noAck: true }
      );

      definition.shake('start');
    });

    Then('each parallel gateway emitted a shake converge event identified by its own id', () => {
      const joins = convergeMessages.map((m) => m.content.join);
      expect(joins, joins.join()).to.include('fork');
      expect(joins, joins.join()).to.include('join');
    });
  });
});
