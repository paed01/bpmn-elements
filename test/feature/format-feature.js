import Definition from '../../src/definition/Definition.js';
import testHelpers from '../helpers/testHelpers.js';

Feature('Format', () => {
  Scenario('Activities with save state', () => {
    let definition;
    const states = [];
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
        },
      });
    });

    let end;
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
        },
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
        },
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
        },
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
        },
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
        },
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
        },
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
        },
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
        },
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
        },
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
        },
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

  Scenario('Recover and resume with async formatting execution', () => {
    let context, definition;
    const serviceCalls = [];
    Given('a process with a service task and extensions handling service', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="script-definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="my-process" isExecutable="true">
          <dataObjectReference id="globalInputRef" dataObjectRef="input" />
          <dataObjectReference id="inputFromUserRef" dataObjectRef="inputFromUser" />
          <dataObjectReference id="dorProp" dataObjectRef="prop" />
          <dataObject id="input" />
          <dataObject id="inputFromUser" />
          <dataObject id="prop" />
          <serviceTask id="task">
            <property id="Property_1" name="bpmnprop" />
            <ioSpecification id="inputSpec">
              <dataInput id="input_1" name="Surname" />
              <dataOutput id="userInput" name="result" />
            </ioSpecification>
            <dataInputAssociation id="associatedInput" sourceRef="globalInputRef" targetRef="input_1" />
            <dataInputAssociation id="DataInputAssociation_0xue5vg">
              <sourceRef>dorProp</sourceRef>
              <targetRef>Property_1</targetRef>
            </dataInputAssociation>
            <dataOutputAssociation id="associatedOutput" sourceRef="userInput" targetRef="inputFromUserRef" />
          </serviceTask>
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
    });

    function asyncExtensions(element) {
      if (element.type === 'bpmn:Process') return;
      return elementExtensions(element);
    }

    function elementExtensions(activity) {
      if (activity.type === 'bpmn:ServiceTask') {
        activity.behaviour.Service = function Service() {
          return {
            execute(...args) {
              serviceCalls.push(args);
            },
          };
        };
      }

      return {
        activate(msg) {
          const formatQ = activity.broker.getQueue('format-run-q');
          if (msg.fields.redelivered && msg.fields.routingKey === 'run.start') {
            formatQ.queueMessage({routingKey: 'run.enter.format'}, {endRoutingKey: 'run.enter.complete'}, {persistent: false});
          }
          if (msg.fields.redelivered && msg.fields.routingKey === 'run.end') {
            formatQ.queueMessage({routingKey: 'run.end.format'}, {endRoutingKey: 'run.end.complete'}, {persistent: false});
          }

          activity.on('enter', () => {
            formatQ.queueMessage({routingKey: 'run.enter.format'}, {endRoutingKey: 'run.enter.complete'}, {persistent: false});
          }, {consumerTag: '_extension-on-enter'});

          activity.on('activity.execution.completed', () => {
            formatQ.queueMessage({routingKey: 'run.end.format'}, {endRoutingKey: 'run.end.complete'}, {persistent: false});
          }, {consumerTag: '_extension-on-end'});
        },
        deactivate() {
          activity.broker.cancel('_extension-on-enter');
          activity.broker.cancel('_extension-on-end');
        },
      };
    }

    When('definition run', () => {
      definition = new Definition(context, {
        variables: {
          _data: {input: 'startio', prop: 72},
        },
        settings: {
          enableDummyService: false,
        },
        extensions: {
          asyncExtensions,
        },
      });

      definition.run();
    });

    Then('async enter formatting is waiting to complete', () => {
      const [api] = definition.getPostponed();
      expect(api.owner.status).to.equal('formatting');
    });

    And('io is exposed on task', () => {
      const [api] = definition.getPostponed();
      expect(api.owner.extensions.count).to.equal(2);
      expect(api.owner.bpmnIo).to.be.ok;
    });

    let state;
    Given('state is saved and run is stopped', () => {
      state = definition.getState();
      definition.stop();
    });

    When('definition recovered and resumed', () => {
      definition = new Definition(context.clone(), {
        settings: {
          enableDummyService: false,
        },
        extensions: {
          asyncExtensions,
        },
      });

      definition.recover(state).resume();
    });

    And('resumed enter formatting completes', () => {
      const [api] = definition.getPostponed();
      const formatQ = api.owner.broker.getQueue('format-run-q');
      formatQ.queueMessage({routingKey: 'run.enter.complete'}, {extended: true}, {persistent: false});
    });

    let serviceCall;
    Then('service is called', () => {
      expect(serviceCalls).to.have.length(1);
      serviceCall = serviceCalls.pop();
    });

    And('format input is set', () => {
      const [msg] = serviceCall;
      expect(msg.content).to.have.property('extended', true);
      expect(msg.content).to.have.property('ioSpecification');
      expect(msg.content.ioSpecification).to.have.property('dataInputs').with.length(1);
      expect(msg.content.ioSpecification.dataInputs[0]).to.deep.equal({
        id: 'input_1',
        name: 'Surname',
        type: 'bpmn:DataInput',
        value: 'startio',
      });
      expect(msg.content).to.have.property('properties').that.deep.equal({
        Property_1: {
          id: 'Property_1',
          name: 'bpmnprop',
          type: 'bpmn:Property',
          value: 72,
        },
      });
    });

    When('service completes', () => {
      const [, callback] = serviceCall;
      callback(null, {
        ioSpecification: {
          dataOutputs: [{
            id: 'userInput',
            value: 'endio',
          }],
        },
      });
    });

    Then('async end formatting is waiting to complete', () => {
      const [api] = definition.getPostponed();
      expect(api.owner.status).to.equal('formatting');
    });

    Given('state is saved and run is stopped', () => {
      state = definition.getState();
      definition.stop();
    });

    let activityEnd, end;
    When('definition recovered and resumed', () => {
      definition = new Definition(context.clone(), {
        settings: {
          enableDummyService: false,
        },
        extensions: {
          asyncExtensions,
        },
      });

      end = definition.waitFor('end');
      activityEnd = definition.waitFor('activity.end');

      definition.recover(state).resume();
    });

    Then('format input is still set', () => {
      const [api] = definition.getPostponed();
      expect(api.owner.status).to.equal('formatting');
      expect(api.content).to.have.property('extended', true);
    });

    When('resumed end formatting completes', () => {
      const [api] = definition.getPostponed();
      const formatQ = api.owner.broker.getQueue('format-run-q');
      formatQ.queueMessage({routingKey: 'run.end.complete'}, {serviceOutput: true}, {persistent: false});
    });

    Then('resumed definition completes', () => {
      return end;
    });

    And('async end formatting is set', async () => {
      const api = await activityEnd;
      expect(api.content).to.have.property('extended', true);
      expect(api.content).to.have.property('ioSpecification');
      expect(api.content.ioSpecification).to.have.property('dataInputs').with.length(1);
      expect(api.content.ioSpecification.dataInputs[0]).to.deep.equal({
        id: 'input_1',
        name: 'Surname',
        type: 'bpmn:DataInput',
        value: 'startio',
      });
      expect(api.content).to.have.property('properties').that.deep.equal({
        Property_1: {
          id: 'Property_1',
          name: 'bpmnprop',
          type: 'bpmn:Property',
          value: 72,
        },
      });
      expect(api.content).to.have.property('serviceOutput', true);
      expect(api.content.ioSpecification).to.have.property('dataOutputs').with.length(1);
      expect(api.content.ioSpecification.dataOutputs[0]).to.deep.equal({
        id: 'userInput',
        name: 'result',
        type: 'bpmn:DataOutput',
        value: 'endio',
      });
    });
  });

  Scenario('State is saved when in async extension', () => {
    let context, definition;
    Given('a process with a service task and extensions handling service', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions id="script-definition" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="my-process" isExecutable="true">
          <serviceTask id="task" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
    });

    function asyncExtensions(element) {
      if (element.type === 'bpmn:Process') return;
      return elementExtensions(element);
    }

    function elementExtensions(activity) {
      if (activity.type === 'bpmn:ServiceTask') {
        activity.behaviour.Service = function Service() {
          return {
            execute(msg, callback) {
              callback(null, {result: msg.content.entered});
            },
          };
        };
      }

      return {
        activate(msg) {
          const formatQ = activity.broker.getQueue('format-run-q');
          if (msg.fields.redelivered) {
            if (msg.fields.routingKey === 'run.start') {
              formatQ.queueMessage({routingKey: 'run.enter.format'}, {endRoutingKey: 'run.enter.complete'}, {persistent: false});
            }
            if (msg.fields.routingKey === 'run.execute') {
              return activity.on('activity.execution.completed', () => {
                formatQ.queueMessage({routingKey: 'run.end.format'}, {endRoutingKey: 'run.end.complete'}, {persistent: false});
              }, {consumerTag: '_extension-on-end'});
            }
          }

          activity.on('enter', (api) => {
            formatQ.queueMessage({routingKey: 'run.enter.format'}, {endRoutingKey: 'run.enter.complete'}, {persistent: false});
            api.environment.services.saveState(api);
          }, {consumerTag: '_extension-on-enter'});

          activity.on('activity.execution.completed', (api) => {
            formatQ.queueMessage({routingKey: 'run.end.format'}, {endRoutingKey: 'run.end.complete'}, {persistent: false});
            api.environment.services.saveState(api);
          }, {consumerTag: '_extension-on-end'});
        },
        deactivate() {
          activity.broker.cancel('_extension-on-enter');
          activity.broker.cancel('_extension-on-end');
        },
      };
    }

    const states = [];
    When('definition run', () => {
      definition = new Definition(context, {
        settings: {
          enableDummyService: false,
        },
        extensions: {
          asyncExtensions,
        },
      });

      definition.environment.addService('saveState', () => {
        states.push(definition.getState());
      });

      definition.run();
    });

    Then('enter formatting is waiting to complete', () => {
      const [api] = definition.getPostponed();
      expect(api.fields.routingKey).to.equal('activity.enter');
      expect(api.owner.status).to.equal('formatting');

      definition.stop();
    });

    When('definition recovered and resumed at formatting enter message', () => {
      definition = new Definition(context.clone(), {
        settings: {
          enableDummyService: false,
        },
        extensions: {
          asyncExtensions,
        },
      });

      definition.environment.addService('saveState', () => {
        states.push(definition.getState());
      });

      definition.recover(states.shift()).resume();
    });

    And('resumed enter formatting completes', () => {
      const [api] = definition.getPostponed();
      api.broker.getExchange('format').publish('run.enter.complete', { entered: 3 }, {persistent: false});
    });

    Then('run is stopped on formatting execution complete message', () => {
      definition.stop();
      const [api] = definition.getPostponed();
      expect(api.fields.routingKey).to.equal('activity.execution.completed');
      expect(api.owner.status).to.equal('formatting');
    });

    let activityEnd, end;
    When('definition recovered and resumed again', () => {
      definition = new Definition(context.clone(), {
        settings: {
          enableDummyService: false,
        },
        extensions: {
          asyncExtensions,
        },
      });

      definition.recover(states.shift()).resume();
    });

    Then('run is formatting end message', () => {
      const [api] = definition.getPostponed();
      expect(api.fields.routingKey).to.equal('activity.execution.completed');
      expect(api.owner.status).to.equal('formatting');
    });

    When('end formatting completes', () => {
      activityEnd = definition.waitFor('activity.end');
      end = definition.waitFor('end');

      const [api] = definition.getPostponed();
      api.broker.publish('format', 'run.end.complete', { sum: api.content.output.result });
    });

    Then('resumed definition completes', () => {
      return end;
    });

    And('async end formatting is set', async () => {
      const api = await activityEnd;
      expect(api.content).to.have.property('entered', 3);
      expect(api.content).to.have.property('sum', 3);
    });
  });
});
