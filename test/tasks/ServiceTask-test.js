import JsExtension from '../resources/extensions/JsExtension.js';
import nock from 'nock';
import got from 'got';
import ServiceTask from '../../src/tasks/ServiceTask.js';
import testHelpers from '../helpers/testHelpers.js';
import { ActivityError } from '../../src/error/Errors.js';

describe('ServiceTask', () => {
  describe('behaviour', () => {
    it('no service on execution returns error if disableDummyService is enabled', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true" implementation="">
          <serviceTask id="task" name="Get" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, {settings: {disableDummyService: true}});
      const task = context.getActivityById('task');

      let error;
      const fail = task.waitFor('leave').catch(err => {
        error = err;
      });
      task.run();

      await fail;

      expect(error).to.be.instanceOf(ActivityError).and.have.property('message').that.match(/service not defined/);
    });

    it('no service on execution runs if disableDummyService is NOT disabled', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="serviceTask" name="Get" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const task = context.getActivityById('serviceTask');
      const completed = task.waitFor('end');
      task.run();
      return completed;
    });

    it('implementation pointing to function call receives service task id and type', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="serviceTask" implementation="\${environment.services.getService()}" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);

      context.environment.addService('getService', (inputContext) => {
        expect(inputContext.content).to.have.property('id', 'serviceTask');
        expect(inputContext.content).to.have.property('type', 'bpmn:ServiceTask');
        expect(inputContext.content).to.have.property('executionId').that.match(/^serviceTask.+/);

        return (...a) => {
          a.pop()();
        };
      });

      const task = context.getActivityById('serviceTask');
      const leave = task.waitFor('leave');
      task.run();
      await leave;
    });
  });

  describe('service behaviour', () => {
    it('runs service behavior stop function on stop', () => {
      let stopped = false;
      let discarded = false;
      const task = ServiceTask({
        id: 'service',
        behaviour: {
          Service: function Service() {
            return {
              execute() {},
              stop(msg) {
                stopped = msg;
              },
              discard(msg) {
                discarded = msg;
              },
            };
          },
        },
      }, testHelpers.emptyContext());

      task.run();
      task.stop();

      expect(stopped, 'stopped').to.have.property('fields').with.property('routingKey');
      expect(discarded, 'discarded').to.be.false;
    });

    it('runs service behavior discard function on discard', () => {
      let discarded = false;
      let stopped = false;
      const task = ServiceTask({
        id: 'service',
        behaviour: {
          Service: function Service() {
            return {
              execute() {},
              discard(msg) {
                discarded = msg;
              },
              stop(msg) {
                stopped = msg;
              },
            };
          },
        },
      }, testHelpers.emptyContext());

      task.run();
      task.discard();

      expect(discarded, 'discarded').to.have.property('fields').with.property('routingKey');
      expect(stopped, 'stopped').to.be.false;
    });

    it('runs service behavior stop function on discard if no discard function', () => {
      let stopped = false;
      const task = ServiceTask({
        id: 'service',
        behaviour: {
          Service: function Service() {
            return {
              execute() {},
              stop(msg) {
                stopped = msg;
              },
            };
          },
        },
      }, testHelpers.emptyContext());

      task.run();
      task.discard();

      expect(stopped, 'stopped').to.have.property('fields').with.property('routingKey');
    });
  });

  describe('recover and resume', () => {
    it('run stop resume while executing service function', () => {
      const task = ServiceTask({
        id: 'service',
        behaviour: {
          Service: function Service() {
            return {
              execute() {},
            };
          },
        },
      }, testHelpers.emptyContext());

      task.run();
      task.stop();
      task.resume();
    });

    it('run stop recover resume while executing service function', () => {
      const task = ServiceTask({
        id: 'service',
        behaviour: {
          Service: function Service() {
            return {
              execute() {},
            };
          },
        },
      }, testHelpers.emptyContext());

      task.run();
      task.stop();

      const state = task.getState();
      const recovered = ServiceTask({
        id: 'service',
        behaviour: {
          Service: function Service() {
            return {
              execute(...args) {
                args.pop()();
              },
            };
          },
        },
      }, testHelpers.emptyContext()).recover(JSON.parse(JSON.stringify(state)));

      recovered.resume();
      expect(recovered.counters).to.have.property('taken', 1);
    });

    it('stop in service function, recover resume', () => {
      let state;
      const task = ServiceTask({
        id: 'service',
        behaviour: {
          Service: function Service(activity) {
            return {
              execute() {
                activity.stop();
                state = activity.getState();
              },
            };
          },
        },
      }, testHelpers.emptyContext());

      task.run();

      const recovered = ServiceTask({
        id: 'service',
        behaviour: {
          Service: function Service() {
            return {
              execute(...args) {
                args.pop()();
              },
            };
          },
        },
      }, testHelpers.emptyContext()).recover(state);

      recovered.resume();
      expect(recovered.counters).to.have.property('taken', 1);
    });
  });

  describe('execution with multiple boundary events', () => {
    let context;
    beforeEach(async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start" />
          <serviceTask id="serviceTask" name="Get" implementation="\${environment.services.postMessage}" />
          <boundaryEvent id="errorEvent" attachedToRef="serviceTask">
            <errorEventDefinition />
          </boundaryEvent>
          <boundaryEvent id="timerEvent" attachedToRef="serviceTask">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT0.05S</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
          <startEvent id="end" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="serviceTask" />
          <sequenceFlow id="flow2" sourceRef="serviceTask" targetRef="end" />
        </process>
      </definitions>`;

      context = await testHelpers.context(source);
      context.environment.addService('postMessage', (ctx, next) => {
        next(null, true);
      });
    });

    it('executes service on taken inbound', async () => {
      const task = context.getActivityById('serviceTask');

      const leave = task.waitFor('leave');
      task.activate();
      task.inbound[0].take();
      const api = await leave;

      expect(api.content.output).to.eql([true]);
    });

    it('is called with input context', () => {
      context.environment.addService('postMessage', (scope, callback) => {
        expect(scope).to.have.property('environment');
        expect(scope).to.have.property('content');
        expect(scope.content).to.have.property('executionId');
        callback();
      });

      const task = context.getActivityById('serviceTask');
      const leave = task.waitFor('leave');
      task.activate();
      task.inbound[0].take();
      return leave;
    });

    it('error in callback is caught by bound error event', async () => {
      context.environment.addService('postMessage', (message, callback) => {
        callback(new Error('Failed'));
      });

      const boundEvent = context.getActivityById('errorEvent');
      const task = context.getActivityById('serviceTask');
      const leave = boundEvent.waitFor('end');
      boundEvent.activate();
      task.activate();
      task.inbound[0].take();

      await leave;
    });

    it('error in callback discards task', async () => {
      context.environment.addService('postMessage', (message, callback) => {
        callback(new Error('Failed'));
      });

      const task = context.getActivityById('serviceTask');
      const errored = task.waitFor('error');
      task.activate();
      task.inbound[0].take();

      await errored;

      expect(task.outbound[0].counters).to.have.property('discard', 1);
    });

    it('caught error discards other boundary events', async () => {
      context.environment.addService('postMessage', (_, callback) => {
        callback(new Error('Failed'));
      });

      const boundEvent1 = context.getActivityById('errorEvent');
      const boundEvent2 = context.getActivityById('timerEvent');
      const task = context.getActivityById('serviceTask');
      const errored = task.waitFor('error');
      boundEvent1.activate();
      boundEvent2.activate();
      task.activate();
      task.inbound[0].take();

      await errored;

      expect(boundEvent2.counters).to.have.property('discarded', 1);
    });

    it('caught error still completes activity', async () => {
      context.environment.addService('postMessage', (_, callback) => {
        callback(new Error('Failed'));
      });

      const boundEvent = context.getActivityById('errorEvent');
      const task = context.getActivityById('serviceTask');
      const errored = task.waitFor('error');
      boundEvent.activate();
      task.activate();
      task.inbound[0].take();

      await errored;

      expect(task.outbound[0].counters).to.have.property('discard', 1);
    });

    it('times out if bound timeout event if callback is not called within timeout duration', () => {
      context.environment.addService('postMessage', () => {});

      const task = context.getActivityById('serviceTask');
      const timeoutEvent = context.getActivityById('timerEvent');
      const errEvent = context.getActivityById('errorEvent');

      timeoutEvent.activate();
      errEvent.activate();
      task.activate();

      const timeout = timeoutEvent.waitFor('end');

      task.inbound[0].take();

      return timeout;
    });

    describe('resume()', () => {
      it('indicates that task is resumed', async () => {
        context.environment.addService('postMessage', (input) => {
          expect(input).to.not.have.property('isResumed');
        });

        const task = context.getActivityById('serviceTask');
        task.activate();

        const started = task.waitFor('start');
        const stopped = task.waitFor('stop');
        task.run();

        await started;

        task.stop();

        await stopped;

        const completed = task.waitFor('leave');

        context.environment.addService('postMessage', (scope, next) => {
          expect(scope.fields).to.have.property('redelivered', true);
          next();
        });

        task.resume();

        return completed;
      });

      it('with state sets isResumed flag on service function input', async () => {
        context.environment.addService('postMessage', (scope) => {
          expect(scope.fields).to.not.have.property('redelivered', true);
        });

        const task = context.getActivityById('serviceTask');
        task.activate();

        const started = task.waitFor('start');
        const stopped = task.waitFor('stop');
        task.run();

        await started;

        task.stop();

        await stopped;

        const state = task.getState();
        task.recover(state);

        const leave = task.waitFor('leave');

        context.environment.addService('postMessage', (scope, next) => {
          expect(scope.fields).to.have.property('redelivered', true);
          next();
        });

        task.resume();

        return leave;
      });
    });
  });

  describe('implementation expression', () => {
    it('executes expression function call with variable reference argument with context as argument', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="serviceTask" name="Get" implementation="\${environment.services.getService(content.input)}" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);

      context.environment.addService('getService', (input) => {
        return (executionContext, callback) => {
          callback(null, input);
        };
      });

      const task = context.getActivityById('serviceTask');
      const leave = task.waitFor('leave');
      task.run({input: 1});

      const api = await leave;

      expect(api.content.output).to.eql([1]);
    });

    it('executes expression function call with static value argument with context as argument', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="serviceTask" name="Get" implementation="\${environment.services.getService('whatever value')}" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);

      context.environment.addService('getService', (input) => {
        return (executionContext, callback) => {
          callback(null, input);
        };
      });
      context.environment.assignVariables({
        input: 1,
      });

      const task = context.getActivityById('serviceTask');
      const leave = task.waitFor('leave');
      task.run();

      const api = await leave;

      expect(api.content.output).to.eql(['whatever value']);
    });
  });

  describe('extensions', () => {
    it('supports saving output in variable', async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="testProcess" isExecutable="true">
          <serviceTask id="serviceTask" name="Get" implementation="\${environment.services.save}" js:result="result" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source, {
        extensions: {
          js: JsExtension,
        },
      });

      context.environment.addService('save', (_, callback) => {
        callback(null, 1);
      });

      const task = context.getActivityById('serviceTask');
      const leave = task.waitFor('leave');
      task.run();

      await leave;

      expect(context.environment.output).to.eql({result: [1]});
    });
  });

  describe('loop', () => {
    describe('sequential', () => {
      let context;
      beforeEach(async () => {
        context = await getLoopContext(true);
      });

      it('executes service in sequence', async () => {
        const task = context.getActivityById('task');

        nock('http://example.com')
          .get('/api/pal?version=0')
          .delay(50)
          .reply(200, {})
          .get('/api/franz?version=1')
          .delay(30)
          .reply(200, {})
          .get('/api/immanuel?version=2')
          .reply(409, {}, {'content-type': 'application/json'});

        const completed = task.waitFor('leave');
        task.run();

        await completed;

        expect(nock.isDone()).to.be.true;
      });

      it('completes with output from loop', async () => {
        const task = context.getActivityById('task');

        task.broker.subscribeTmp('execution', 'execute.start', (routingKey, message) => {
          if (!message.content.isMultiInstance) return;
          const {index, item} = message.content;

          nock('http://example.com')
            .get(`/api${item}?version=${index}`)
            .delay(50 - index * 10)
            .reply(index < 2 ? 200 : 409, {
              idx: index,
            });
        }, {noAck: true});

        const leave = task.waitFor('leave');
        task.run();

        const api = await leave;

        expect(api.content.output).to.have.length(3);
        expect(api.content.output[0]).to.eql([{
          statusCode: 200,
          body: {
            idx: 0,
          },
        }]);
        expect(api.content.output[1]).to.eql([{
          statusCode: 200,
          body: {
            idx: 1,
          },
        }]);
        expect(api.content.output[2]).to.eql([{
          statusCode: 409,
          body: {
            idx: 2,
          },
        }]);
      });

      expect(nock.isDone()).to.be.true;
    });

    describe('parallel', () => {
      let context;
      beforeEach(async () => {
        nock.cleanAll();
        context = await getLoopContext(false);
      });

      it('executes service in parallel', async () => {
        const task = context.getActivityById('task');
        task.activate();

        nock('http://example.com')
          .get('/api/pal?version=0')
          .delay(20)
          .reply(200, {})
          .get('/api/franz?version=1')
          .delay(10)
          .reply(200, {})
          .get('/api/immanuel?version=2')
          .reply(409, {});

        const completed = task.waitFor('leave');
        task.run();

        await completed;

        expect(nock.isDone()).to.be.true;
      });

      it('returns output in sequence', async () => {
        const task = context.getActivityById('task');
        task.activate();

        task.broker.subscribeTmp('execution', 'execute.start', (routingKey, message) => {
          const {index, item: pathname} = message.content;
          nock('http://example.com')
            .get(`/api${pathname}?version=${index}`)
            .delay(50 - index * 10)
            .reply(index < 2 ? 200 : 409, {
              idx: index,
            });
        }, {noAck: true});

        const leave = task.waitFor('leave');
        task.run();

        const api = await leave;

        expect(api.content.output).to.have.length(3);
        expect(api.content.output[0]).to.eql([{
          statusCode: 200,
          body: {
            idx: 0,
          },
        }]);
        expect(api.content.output[1]).to.eql([{
          statusCode: 200,
          body: {
            idx: 1,
          },
        }]);
        expect(api.content.output[2]).to.eql([{
          statusCode: 409,
          body: {
            idx: 2,
          },
        }]);
      });
    });
  });
});

async function getLoopContext(isSequential) {
  const source = `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="loopProcess" isExecutable="true">
      <serviceTask id="task" implementation="\${environment.services.get()}">
        <multiInstanceLoopCharacteristics isSequential="${isSequential}" js:collection="\${environment.variables.paths}">
          <loopCardinality>\${environment.variables.paths.length}</loopCardinality>
        </multiInstanceLoopCharacteristics>
      </serviceTask>
    </process>
  </definitions>`;

  const context = await testHelpers.context(source, {
    extensions: {
      js: JsExtension,
    },
  });

  context.environment.variables.paths = ['/pal', '/franz', '/immanuel'];
  context.environment.addService('get', () => {
    return async function getService(scope, next) {
      const {item, index} = scope.content;
      const callUrl = `http://example.com/api${item}?version=${index}`;

      try {
        const {statusCode, body} = await got(callUrl, {throwHttpErrors: false, responseType: 'json'});
        return next(null, {statusCode, body});
      } catch (err) {
        return next(err);
      }
    };
  });

  return context;
}
