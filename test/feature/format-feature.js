import Definition from '../../src/definition/Definition';
import testHelpers from '../helpers/testHelpers';

Feature('Format', () => {
  Scenario('Activities with save state', () => {
    let definition;
    Given('a process with form start event, user tasks, and a service task', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="formatProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-service-task" sourceRef="start" targetRef="service-task" />
          <serviceTask id="service-task" implementation="\${environment.services.saveState}" />
          <sequenceFlow id="to-end" sourceRef="service-task" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        services: {
          saveState({content}, ...args) {
            process.nextTick(() => {
              states.push(content.id);
              args.pop()();
            });
          },
        },
        extensions: {
          saveStateOnEnd(activity) {
            if (activity.type === 'bpmn:Process') return;

            // activity.on('activity.execution.completed', (api) => {
            activity.on('end', (api) => {
              if (api.fields.redelivered) return;

              const {broker} = activity;
              broker.publish('format', 'run.end.state', {endRoutingKey: 'run.end.saved'});

              api.environment.services.saveState(api, () => {
                broker.publish('format', 'run.end.saved', {stateSavedAt: new Date()});
              });
            });
          },
        }
      });
    });

    let end;
    const states = [];
    When('ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('run completes', () => {
      expect(states).to.have.members(['start', 'service-task', 'service-task', 'end']);
    });
  });

  Scenario('Start event with async at end formatting', () => {
    let definition;
    Given('a process with form start event, user tasks, and a service task', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="formatProcess" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-service-task" sourceRef="start" targetRef="service-task" />
          <serviceTask id="service-task" />
          <sequenceFlow id="to-end" sourceRef="service-task" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        extensions: {
          formatSomethingOnEnd(activity) {
            if (activity.type === 'bpmn:Process') return;

            activity.on('end', (api) => {
              if (api.fields.redelivered) return;

              const {broker} = activity;
              broker.publish('format', 'run.end.state', {endRoutingKey: 'run.end.saved'});

              process.nextTick(() => {
                const states = api.environment.output.states = api.environment.output.states || [];
                states.push(api.id);
                broker.publish('format', 'run.end.saved', {stateSavedAt: new Date()});
              });
            });
          },
        }
      });
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    let result;
    Then('run completes', async () => {
      result = await end;
    });

    And('states are saved in order', () => {
      expect(result.environment.output.states).to.deep.equal(['start', 'service-task', 'end']);
    });
  });

  Scenario('Only a start event with sync at enter and end formatting', () => {
    let definition;
    Given('a process with a start event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="formatProcess" isExecutable="true">
          <startEvent id="start" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        extensions: {
          formatSomethingOnEnterAndEnd(activity) {
            if (activity.type !== 'bpmn:StartEvent') return;

            const {broker} = activity;

            activity.on('enter', (api) => {
              if (api.fields.redelivered) return;
              broker.publish('format', 'run.enter.format', {enteredAt: new Date()});
            });

            activity.on('end', (api) => {
              if (api.fields.redelivered) return;
              broker.publish('format', 'run.end.format', {leftAt: new Date()});
            });
          },
        }
      });
    });

    let end;
    const leaveMessages = [];
    When('ran', () => {
      end = definition.waitFor('end');

      definition.broker.subscribeTmp('event', 'activity.leave', (_, msg) => {
        leaveMessages.push(msg);
      }, {noAck: true});

      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('leave message is formatted', () => {
      expect(leaveMessages).to.have.length(1);
      const [msg] = leaveMessages;
      expect(msg.content).to.have.property('enteredAt');
      expect(msg.content).to.have.property('leftAt');
    });
  });

  Scenario('Only a start event with with formatting', () => {
    let context;
    Given('a process with a start event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="formatProcess" isExecutable="true">
          <startEvent id="start" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
    });

    let definition;
    And('an extensions with sync formatting at enter and end', () => {
      definition = new Definition(context, {
        extensions: {
          formatSomethingOnEnterAndEnd(activity) {
            if (activity.type !== 'bpmn:StartEvent') return;

            const {broker} = activity;

            activity.on('enter', (api) => {
              if (api.fields.redelivered) return;
              broker.publish('format', 'run.enter.format', {enteredAt: new Date()});
            });

            activity.on('end', (api) => {
              if (api.fields.redelivered) return;
              broker.publish('format', 'run.end.format', {leftAt: new Date()});
            });
          },
        }
      });
    });

    let end;
    const leaveMessages = [];
    When('ran', () => {
      end = definition.waitFor('end');

      definition.broker.subscribeTmp('event', 'activity.leave', (_, msg) => {
        leaveMessages.push(msg);
      }, {noAck: true});

      definition.run();
    });

    Then('leave message is formatted with sync messages', async () => {
      await end;
      expect(leaveMessages).to.have.length(1);
      const [msg] = leaveMessages.splice(0);
      expect(msg.content).to.have.property('enteredAt');
      expect(msg.content).to.have.property('leftAt');
    });

    Given('an extensions with sync formatting at enter and async at end', () => {
      definition = new Definition(context, {
        extensions: {
          formatSomethingOnEnterAndEnd(activity) {
            if (activity.type !== 'bpmn:StartEvent') return;

            const {broker} = activity;

            activity.on('enter', (api) => {
              if (api.fields.redelivered) return;
              broker.publish('format', 'run.enter.format', {enteredAt: new Date()});
            });

            activity.on('end', (api) => {
              if (api.fields.redelivered) return;
              broker.publish('format', 'run.end.format', {endRoutingKey: 'run.end.complete'});

              return new Promise((resolve) => {
                process.nextTick(() => {
                  resolve({leftAt: new Date()});
                });
              }).then((format) => {
                broker.publish('format', 'run.end.complete', format);
              });
            });
          },
        }
      });
    });

    When('ran', () => {
      end = definition.waitFor('end');

      definition.broker.subscribeTmp('event', 'activity.leave', (_, msg) => {
        leaveMessages.push(msg);
      }, {noAck: true});

      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('leave message is formatted with sync enter and async end messages', () => {
      expect(leaveMessages).to.have.length(1);
      const [msg] = leaveMessages.splice(0);
      expect(msg.content).to.have.property('enteredAt');
      expect(msg.content).to.have.property('leftAt');
    });

    Given('an extensions with async formatting at enter and sync end', () => {
      definition = new Definition(context.clone(), {
        extensions: {
          formatSomethingOnEnterAndEnd(activity) {
            if (activity.type !== 'bpmn:StartEvent') return;

            const {broker} = activity;
            const formatQ = broker.getQueue('format-run-q');

            activity.on('enter', (api) => {
              if (api.fields.redelivered) return;

              formatQ.queueMessage({routingKey: 'run.enter.async'}, {endRoutingKey: 'run.enter.complete'});

              return new Promise((resolve) => {
                process.nextTick(() => {
                  resolve({enteredAt: new Date()});
                });
              }).then((format) => {
                broker.publish('format', 'run.enter.complete', format);
              });
            });

            activity.on('end', (api) => {
              if (api.fields.redelivered) return;

              broker.getQueue('format-run-q').queueMessage({routingKey: 'run.end.format'}, {leftAt: new Date()});

              // broker.publish('format', 'run.end.format', {leftAt: new Date()});

            }, {priority: 10000});
          },
        }
      });
    });

    When('ran', () => {
      end = definition.waitFor('end');

      definition.broker.subscribeTmp('event', 'activity.leave', (_, msg) => {
        leaveMessages.push(msg);
      }, {noAck: true});

      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('leave message is formatted with async enter and sync end messages', () => {
      expect(leaveMessages).to.have.length(1);
      const [msg] = leaveMessages.splice(0);
      expect(msg.content).to.have.property('enteredAt');
      expect(msg.content).to.have.property('leftAt');
    });

    Given('an extension with async at enter and async at end', () => {
      definition = new Definition(context, {
        extensions: {
          formatSomethingOnEnterAndEnd(activity) {
            if (activity.type !== 'bpmn:StartEvent') return;

            const {broker, environment} = activity;
            const formatQ = broker.getQueue('format-run-q');

            activity.on('enter', (api) => {
              if (api.fields.redelivered) return;

              formatQ.queueMessage({routingKey: 'run.enter.async'}, {endRoutingKey: 'run.enter.saved'});

              return new Promise((resolve) => {
                process.nextTick(() => {
                  resolve({enteredAt: new Date()});
                });
              }).then((format) => {
                broker.publish('format', 'run.enter.saved', format);
              });
            });

            activity.on('end', (api) => {
              if (api.fields.redelivered) return;

              formatQ.queueMessage({routingKey: 'run.end.format'}, {endRoutingKey: 'run.end.saved'});

              return new Promise((resolve) => {
                process.nextTick(() => {
                  const states = environment.output.states = environment.output.states || [];
                  states.push(api.content.id);
                  resolve({leftAt: new Date()});
                });
              }).then((format) => {
                broker.publish('format', 'run.end.saved', format);
              });
            });
          },
        }
      });
    });

    When('ran', () => {
      end = definition.waitFor('end');

      definition.broker.subscribeTmp('event', 'activity.leave', (_, msg) => {
        leaveMessages.push(msg);
      }, {noAck: true});

      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('leave message is formatted with async enter and async end messages', () => {
      expect(leaveMessages).to.have.length(1);
      const [msg] = leaveMessages.splice(0);
      expect(msg.content).to.have.property('enteredAt');
      expect(msg.content).to.have.property('leftAt');
    });
  });

  Scenario('Formatting failed', () => {
    let definition;
    Given('a process with failed formatting and errorRoutingKey', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="formatProcess" isExecutable="true">
          <startEvent id="start" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        extensions: {
          saveStateOnEnd(activity) {
            if (activity.type === 'bpmn:Process') return;

            const {broker} = activity;

            activity.on('end', (api) => {
              if (api.fields.redelivered) return;

              try {
                broker.publish('format', 'run.end.state', {endRoutingKey: 'run.end.saved', errorRoutingKey: 'run.end.failed'});
                api.environment.services.saveState(api, () => {
                  broker.publish('format', 'run.end.state', {savedAt: new Date()});
                });
              } catch (err) {
                broker.publish('format', 'run.end.failed', {error: err});
              }
            });
          },
        }
      });
    });

    let error;
    When('ran', () => {
      error = definition.waitFor('error');
      definition.run();
    });

    Then('run failed', () => {
      return error;
    });

    Given('a process with failed formatting publishes routing key ending in .error', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="formatProcess" isExecutable="true">
          <startEvent id="start" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        extensions: {
          saveStateOnEnd(activity) {
            if (activity.type === 'bpmn:Process') return;

            const {broker} = activity;

            activity.on('end', (api) => {
              if (api.fields.redelivered) return;

              try {
                broker.publish('format', 'run.end.state', {endRoutingKey: 'run.end.saved'});
                api.environment.services.saveState(api, () => {
                  broker.publish('format', 'run.end.state', {savedAt: new Date()});
                });
              } catch (err) {
                broker.publish('format', 'run.end.error', {error: err});
              }
            });
          },
        }
      });
    });

    When('ran', () => {
      error = definition.waitFor('error');
      definition.run();
    });

    Then('run failed', () => {
      return error;
    });

    Given('a process with multiple formatting fails', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="formatProcess" isExecutable="true">
          <startEvent id="start" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        extensions: {
          saveStateOnEnd(activity) {
            if (activity.type === 'bpmn:Process') return;

            const {broker} = activity;

            activity.on('end', (api) => {
              if (api.fields.redelivered) return;

              broker.publish('format', 'run.end.first', {endRoutingKey: 'run.end.second'});

              try {
                broker.publish('format', 'run.end.state', {endRoutingKey: 'run.end.saved'});
                api.environment.services.saveState(api, () => {
                  broker.publish('format', 'run.end.state', {savedAt: new Date()});
                });

                broker.publish('format', 'run.end.second', {firstAt: new Date()});
              } catch (err) {
                broker.publish('format', 'run.end.error', {error: err});
              }
            });
          },
        }
      });
    });

    When('ran', () => {
      error = definition.waitFor('error');
      definition.run();
    });

    Then('run failed', () => {
      return error;
    });

    Given('formatting extensions publishes only error routing key', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="formatProcess" isExecutable="true">
          <startEvent id="start" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        extensions: {
          saveStateOnEnd(activity) {
            if (activity.type === 'bpmn:Process') return;

            const {broker} = activity;

            activity.on('end', (api) => {
              if (api.fields.redelivered) return;

              broker.publish('format', 'run.end.first', {endRoutingKey: 'run.end.second'});

              broker.publish('format', 'run.end.state', {endRoutingKey: 'run.end.saved', errorRoutingKey: 'run.end.failed'});
              process.nextTick(() => {
                broker.publish('format', 'run.end.failed');
              });
            });
          },
        }
      });
    });

    When('ran', () => {
      error = definition.waitFor('error');
      definition.run();
    });

    Then('run failed', () => {
      return error;
    });
  });
});
