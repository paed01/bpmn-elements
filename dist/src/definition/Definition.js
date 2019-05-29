"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Definition = Definition;
exports.default = void 0;

var _DefinitionExecution = _interopRequireDefault(require("./DefinitionExecution"));

var _Api = require("../Api");

var _EventBroker = require("../EventBroker");

var _shared = require("../shared");

var _Errors = require("../error/Errors");

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _default = Definition;
exports.default = _default;

function Definition(context, options) {
  if (!context) throw new Error('No context');
  const {
    id,
    name,
    type = 'definition'
  } = context;
  let environment = context.environment;

  if (options) {
    environment = environment.clone(options);
    context = context.clone(environment);
  }

  const logger = environment.Logger(type.toLowerCase());
  let execution, executionId, processes, executableProcesses, postponedMessage, stateMessage, stopped, consumingRunQ;
  let status;
  let counters = {
    completed: 0,
    discarded: 0
  };
  const definitionApi = {
    id,
    name,
    type,
    logger,
    context,

    get counters() {
      return { ...counters
      };
    },

    get executionId() {
      return executionId;
    },

    get status() {
      return status;
    },

    get execution() {
      return execution;
    },

    get isRunning() {
      if (!consumingRunQ) return false;
      return !!status;
    },

    environment,
    run,
    getApi,
    getState,
    getActivityById,
    getPostponed,
    getProcesses,
    getExecutableProcesses,
    getProcessById,
    recover,
    resume,
    stop
  };
  const {
    broker,
    on,
    once,
    waitFor,
    emit,
    emitFatal
  } = (0, _EventBroker.DefinitionBroker)(definitionApi, onBrokerReturn);
  definitionApi.on = on;
  definitionApi.once = once;
  definitionApi.waitFor = waitFor;
  definitionApi.emit = emit;
  definitionApi.emitFatal = emitFatal;
  const runQ = broker.getQueue('run-q');
  const executionQ = broker.getQueue('execution-q');
  Object.defineProperty(definitionApi, 'broker', {
    enumerable: true,
    get: () => broker
  });
  Object.defineProperty(definitionApi, 'stopped', {
    enumerable: true,
    get: () => execution && execution.stopped
  });
  return definitionApi;

  function run(callback) {
    if (definitionApi.isRunning) {
      const err = new Error('definition is already running');
      if (callback) return callback(err);
      throw err;
    }

    deactivateRunConsumers();
    addConsumerCallbacks(callback);
    executionId = (0, _shared.getUniqueId)(id);
    broker.publish('run', 'run.enter', createMessage({
      executionId,
      state: 'enter'
    }));
    broker.publish('run', 'run.start', createMessage({
      executionId,
      state: 'start'
    }));
    broker.publish('run', 'run.execute', createMessage({
      executionId,
      state: 'execute'
    }));
    activateRunConsumers();
  }

  function resume(callback) {
    if (definitionApi.isRunning) {
      const err = new Error('cannot resume running definition');
      if (callback) return callback(err);
      throw err;
    }

    stopped = false;
    if (!status) return definitionApi;
    addConsumerCallbacks(callback);
    const content = createMessage({
      executionId
    });
    broker.publish('run', 'run.resume', content, {
      persistent: false
    });
    activateRunConsumers();
    return definitionApi;
  }

  function addConsumerCallbacks(callback) {
    if (!callback) return;
    broker.off('return', onBrokerReturn);
    clearConsumers();
    broker.subscribeOnce('event', 'definition.stop', cbLeave, {
      consumerTag: 'ctag-cb-stop'
    });
    broker.subscribeOnce('event', 'definition.leave', cbLeave, {
      consumerTag: 'ctag-cb-leave'
    });
    broker.subscribeOnce('event', 'definition.error', cbError, {
      consumerTag: 'ctag-cb-error'
    });

    function cbLeave(_, message) {
      clearConsumers();
      return callback(null, getApi(message));
    }

    function cbError(_, message) {
      clearConsumers();
      reset();
      const err = (0, _Errors.makeErrorFromMessage)(message);
      return callback(err);
    }

    function clearConsumers() {
      broker.cancel('ctag-cb-stop');
      broker.cancel('ctag-cb-leave');
      broker.cancel('ctag-cb-error');
      broker.on('return', onBrokerReturn);
    }
  }

  function stop() {
    if (!definitionApi.isRunning) return;
    stopped = true;

    if (!execution || execution.completed) {
      deactivateRunConsumers();
      return publishEvent('stop');
    }

    execution.stop();
  }

  function createMessage(override = {}) {
    return {
      id,
      type,
      ...override
    };
  }

  function recover(state) {
    if (definitionApi.isRunning) throw new Error('cannot recover running definition');
    if (!state) return definitionApi;
    stopped = state.stopped;
    status = state.status;
    executionId = state.executionId;

    if (state.counters) {
      counters = { ...counters,
        ...state.counters
      };
    }

    if (state.execution) {
      execution = (0, _DefinitionExecution.default)(definitionApi, context).recover(state.execution);
    }

    broker.recover(state.broker);
    return definitionApi;
  }

  function onBrokerReturn(message) {
    if (message.properties.type === 'error') {
      deactivateRunConsumers();
      const err = (0, _Errors.makeErrorFromMessage)(message);
      throw err;
    }
  }

  function onRunMessage(routingKey, message) {
    const {
      content,
      ack,
      fields
    } = message;

    if (routingKey === 'run.resume') {
      return onResumeMessage();
    }

    stateMessage = message;

    switch (routingKey) {
      case 'run.enter':
        {
          logger.debug(`<${id}> enter`);
          status = 'entered';
          if (fields.redelivered) break;
          execution = undefined;
          publishEvent('enter', content);
          break;
        }

      case 'run.start':
        {
          logger.debug(`<${id}> start`);
          status = 'start';
          publishEvent('start', content);
          break;
        }

      case 'run.execute':
        {
          status = 'executing';
          const executeMessage = (0, _messageHelper.cloneMessage)(message);

          if (fields.redelivered && !execution) {
            executeMessage.fields.redelivered = undefined;
          }

          postponedMessage = message;
          executionQ.assertConsumer(onExecutionMessage, {
            exclusive: true,
            consumerTag: '_definition-execution'
          });
          execution = execution || (0, _DefinitionExecution.default)(definitionApi, context);
          return execution.execute(executeMessage);
        }

      case 'run.error':
        {
          publishEvent('error', content);
          break;
        }

      case 'run.end':
        {
          if (status === 'end') break;
          counters.completed++;
          logger.debug(`<${id}>`, 'completed');
          status = 'end';
          broker.publish('run', 'run.leave', content);
          publishEvent('end', content);
          break;
        }

      case 'run.discarded':
        {
          if (status === 'discarded') break;
          counters.discarded++;
          status = 'discarded';
          broker.publish('run', 'run.leave', content);
          break;
        }

      case 'run.leave':
        {
          status = undefined;
          ack();
          publishEvent('leave');
          break;
        }
    }

    ack();

    function onResumeMessage() {
      message.ack();

      switch (stateMessage.fields.routingKey) {
        case 'run.enter':
        case 'run.start':
        case 'run.discarded':
        case 'run.end':
        case 'run.leave':
          break;

        default:
          return;
      }

      if (!stateMessage.fields.redelivered) return;
      logger.debug(`<${id}> resume from ${status}`);
      return broker.publish('run', stateMessage.fields.routingKey, (0, _messageHelper.cloneContent)(stateMessage.content), stateMessage.properties);
    }
  }

  function onExecutionMessage(routingKey, message) {
    const content = message.content;
    const messageType = message.properties.type;
    message.ack();

    switch (messageType) {
      case 'stopped':
        {
          deactivateRunConsumers();
          return publishEvent('stop');
        }

      case 'error':
        {
          broker.publish('run', 'run.error', content);
          broker.publish('run', 'run.discarded', content);
          break;
        }

      default:
        {
          broker.publish('run', 'run.end', content);
        }
    }

    if (postponedMessage) {
      const ackMessage = postponedMessage;
      postponedMessage = null;
      ackMessage.ack();
    }
  }

  function publishEvent(action, content = {}) {
    if (!action) return;
    const msgOpts = {
      type: action,
      mandatory: action === 'error'
    };
    broker.publish('event', `definition.${action}`, execution ? execution.createMessage(content) : content, msgOpts);
  }

  function getState() {
    return createMessage({
      executionId,
      status,
      stopped,
      counters: { ...counters
      },
      environment: environment.getState(),
      execution: execution && execution.getState(),
      broker: broker.getState()
    });
  }

  function getProcesses() {
    if (!processes) loadProcesses();
    return processes;
  }

  function getExecutableProcesses() {
    if (!processes) loadProcesses();
    return executableProcesses;
  }

  function getProcessById(processId) {
    return getProcesses().find(p => p.id === processId);
  }

  function loadProcesses() {
    if (processes) return processes;
    executableProcesses = context.getExecutableProcesses() || [];
    processes = context.getProcesses() || [];
    logger.debug(`<${id}> found ${processes.length} processes`);
  }

  function getActivityById(childId) {
    let child;
    const siblings = getProcesses();

    for (let i = 0; i < siblings.length; i++) {
      child = siblings[i].getActivityById(childId);
      if (child) return child;
    }

    return child;
  }

  function getPostponed() {
    if (!execution) return [];
    return execution.getPostponed();
  }

  function getApi(message) {
    if (execution) return execution.getApi(message);
    return (0, _Api.DefinitionApi)(broker, message);
  }

  function activateRunConsumers() {
    consumingRunQ = true;
    broker.subscribeTmp('api', `definition.*.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: '_definition-api'
    });
    runQ.assertConsumer(onRunMessage, {
      exclusive: true,
      consumerTag: '_definition-run'
    });
  }

  function deactivateRunConsumers() {
    broker.cancel('_definition-api');
    broker.cancel('_definition-run');
    broker.cancel('_definition-execution');
    consumingRunQ = false;
  }

  function onApiMessage(routingKey, message) {
    const messageType = message.properties.type;

    switch (messageType) {
      case 'stop':
        {
          stop();
          break;
        }
    }
  }

  function reset() {
    executionId = undefined;
    deactivateRunConsumers();
    runQ.purge();
    executionQ.purge();
  }
}