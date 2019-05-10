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
  let execution, executionId, status, stopped, postponedMessage, stateMessage, consumingRunQ;
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
    if (processApi.isRunning) throw new Error('process is already running');
    deactivateRunConsumers();
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
      executionId,
      status,
      stopped,
      counters: { ...counters
      },
      broker: broker.getState(),
      execution: execution && execution.getState()
    });
  }

  function stop() {
    if (!status) return;
    stopped = true;
    deactivate();
    deactivateRunConsumers();
    if (execution) execution.stop();
    if (status) publishEvent('stop');
  }

  function recover(state) {
    if (processApi.isRunning) throw new Error('cannot recover running process');
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

  function resume() {
    if (processApi.isRunning) throw new Error('cannot resume running process');
    if (!status) return activate();
    stopped = false;
    const content = createMessage({
      executionId
    });
    broker.publish('run', 'run.resume', content, {
      persistent: false
    });
    activateRunConsumers();
  }

  function getApi(message) {
    if (execution) return execution.getApi(message);
    return (0, _Api.ProcessApi)(broker, message);
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

      if (!fields.redelivered) return;
      logger.debug(`<${id}> resume from ${status}`);
      return broker.publish('run', fields.routingKey, (0, _messageHelper.cloneContent)(stateMessage.content), stateMessage.properties);
    }
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

  function deactivate() {
    if (execution) execution.deactivate();
  }

  function activateRunConsumers() {
    consumingRunQ = true;
    broker.subscribeTmp('api', `process.*.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: '_process-api'
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
}