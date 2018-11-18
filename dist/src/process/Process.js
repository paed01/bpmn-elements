"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Process = Process;
exports.default = void 0;

var _ProcessExecution = _interopRequireDefault(require("./ProcessExecution"));

var _shared = require("../shared");

var _Api = require("../Api");

var _EventBroker = require("../EventBroker");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _default = Process;
exports.default = _default;

function Process(processDef, context) {
  const {
    id,
    type = 'process',
    name,
    parent,
    behaviour = {}
  } = processDef;
  const environment = context.environment;
  const {
    isExecutable
  } = behaviour;
  const logger = environment.Logger(type.toLowerCase());
  let execution, executionId, status, stopped, postponedMessage;
  let counters = {
    completed: 0,
    discarded: 0,
    terminated: 0
  };
  const processApi = {
    id,
    type,
    name,
    isExecutable,
    behaviour,

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

    get stopped() {
      return stopped;
    },

    get execution() {
      return execution;
    },

    context,
    environment,
    activate,
    deactivate,
    logger,
    getApi,
    getActivities,
    getActivityById,
    getSequenceFlows,
    getPostponed,
    getState,
    recover,
    resume,
    run,
    sendMessage,
    signal,
    stop
  };
  const {
    broker,
    on,
    once,
    waitFor
  } = (0, _EventBroker.ProcessBroker)(processApi);
  processApi.on = on;
  processApi.once = once;
  processApi.waitFor = waitFor;
  const runQ = broker.getQueue('run-q');
  const executionQ = broker.getQueue('execution-q');
  Object.defineProperty(processApi, 'broker', {
    enumerable: true,
    get: () => broker
  });
  return processApi;

  function run() {
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
    runQ.assertConsumer(onRunMessage, {
      exclusive: true,
      consumerTag: '_process-run'
    });
    executionQ.assertConsumer(onExecutionMessage, {
      exclusive: true,
      consumerTag: '_process-execution'
    });
  }

  function createMessage(override = {}) {
    return {
      id,
      type,
      parent: { ...parent
      },
      ...override
    };
  }

  function getState() {
    return createMessage({
      status,
      stopped,
      counters: { ...counters
      },
      broker: broker.getState(),
      execution: execution && execution.getState()
    });
  }

  function recover(state) {
    if (!state) return processApi;
    stopped = state.stopped;
    status = state.status;

    if (state.counters) {
      counters = { ...counters,
        ...state.counters
      };
    }

    if (state.execution) {
      execution = (0, _ProcessExecution.default)(processApi, context).recover(state.execution);
    }

    broker.recover(state.broker);
    return processApi;
  }

  function stop() {
    if (!status) return;
    stopped = true;
    deactivate();
    broker.cancel('_process-run');
    broker.cancel('_process-execution');
    if (execution) execution.stop();
    if (status) publishEvent('stop');
  }

  function resume() {
    if (!status) return activate();
    stopped = false;
    runQ.assertConsumer(onRunMessage, {
      exclusive: true,
      consumerTag: '_process-run'
    });
    executionQ.assertConsumer(onExecutionMessage, {
      exclusive: true,
      consumerTag: '_process-execution'
    });
  }

  function getApi(message) {
    if (execution) return execution.getApi(message);
    return (0, _Api.ProcessApi)(broker, message);
  }

  function onRunMessage(routingKey, message) {
    const {
      content,
      ack
    } = message;

    switch (routingKey) {
      case 'run.enter':
        {
          logger.debug(`<${id}> enter`);
          status = 'entered';
          execution = undefined;
          publishEvent('enter', content);
          break;
        }

      case 'run.discard':
        {
          logger.debug(`<${id}> discarded`);
          status = 'discard';
          execution = undefined;
          execution.discard();
          publishEvent('discard', content);
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
          postponedMessage = message;
          execution = execution || (0, _ProcessExecution.default)(processApi, context);
          return execution.execute(message);
        }

      case 'run.error':
        {
          publishEvent('error', content);
          break;
        }

      case 'run.end':
        {
          if (status === 'end') break;
          logger.debug(`<${id}> completed`);
          counters.completed++;
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
          publishEvent('leave');
          break;
        }
    }

    ack();
  }

  function onExecutionMessage(routingKey, message) {
    const content = message.content;
    const messageType = message.properties.type;
    message.ack();

    switch (messageType) {
      case 'error':
        {
          broker.publish('run', 'run.error', content);
          broker.publish('run', 'run.discarded', content);
          break;
        }

      case 'discard':
        broker.publish('run', 'run.discarded', content);
        break;

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

  function publishEvent(state, content) {
    if (!state) return;
    if (!content) content = createMessage();
    broker.publish('event', `process.${state}`, { ...content,
      state
    }, {
      type: state,
      mandatory: state === 'error'
    });
  }

  function activate() {
    return processApi;
  }

  function sendMessage(messageContent) {
    const activity = getActivityById(messageContent.target.id);
    if (!activity) return logger.debug(`<${id}> message delivery canceled, <${messageContent.target.id}> not found`);
    if (!status) run();
    logger.debug(`<${id}> got message to <${messageContent.target.id}>`);
    activity.message(messageContent);
  }

  function getActivityById(childId) {
    if (execution) return execution.getActivityById(childId);
    return context.getActivityById(childId);
  }

  function getActivities() {
    if (execution) return execution.getActivities();
    return context.getActivities();
  }

  function getSequenceFlows() {
    if (execution) return execution.getSequenceFlows();
    return context.getSequenceFlows();
  }

  function getPostponed() {
    if (execution) return execution.getPostponed();
    return [];
  }

  function signal(childId, ...args) {
    if (!execution) return;
    return execution.signal(childId, ...args);
  }

  function deactivate() {
    if (execution) execution.deactivate();
  }
}