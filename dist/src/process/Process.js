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

var _messageHelper = require("../messageHelper");

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
  let execution, initExecutionId, executionId, status, stopped, postponedMessage, stateMessage, consumingRunQ;
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

    get isRunning() {
      if (!consumingRunQ) return false;
      return !!status;
    },

    context,
    environment,
    parent: { ...parent
    },
    logger,
    getApi,
    getActivities,
    getActivityById,
    getSequenceFlows,
    getPostponed,
    getStartActivities,
    getState,
    init,
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

  function init() {
    initExecutionId = (0, _shared.getUniqueId)(id);
    logger.debug(`<${id}> initialized with executionId <${initExecutionId}>`);
    publishEvent('init', createMessage({
      executionId: initExecutionId
    }));
  }

  function run(runContent) {
    if (processApi.isRunning) throw new Error(`process <${id}> is already running`);
    executionId = initExecutionId || (0, _shared.getUniqueId)(id);
    initExecutionId = undefined;
    const content = createMessage({ ...runContent,
      executionId
    });
    broker.publish('run', 'run.enter', content);
    broker.publish('run', 'run.start', (0, _messageHelper.cloneContent)(content));
    broker.publish('run', 'run.execute', (0, _messageHelper.cloneContent)(content));
    activateRunConsumers();
  }

  function resume() {
    if (processApi.isRunning) throw new Error(`cannot resume running process <${id}>`);
    if (!status) return processApi;
    stopped = false;
    const content = createMessage({
      executionId
    });
    broker.publish('run', 'run.resume', content, {
      persistent: false
    });
    activateRunConsumers();
    return processApi;
  }

  function recover(state) {
    if (processApi.isRunning) throw new Error(`cannot recover running process <${id}>`);
    if (!state) return processApi;
    stopped = state.stopped;
    status = state.status;
    executionId = state.executionId;

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

  function activateRunConsumers() {
    consumingRunQ = true;
    broker.subscribeTmp('api', `process.*.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: '_process-api',
      priority: 100
    });
    runQ.assertConsumer(onRunMessage, {
      exclusive: true,
      consumerTag: '_process-run'
    });
  }

  function deactivateRunConsumers() {
    broker.cancel('_process-api');
    broker.cancel('_process-run');
    broker.cancel('_process-execution');
    consumingRunQ = false;
  }

  function stop() {
    if (!processApi.isRunning) return;
    getApi().stop();
  }

  function getApi(message) {
    if (execution) return execution.getApi(message);
    return (0, _Api.ProcessApi)(broker, message || stateMessage);
  }

  function signal(message) {
    return getApi().signal(message, {
      delegate: true
    });
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
            consumerTag: '_process-execution'
          });
          execution = execution || (0, _ProcessExecution.default)(processApi, context);
          return execution.execute(executeMessage);
        }

      case 'run.error':
        {
          publishEvent('error', content);
          break;
        }

      case 'run.end':
        {
          status = 'end';
          if (fields.redelivered) break;
          logger.debug(`<${id}> completed`);
          counters.completed++;
          broker.publish('run', 'run.leave', content);
          publishEvent('end', content);
          break;
        }

      case 'run.discarded':
        {
          status = 'discarded';
          if (fields.redelivered) break;
          counters.discarded++;
          broker.publish('run', 'run.leave', content);
          break;
        }

      case 'run.leave':
        {
          status = undefined;
          broker.cancel('_process-api');
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
          return onStop();
        }

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
    if (!content) content = createMessage();
    broker.publish('event', `process.${state}`, { ...content,
      state
    }, {
      type: state,
      mandatory: state === 'error'
    });
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
    return context.getActivities(id);
  }

  function getStartActivities(filterOptions) {
    return context.getStartActivities(filterOptions, id);
  }

  function getSequenceFlows() {
    if (execution) return execution.getSequenceFlows();
    return context.getSequenceFlows();
  }

  function getPostponed(...args) {
    if (execution) return execution.getPostponed(...args);
    return [];
  }

  function onApiMessage(routingKey, message) {
    const messageType = message.properties.type;

    switch (messageType) {
      case 'stop':
        {
          if (execution && !execution.completed) return;
          onStop();
          break;
        }
    }
  }

  function onStop() {
    stopped = true;
    deactivateRunConsumers();
    return publishEvent('stop');
  }

  function createMessage(override = {}) {
    return {
      id,
      type,
      name,
      parent: { ...parent
      },
      ...override
    };
  }

  function getState() {
    return createMessage({
      executionId,
      status,
      stopped,
      counters: { ...counters
      },
      broker: broker.getState(),
      execution: execution && execution.getState()
    });
  }
}