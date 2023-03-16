import {Definition} from '../../../src/index.js';
import got from 'got';
import JsExtension from '../../resources/extensions/JsExtension.js';
import nock from 'nock';
import testHelpers from '../../helpers/testHelpers.js';

const source = `
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="overflow" isExecutable="true">
      <startEvent id="start" />
      <sequenceFlow id="to-service" sourceRef="start" targetRef="getitems" />
      <serviceTask id="getitems" implementation="\${environment.services.httpRequest(environment.variables.url)}" js:result="items" />
      <sequenceFlow id="to-peritem" sourceRef="getitems" targetRef="peritem" />
      <serviceTask id="peritem" implementation="\${environment.services.httpRequest(content.item.id)}" js:result="multi">
        <multiInstanceLoopCharacteristics isSequential="true" js:collection="\${environment.output.items[0].records}" />
      </serviceTask>
      <sequenceFlow id="to-save" sourceRef="peritem" targetRef="save" />
      <scriptTask id="save" scriptFormat="js">
        <script>
          environment.variables.url = environment.output.items && environment.output.items[0].next;
          environment.output.result = (environment.output.result || []).concat(environment.output.multi);
          next();
        </script>
      </scriptTask>
      <sequenceFlow id="to-takenext" sourceRef="save" targetRef="takenext" />
      <exclusiveGateway id="takenext" default="to-end" />
      <sequenceFlow id="to-end" sourceRef="takenext" targetRef="end" />
      <sequenceFlow id="back-to-service" sourceRef="takenext" targetRef="getitems">
        <conditionExpression xsi:type="tFormalExpression">\${environment.variables.url}</conditionExpression>
      </sequenceFlow>
      <endEvent id="end" />
    </process>
  </definitions>
`;

const source2 = `
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="overflow" isExecutable="true">
      <startEvent id="start" />
      <sequenceFlow id="to-service" sourceRef="start" targetRef="getitems" />
      <serviceTask id="getitems" implementation="\${environment.services.httpRequest(environment.variables.url)}" js:result="items" />
      <sequenceFlow id="to-peritem" sourceRef="getitems" targetRef="peritem" />
      <serviceTask id="peritem" implementation="\${environment.services.httpRequest(content.item.id)}" js:result="multi">
        <multiInstanceLoopCharacteristics isSequential="true" js:collection="\${environment.output.items[0].records}" />
      </serviceTask>
      <sequenceFlow id="to-save" sourceRef="peritem" targetRef="save" />
      <boundaryEvent id="catch" attachedToRef="peritem">
        <errorEventDefinition />
      </boundaryEvent>
      <sequenceFlow id="from-catch" sourceRef="catch" targetRef="save" />
      <scriptTask id="save" scriptFormat="js">
        <script>
          environment.variables.url = environment.output.items && environment.output.items[0].next;
          environment.output.result = (environment.output.result || []).concat(environment.output.multi || []);
          next();
        </script>
      </scriptTask>
      <sequenceFlow id="to-takenext" sourceRef="save" targetRef="takenext" />
      <exclusiveGateway id="takenext" default="to-end" />
      <sequenceFlow id="to-end" sourceRef="takenext" targetRef="end" />
      <sequenceFlow id="back-to-service" sourceRef="takenext" targetRef="getitems">
        <conditionExpression xsi:type="tFormalExpression">\${environment.variables.url}</conditionExpression>
      </sequenceFlow>
      <endEvent id="end" />
    </process>
  </definitions>
`;

Feature('Attempt to provoke a stack overflow', () => {
  beforeEachScenario(nock.cleanAll);
  after(nock.cleanAll);

  Scenario('a sequential multi-instance with loop back flow', () => {
    let services, items;
    Given('service return 301 items', () => {
      items = new Array(301).fill().map((_, idx) => ({id: idx}));
      nock('http://example.local')
        .get('/')
        .query({pageSize: 300})
        .reply(200, {
          records: items.slice(0, 300),
          next: '/?pageSize=1',
        })
        .get('/')
        .query({pageSize: 1})
        .reply(200, { records: items.slice(300) })
        .get(/^\/\d+/)
        .times(301)
        .reply(200, {data: {}});

      async function makeRequest(path, _, next) {
        try {
          const {body} = await got(new URL(path, 'http://example.local'), {responseType: 'json', retry: { limit: 0 }});
          return next(null, body);
        } catch (err) {
          next(err);
        }
      }

      services = {
        httpRequest: function httpRequest(path) {
          return makeRequest.bind(null, path);
        },
      };
    });

    let context, definition, end;
    When('definition is ran', async () => {
      context = await testHelpers.context(source, {
        extensions: {
          js: JsExtension,
        },
      });
      definition = new Definition(context, {
        services,
        variables: {
          url: '/?pageSize=300',
        },
      });
      end = definition.waitFor('end');
      definition.run();
    });

    Then('execution completes', () => {
      return end;
    }).timeout(3000);

    let stopped;
    When('definition is ran again stopping in the middle of multi-instance', () => {
      nock('http://example.local')
        .get('/')
        .query({pageSize: 300})
        .reply(200, {
          records: items.slice(0, 300),
          next: '/?pageSize=1',
        })
        .get('/')
        .query({pageSize: 1})
        .reply(200, { records: items.slice(300) })
        .get(/^\/\d+/)
        .times(302)
        .reply(200, {data: {}});

      definition = new Definition(context.clone(), {
        services,
        variables: {
          url: '/?pageSize=300',
        },
      });

      const peritem = definition.getActivityById('peritem');
      peritem.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        if (msg.content.index > 150) definition.stop();
      }, {noAck: true});

      stopped = definition.waitFor('stop');
      definition.run();
    });

    Then('execution is stopped', () => {
      return stopped;
    }).timeout(3000);

    When('execution is recovered and resumed', () => {
      const state = definition.getState();
      definition = new Definition(context.clone(), {
        services,
      }).recover(state);

      end = definition.waitFor('leave');
      definition.resume();
    });

    Then('execution completes', () => {
      return end;
    }).timeout(3000);

    And('all items have been processed', () => {
      expect(definition.environment.output.result).to.have.length(301);
    });
  });

  Scenario('a service task that throws in extension when completed and then is resumed', () => {
    let options, items;
    Given('service returning items', () => {
      items = new Array(11).fill().map((_, idx) => ({id: idx}));
      nock('http://example.local')
        .get('/')
        .query({pageSize: 10})
        .reply(200, {
          records: items.slice(0, 10),
          next: '/?pageSize=1',
        })
        .get('/')
        .query({pageSize: 1})
        .reply(200, { records: items.slice(10) })
        .get(/^\/\d+/)
        .times(11)
        .reply(200, {data: {}});

      async function makeRequest(path, _, next) {
        try {
          const {body} = await got(new URL(path, 'http://example.local'), {responseType: 'json', retry: { limit: 0 }});
          return next(null, body);
        } catch (err) {
          next(err);
        }
      }

      options = {
        services: {
          httpRequest: function httpRequest(path) {
            return makeRequest.bind(null, path);
          },
        },
        extensions: {
          js: JsExtension.extension,
          save(activity) {
            if (!activity.behaviour.loopCharacteristics) return;
            const broker = activity.broker;
            return {
              activate() {
                broker.subscribeOnce('event', 'activity.execution.completed', () => {
                  broker.publish('format', 'run.end.format', {endRoutingKey: 'run.end.complete'});
                  process.nextTick(() => {
                    broker.publish('format', 'run.end.error', {error: new Error('Shaky')});
                  });
                }, {consumerTag: 'shaky'});
              },
              deactivate() {
                broker.cancel('shaky');
              },
            };
          },
        },
      };
    });

    let context, definition, end;
    When('definition is ran', async () => {
      context = await testHelpers.context(source2, {
        extensions: {
          js: JsExtension,
        },
      });

      definition = new Definition(context, {
        ...options,
        variables: {
          url: '/?pageSize=10',
        },
      });

      end = definition.waitFor('end');
      definition.run();
    });

    Then('execution completes', () => {
      return end;
    }).timeout(3000);

    let stopped;
    When('definition is ran again stopping in the middle of multi-instance', () => {
      nock('http://example.local')
        .get('/')
        .query({pageSize: 10})
        .reply(200, {
          records: items.slice(0, 10),
          next: '/?pageSize=1',
        })
        .get('/')
        .query({pageSize: 1})
        .reply(200, { records: items.slice(10) })
        .get(/^\/\d+/)
        .times(12)
        .reply(200, {data: {}});

      definition = new Definition(context.clone(), {
        ...options,
        variables: {
          url: '/?pageSize=10',
        },
      });

      const peritem = definition.getActivityById('peritem');
      peritem.broker.subscribeTmp('execution', 'execute.start', (_, msg) => {
        if (msg.content.index > 5) definition.stop();
      }, {noAck: true});

      stopped = definition.waitFor('stop');
      definition.run();
    });

    Then('execution is stopped', () => {
      return stopped;
    }).timeout(3000);

    When('execution is recovered and resumed', () => {
      const state = definition.getState();
      definition = new Definition(context.clone(), {
        ...options,
      }).recover(state);

      end = definition.waitFor('leave');
      definition.resume();
    });

    Then('execution completes', () => {
      return end;
    }).timeout(3000);

    And('all items have been processed', () => {
      expect(definition.environment.output.result).to.have.length(0);
    });

    let state;
    When('definition is ran again saving state on format error', () => {
      nock('http://example.local')
        .get('/')
        .query({pageSize: 10})
        .reply(200, {
          records: items.slice(0, 10),
          next: '/?pageSize=1',
        })
        .get('/')
        .query({pageSize: 1})
        .reply(200, { records: items.slice(10) })
        .get(/^\/\d+/)
        .times(12)
        .reply(200, {data: {}});

      definition = new Definition(context.clone(), {
        ...options,
        variables: {
          url: '/?pageSize=10',
        },
      });

      definition.broker.subscribeTmp('event', 'activity.error', () => {
        state = definition.getState();
        definition.stop();
      }, {noAck: true});

      stopped = definition.waitFor('stop');
      definition.run();
    });

    Then('execution is stopped', () => {
      return stopped;
    }).timeout(3000);

    When('execution is recovered and resumed', () => {
      definition = new Definition(context.clone(), {
        ...options,
      }).recover(state);

      end = definition.waitFor('leave');
      definition.resume();
    });

    Then('execution completes', () => {
      return end;
    }).timeout(3000);

    And('all items have been processed', () => {
      expect(definition.environment.output.result).to.have.length(0);
    });
  });
});
