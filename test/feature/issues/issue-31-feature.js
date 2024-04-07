import { Definition } from '../../../src/index.js';
import testHelpers from '../../helpers/testHelpers.js';
import factory from '../../helpers/factory.js';

const source = factory.resource('issue-31.bpmn');
const sourceParallelJoin = factory.resource('issue-31-cm.bpmn');

Feature('Issue 31 - Error handling on save and resume', () => {
  function makeRequestServiceSync(message, callback) {
    callback(
      {
        name: 'requestError',
        description: 'Error happened',
        code: 'code000',
      },
      null,
    );
  }

  function makeRequestServiceAsync(message, callback) {
    setTimeout(() => {
      makeRequestServiceSync(message, callback);
    }, 1);
  }

  const scenarios = [
    {
      description: 'original source, sync service',
      source,
      service: makeRequestServiceSync,
    },
    {
      description: 'original source, async service',
      source,
      service: makeRequestServiceAsync,
    },
    {
      description: 'parallel join source, sync service',
      source: sourceParallelJoin,
      service: makeRequestServiceSync,
    },
    {
      description: 'parallel join source, async service',
      source: sourceParallelJoin,
      service: makeRequestServiceAsync,
    },
  ];

  scenarios.forEach((test) => {
    describe(test.description, () => {
      Scenario('handles caught activity error on resume', () => {
        let services;
        Given('there are some services', () => {
          services = {
            statusCodeOk() {
              return false;
            },
            makeRequestService: test.service,
          };
        });

        let context, definition, stopped;
        const states = [];
        When('definition is ran with listener stopping on user task', async () => {
          context = await testHelpers.context(test.source);
          definition = new Definition(context, {
            services,
            variables: {
              timeout: 'PT0.1S',
            },
          });

          definition.on('activity.wait', (api) => {
            if (api.id === 'waitForSignalTask') {
              states.push(definition.getState());
              definition.stop();
            }
          });

          stopped = definition.waitFor('stop');
          definition.run();
        });

        Then('execution stops on user task', () => {
          return stopped;
        });

        let end;
        When('definition is recovered and resumed', () => {
          expect(states, 'saved states').to.have.length(1);

          definition = new Definition(context.clone(), {
            services,
          }).recover(states.pop());

          end = definition.waitFor('end');
          definition.resume();
        });

        And('retry times out', () => {
          // no-op
        });

        Then('run completes', () => {
          return end;
        });
      });
    });

    Scenario('handles caught activity when ran through', () => {
      let services;
      Given('there are some services', () => {
        services = {
          statusCodeOk() {
            return false;
          },
          makeRequestService: test.service,
        };
      });

      let context, definition, end;
      When('definition is ran', async () => {
        context = await testHelpers.context(test.source);
        definition = new Definition(context, {
          services,
          variables: {
            timeout: 'PT0.01S',
          },
        });

        end = definition.waitFor('end');
        definition.run();
      });

      And('retry times out', () => {
        // no-op
      });

      Then('run completes', () => {
        return end;
      });
    });
  });
});
