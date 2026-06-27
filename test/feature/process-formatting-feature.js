import testHelpers from '../helpers/testHelpers.js';

Feature('Process formatting', () => {
  Scenario('Process run is formatted even without an extension', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
      </process>
    </definitions>`;

    let bp;
    Given('a process', async () => {
      const context = await testHelpers.context(source);
      bp = context.getProcessById('theProcess');
    });

    let startContent;
    And('a developer publishes a format message on process enter without registering an extension', () => {
      bp.broker.subscribeTmp(
        'event',
        'process.enter',
        () => {
          bp.broker.publish('format', 'run.enter.format', { formattedByDev: true });
        },
        { noAck: true }
      );
      bp.broker.subscribeTmp(
        'event',
        'process.start',
        (_, msg) => {
          startContent = msg.content;
        },
        { noAck: true }
      );
    });

    let leave;
    When('process runs', () => {
      leave = bp.waitFor('leave');
      bp.run();
      return leave;
    });

    Then('the run content was enriched by the format message', () => {
      expect(startContent).to.have.property('formattedByDev', true);
    });
  });

  Scenario('Process run waits for asynchronous formatting', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
      </process>
    </definitions>`;

    let bp, completeFormat;
    Given('a process with an extension that formats asynchronously on enter', async () => {
      const context = await testHelpers.context(source, {
        extensions: {
          asyncFormat: {
            extension(element) {
              if (element.type !== 'bpmn:Process') return;
              const { broker } = element;
              return {
                activate() {
                  broker.subscribeTmp('event', 'process.enter', onEnter, { noAck: true, consumerTag: '_async-format' });
                },
                deactivate() {
                  broker.cancel('_async-format');
                },
              };
              function onEnter() {
                broker.publish('format', 'run.format.start', { endRoutingKey: 'run.format.end' });
                completeFormat = () => broker.publish('format', 'run.format.end', { asyncFormatted: true });
              }
            },
          },
        },
      });
      bp = context.getProcessById('theProcess');
    });

    let leave, startContent;
    When('process is ran', () => {
      bp.broker.subscribeTmp(
        'event',
        'process.start',
        (_, msg) => {
          startContent = msg.content;
        },
        { noAck: true }
      );
      leave = bp.waitFor('leave');
      bp.run();
    });

    Then('the process is paused awaiting async formatting', () => {
      expect(bp.status).to.equal('formatting');
      expect(bp.counters).to.have.property('completed', 0);
    });

    And('the start transition has not been reached yet', () => {
      expect(startContent, 'start content').to.be.undefined;
    });

    When('async formatting completes', () => {
      completeFormat();
      return leave;
    });

    Then('the process completes', () => {
      expect(bp.counters).to.have.property('completed', 1);
    });

    And('the run content was enriched by the async formatting', () => {
      expect(startContent).to.have.property('asyncFormatted', true);
    });
  });

  Scenario('Process formatting failure surfaces a process error', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
      </process>
    </definitions>`;

    let bp;
    Given('a process with an extension whose formatting fails on enter', async () => {
      const context = await testHelpers.context(source, {
        extensions: {
          failFormat: {
            extension(element) {
              if (element.type !== 'bpmn:Process') return;
              const { broker } = element;
              return {
                activate() {
                  broker.subscribeTmp(
                    'event',
                    'process.enter',
                    () => {
                      broker.publish('format', 'run.format.start', {
                        endRoutingKey: 'run.format.end',
                        errorRoutingKey: 'run.format.error',
                      });
                      broker.publish('format', 'run.format.error', { error: new Error('formatting boom') });
                    },
                    { noAck: true, consumerTag: '_fail-format' }
                  );
                },
                deactivate() {
                  broker.cancel('_fail-format');
                },
              };
            },
          },
        },
      });
      bp = context.getProcessById('theProcess');
    });

    let error;
    When('process is ran', () => {
      error = bp.waitFor('error');
      bp.run();
      return error;
    });

    Then('the process emitted a formatting error', () => {
      return error.then((api) => {
        expect(api.content).to.have.property('error');
        expect(api.content.error).to.match(/formatting boom/);
      });
    });
  });

  Scenario('Process stopped while formatting can be recovered and resumed', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
      </process>
    </definitions>`;

    let context, bp;
    Given('a process with an extension that formats asynchronously on enter', async () => {
      context = await testHelpers.context(source, {
        extensions: {
          asyncFormat: {
            extension(element) {
              if (element.type !== 'bpmn:Process') return;
              const { broker } = element;
              return {
                activate() {
                  broker.subscribeTmp(
                    'event',
                    'process.enter',
                    () => {
                      broker.publish('format', 'run.format.start', { endRoutingKey: 'run.format.end' });
                    },
                    { noAck: true, consumerTag: '_async-format' }
                  );
                },
                deactivate() {
                  broker.cancel('_async-format');
                },
              };
            },
          },
        },
      });
      bp = context.getProcessById('theProcess');
    });

    When('process is ran', () => {
      bp.run();
    });

    Then('the process is paused awaiting async formatting', () => {
      expect(bp.status).to.equal('formatting');
    });

    let state;
    When('the process is stopped while formatting', () => {
      bp.stop();
    });

    And('state is saved', () => {
      state = JSON.parse(JSON.stringify(bp.getState()));
    });

    let leave;
    When('the process is recovered into a new instance and resumed', () => {
      bp = context.clone().getProcessById('theProcess').recover(state);
      leave = bp.waitFor('leave');
      bp.resume();
      return leave;
    });

    Then('the process completes without deadlock', () => {
      expect(bp.counters).to.have.property('completed', 1);
    });
  });
});
