import BpmnError from '../../src/error/BpmnError';
import Environment from '../../src/Environment';
import ErrorEventDefinition from '../../src/eventDefinitions/ErrorEventDefinition';
import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';
import {ActivityBroker} from '../../src/EventBroker';

describe('ErrorEventDefinition', () => {
  describe('catch', () => {
    let event, activity;
    beforeEach(() => {
      activity = {
        id: 'errorProne',
        type: 'bpmn:ServiceTask',
        broker: ActivityBroker(this).broker,
      };

      event = {
        id: 'bound',
        type: 'bpmn:Event',
        broker: ActivityBroker().broker,
        environment: Environment({ Logger: testHelpers.Logger }),
        attachedTo: activity,
        getErrorById(id) {
          if (id !== 'error_1') return;

          return {
            resolve() {
              return {
                id: 'error_1',
                type: 'bpmn:Error',
                errorCode: 'ERR_MINE',
                name: 'CatchError',
              };
            },
          };
        },
      };
    });

    it('publishes try message with expected error', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
        behaviour: {
          errorRef: {
            id: 'error_1',
          },
        },
      });

      let tryMessage;
      event.broker.subscribeOnce('execution', 'execute.try', (_, msg) => {
        tryMessage = msg;
      });

      definition.execute({
        fields: {},
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
        },
      });

      expect(tryMessage).to.be.ok;
      expect(tryMessage).to.have.property('content').with.property('expect').to.eql({
        id: 'error_1',
        type: 'bpmn:Error',
        errorCode: 'ERR_MINE',
        name: 'CatchError',
      });
      expect(tryMessage.content).to.have.property('index', 0);
    });

    it('redelivered try message resends expect', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      let tryMessage;
      event.broker.subscribeOnce('execution', 'execute.try', (_, msg) => {
        tryMessage = msg;
      });

      definition.execute({
        fields: {
          redelivered: true,
        },
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
          expect: {
            id: 'error_1',
            type: 'bpmn:Error',
            errorCode: 'ERR_MINE',
            name: 'CatchError',
          },
        },
      });

      expect(tryMessage).to.be.ok;
      expect(tryMessage).to.have.property('content').with.property('expect').to.eql({
        id: 'error_1',
        type: 'bpmn:Error',
        errorCode: 'ERR_MINE',
        name: 'CatchError',
      });
      expect(tryMessage.content).to.have.property('index', 0);
    });

    it('listens for execute error listener on attachedTo', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      expect(activity.broker.getExchange('execution')).to.have.property('bindingCount', 1);

      definition.execute({
        fields: {},
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
        },
      });

      expect(activity.broker.getExchange('execution')).to.have.property('bindingCount', 2);
    });

    it('listens for api calls on parent', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      expect(event.broker.getExchange('api')).to.have.property('bindingCount', 0);

      definition.execute({
        fields: {},
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
        },
      });

      expect(event.broker.getExchange('api')).to.have.property('bindingCount', 1);
    });

    it('publishes parent activity catch message on error', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      let message;
      event.broker.subscribeOnce('event', 'activity.catch', (_, msg) => {
        message = msg;
      });

      definition.execute({
        fields: {},
        content: {
          id: 'bound',
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
            path: [{
              id: 'process_1'
            }]
          },
        },
      });

      activity.broker.publish('execution', 'execute.error', {id: 'errorProne', executionId: 'errorProne_1', error: {}});

      expect(message).to.be.ok;

      expect(message).to.have.property('content').with.property('id', 'bound');
      expect(message.content).to.have.property('executionId', 'bound_1');
      expect(message.content.parent).to.have.property('id', 'process_1');
    });

    it('without expected error catches any execute error from attached activity and publishes activity catch message', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.catch', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
        },
      });

      activity.broker.publish('execution', 'execute.error', {id: 'errorProne', executionId: 'errorProne_1', error: {}});

      expect(messages).to.have.length(1);
    });

    it('catches expected error from attached activity and publishes activity catch message', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
        behaviour: {
          errorRef: {
            id: 'error_1',
            type: 'bpmn:Error',
            errorCode: 'ERR_MINE',
            name: 'CatchError',
          },
        },
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.catch', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
        },
      });

      activity.broker.publish('execution', 'execute.error', {id: 'errorProne', executionId: 'errorProne_1', error: {
        code: 'ERR_MINE',
      }});

      expect(messages).to.have.length(1);
    });

    it('ignores error from attached activity if code doesn´t match', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
        behaviour: {
          errorRef: {
            id: 'error_1',
            type: 'bpmn:Error',
            errorCode: 'ERR_MINE',
            name: 'CatchError',
          },
        },
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.catch', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
        },
      });

      activity.broker.publish('execution', 'execute.error', {id: 'errorProne', executionId: 'errorProne_1', error: {
        code: 'ERR-SOMETHINGELSE',
      }});

      expect(messages).to.have.length(0);
    });

    it('catches any execute error if errorCode is undefined', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
        behaviour: {},
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.catch', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
        },
      });

      activity.broker.publish('execution', 'execute.error', {id: 'errorProne', executionId: 'errorProne_1', error: {}});

      expect(messages).to.have.length(1);
    });

    it('catches error from attached activity and completes with output and message containing error', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
        behaviour: {
          errorRef: {
            id: 'error_1',
          },
        },
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
        },
      });

      activity.broker.publish('execution', 'execute.error', {id: 'errorProne', executionId: 'errorProne_1', error: {
        code: 'ERR_MINE',
      }});

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'execute.completed');
      expect(messages[0].content).to.have.property('message').that.eql({
        error: {
          code: 'ERR_MINE',
        },
      });
      expect(messages[0].content).to.have.property('output').that.eql({
        code: 'ERR_MINE',
      });
    });

    it('releases execution error listener when completed', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      definition.execute({
        fields: {},
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
        },
      });

      activity.broker.publish('execution', 'execute.error', {id: 'errorProne', executionId: 'errorProne_1', error: {}});

      expect(activity.broker.getExchange('execution')).to.have.property('bindingCount', 1);
    });

    it('releases parent api listener when completed', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      definition.execute({
        fields: {},
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
        },
      });

      activity.broker.publish('execution', 'execute.error', {id: 'errorProne', executionId: 'errorProne_1', error: {}});

      expect(event.broker.getExchange('api')).to.have.property('bindingCount', 0);
    });

    it('discard and releases execution error listener if discarded', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
        },
      });

      event.broker.publish('api', 'activity.discard.bound_1_0', {}, {type: 'discard'});

      expect(activity.broker.getExchange('execution')).to.have.property('bindingCount', 1);

      expect(messages.pop()).to.have.property('fields').with.property('routingKey', 'execute.discard');
    });

    it('releases parent api listener if discarded', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      definition.execute({
        fields: {},
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
        },
      });

      event.broker.publish('api', 'activity.discard.bound_1_0', {}, {type: 'discard'});

      expect(event.broker.getExchange('api')).to.have.property('bindingCount', 0);
    });

    it('stops and releases execution error listener if stopped', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      definition.execute({
        fields: {},
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
        },
      });

      event.broker.publish('api', 'activity.stop.bound_1_0', {}, {type: 'stop'});

      expect(activity.broker.getExchange('execution')).to.have.property('bindingCount', 1);
    });

    it('stops and releases parent api listener if stopped', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      definition.execute({
        fields: {},
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
        },
      });

      event.broker.publish('api', 'activity.stop.bound_1_0', {}, {type: 'stop'});

      expect(event.broker.getExchange('api')).to.have.property('bindingCount', 0);
    });

    it('ignores activity events after error is caught', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});
      event.broker.subscribeTmp('event', '#', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          executionId: 'bound_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'bound_1',
          },
        },
      });

      activity.broker.publish('execution', 'execute.error', {id: 'errorProne', executionId: 'errorProne_1', error: {}});

      expect(messages).to.have.length(3);

      activity.broker.publish('execution', 'execution.discard');

      expect(messages).to.have.length(3);
    });
  });

  describe('throw', () => {
    let event, bpmnError;
    beforeEach(() => {
      const environment = Environment();
      bpmnError = BpmnError({
        id: 'Error_0',
        type: 'bpmn:Error',
        name: 'AttachedError',
        behaviour: {
          errorCode: '${environment.variables.errorCode}',
        },
        debug() {},
      }, { environment });

      event = {
        id: 'end',
        type: 'bpmn:EndEvent',
        broker: ActivityBroker(this).broker,
        environment,
        isThrowing: true,
        getErrorById(id) {
          if (id !== 'Error_0') return;
          return bpmnError;
        },
      };
    });

    it('publishes referenced error on execute', () => {
      event.environment.variables.errorCode = 'ERR_CODE';
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
        behaviour: {
          errorRef: {
            id: 'Error_0',
          },
        },
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          executionId: 'parent-execution-id',
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'execute.error');
      expect(messages[0].content).to.have.property('error').that.have.property('id', 'Error_0');
      expect(messages[0].content).to.have.property('error').that.have.property('code', 'ERR_CODE');
      expect(messages[0].content).to.have.property('error').that.have.property('name', 'AttachedError');
    });

    it('without error reference publishes activity error on execute', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
        behaviour: {},
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          executionId: 'parent-execution-id',
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'execute.error');
      expect(messages[0].content).to.have.property('error').that.have.property('name', 'ActivityError');
    });

    it('with non-existing error reference publishes activity error on execute', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
        behaviour: {
          errorRef: {
            id: 'non-existing',
          },
        },
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          executionId: 'parent-execution-id',
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'execute.error');
      expect(messages[0].content).to.have.property('error').that.have.property('name', 'ActivityError');
    });
  });

  describe('catch and throw', () => {
    let context;
    beforeEach(async () => {
      context = await testHelpers.context(factory.resource('bound-error.bpmn'));
    });

    it('caught error is forwarded to throw end event', async () => {
      const [bp] = context.getProcesses();
      const event = bp.getActivityById('errorEvent');
      const endEvent = bp.getActivityById('endInError');

      const started = endEvent.waitFor('start');

      bp.on('error', () => {});

      expect(event.outbound).to.have.length(1);

      const taken = event.outbound[0].waitFor('take');

      bp.run();

      const flowApi = await taken;

      expect(flowApi.content.message.error).to.include({
        code: '404',
      });

      const endApi = await started;

      expect(endApi.content.message.error).to.include({
        code: '404',
      });
    });
  });
});
