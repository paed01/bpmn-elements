"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = DefinitionExecution;

var _Api = require("../Api");

var _messageHelper = require("../messageHelper");

var _getPropertyValue = _interopRequireDefault(require("../getPropertyValue"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function DefinitionExecution(definition) {
  const {
    id,
    type,
    broker,
    logger,
    environment
  } = definition;
  const processes = definition.getProcesses();
  const processIds = processes.map(({
    id: childId
  }) => childId);
  const executableProcesses = definition.getExecutableProcesses();
  const postponed = [];
  let activityQ,
      executionId,
      initMessage,
      stopped,
      status = 'init',
      completed = false;
  broker.assertExchange('execution', 'topic', {
    autoDelete: false,
    durable: true
  });
  const definitionExecution = {
    id,
    type,
    broker,

    get environment() {
      return environment;
    },

    get executionId() {
      return executionId;
    },

    get completed() {
      return completed;
    },

    get status() {
      return status;
    },

    get stopped() {
      return stopped;
    },

    get postponedCount() {
      return postponed.length;
    },

    processes,
    createMessage,
    getApi,
    getState,
    getPostponed,
    execute,
    resume,
    recover,
    stop
  };
  Object.defineProperty(definitionExecution, 'stopped', {
    enumerable: true,
    get: () => stopped
  });
  return definitionExecution;

  function execute(executeMessage) {
    if (!executeMessage) throw new Error('Definition execution requires message');
    const content = executeMessage.content;
    executionId = content.executionId;
    if (!executionId) throw new Error('Definition execution requires execution id');
    stopped = false;
    const executeContent = { ...content,
      executionId,
      state: 'start'
    };
    initMessage = { ...executeMessage,
      content: executeContent
    };
    activityQ = broker.assertQueue(`execute-${executionId}-q`, {
      durable: true,
      autoDelete: false
    });
    if (executeMessage.fields.redelivered) return resume(executeMessage);
    start();
    return true;
  }

  function resume() {
    logger.debug(`<${executionId} (${id})> resume definition execution`);
    if (completed) return complete('completed');
    activate();
    postponed.splice(0);
    activityQ.consume(onChildEvent, {
      prefetch: 1000
    });
    processes.forEach(p => p.resume());
  }

  function start() {
    if (!processes.length) {
      return publishCompletionMessage('completed');
    }

    if (!executableProcesses.length) return definition.emitFatal(new Error('No executable process'));
    status = 'start';
    activate();
    executableProcesses.forEach(prepareProcess);
    executableProcesses.forEach(p => p.run());
    activityQ.consume(onChildEvent, {
      prefetch: 1000
    });
  }

  function prepareProcess(process) {
    activityQ.queueMessage({
      routingKey: 'process.init'
    }, {
      id: process.id,
      type: process.type,
      parent: {
        id,
        executionId,
        type
      }
    });
  }

  function stop() {
    status = 'stop';
    return activityQ.queueMessage({
      routingKey: 'execution.stop'
    }, {
      id,
      type,
      executionId
    }, {
      type: 'stop',
      persistent: false
    });
  }

  function getState() {
    return {
      executionId,
      stopped,
      completed,
      processes: processes.map(p => p.getState())
    };
  }

  function recover(state) {
    if (!state) return definitionExecution;
    executionId = state.executionId;
    stopped = state.stopped;
    completed = state.completed;
    logger.debug(`<${executionId} (${id})> recover definition execution`);
    state.processes.forEach(processState => {
      const instance = definition.getProcessById(processState.id);
      if (!instance) return;
      instance.recover(processState);
    });
    return definitionExecution;
  }

  function getPostponed(...args) {
    return processes.reduce((result, p) => {
      result = result.concat(p.getPostponed(...args));
      return result;
    }, []);
  }

  function activate() {
    processes.forEach(p => {
      p.broker.subscribeTmp('message', 'message.outbound', onMessageOutbound, {
        noAck: true,
        consumerTag: '_definition-message-consumer'
      });
      p.broker.subscribeTmp('event', 'activity.signal', onThrowSignal, {
        noAck: true,
        consumerTag: '_definition-signal-consumer',
        priority: 200
      });
      p.broker.subscribeTmp('event', '#', onEvent, {
        noAck: true,
        consumerTag: '_definition-activity-consumer',
        priority: 100
      });
    });
    broker.subscribeTmp('api', '#', onApiMessage, {
      noAck: true,
      consumerTag: '_definition-api-consumer'
    });

    function onEvent(routingKey, originalMessage) {
      const message = (0, _messageHelper.cloneMessage)(originalMessage);
      const content = message.content;
      const parent = content.parent = content.parent || {};
      const isDirectChild = processIds.indexOf(content.id) > -1;

      if (isDirectChild) {
        parent.executionId = executionId;
      } else {
        content.parent = (0, _messageHelper.pushParent)(parent, {
          id,
          type,
          executionId
        });
      }

      broker.publish('event', routingKey, content, { ...message.properties,
        mandatory: false
      });
      if (!isDirectChild) return;
      activityQ.queueMessage(message.fields, (0, _messageHelper.cloneContent)(content), message.properties);
    }
  }

  function deactivate() {
    broker.cancel('_definition-api-consumer');
    processes.forEach(p => {
      p.broker.cancel('_definition-message-consumer');
      p.broker.cancel('_definition-activity-consumer');
      p.broker.cancel('_definition-signal-consumer');
    });
  }

  function complete(completionType, content = {}) {
    deactivate();
    logger.debug(`<${executionId} (${id})> definition execution ${completionType}`);
    if (!content) content = createMessage();
    completed = true;
    if (status !== 'terminated') status = completionType;
    broker.deleteQueue(activityQ.name);
    return broker.publish('execution', `execution.${completionType}.${executionId}`, { ...initMessage.content,
      output: environment.output,
      ...content,
      state: completionType
    }, {
      type: completionType,
      mandatory: completionType === 'error'
    });
  }

  function onChildEvent(routingKey, message) {
    const content = message.content;
    const isRedelivered = message.fields.redelivered;
    const {
      id: childId,
      type: activityType,
      executionId: childExecutionId
    } = content;

    if (routingKey === 'execution.stop' && childExecutionId === executionId) {
      message.ack();
      return onStopped();
    }

    if (routingKey === 'process.leave') {
      return onChildCompleted();
    }

    stateChangeMessage(true);

    switch (routingKey) {
      case 'process.error':
        {
          processes.slice().forEach(p => {
            if (p.id !== childId) p.stop();
          });
          complete('error', {
            error: content.error
          });
          break;
        }
    }

    function stateChangeMessage(postponeMessage = true) {
      const previousMsg = popPostponed(childId);
      if (previousMsg) previousMsg.ack();
      if (postponeMessage) postponed.push(message);
    }

    function popPostponed(postponedId) {
      const idx = postponed.findIndex(msg => msg.content.id === postponedId);

      if (idx > -1) {
        return postponed.splice(idx, 1)[0];
      }
    }

    function onChildCompleted() {
      stateChangeMessage(false);
      if (isRedelivered) return message.ack();
      logger.debug(`<${executionId} (${id})> left <${childId}> (${activityType}), pending runs ${postponed.length}`);

      if (!postponed.length) {
        message.ack();
        complete('completed');
      }
    }

    function onStopped() {
      logger.debug(`<${executionId} (${id})> stop definition execution (stop process executions ${postponed.length})`);
      activityQ.close();
      deactivate();
      processes.slice().forEach(p => {
        p.stop();
      });
      stopped = true;
      return broker.publish('execution', `execution.stopped.${executionId}`, { ...initMessage.content,
        ...content
      }, {
        type: 'stopped',
        persistent: false
      });
    }
  }

  function onMessageOutbound(routingKey, message) {
    const content = message.content;
    const {
      target,
      source
    } = content;
    logger.debug(`<${executionId} (${id})> conveying message from <${source.processId}.${source.id}> to <${target.processId}.${target.id}>`);
    const targetProcess = getProcessById(target.processId);
    targetProcess.sendMessage(content);
  }

  function onThrowSignal(routingKey, message) {
    const content = message.content;
    const signalMessage = message.content.message;
    logger.debug(`<${executionId} (${id})> signal <${signalMessage.id}> received from <${content.parent.id}.${content.id}>. Delegating.`);
    getApi().signal({ ...signalMessage
    }, {
      delegate: true
    });
  }

  function onApiMessage(routingKey, message) {
    const messageType = message.properties.type;

    if (id === message.content.id && messageType === 'signal') {
      const signalId = (0, _getPropertyValue.default)(message, 'content.message.id');

      for (const bp of processes) {
        if (bp.isRunning) continue;

        if (bp.getStartActivities(signalId).length) {
          logger.debug(`<${executionId} (${id})> start <${bp.id}>`);
          bp.run();
        }
      }
    }

    if (message.properties.delegate) {
      for (const bp of processes) {
        bp.broker.publish('api', routingKey, (0, _messageHelper.cloneContent)(message.content), message.properties);
      }
    }
  }

  function getProcessById(processId) {
    return processes.find(p => p.id === processId);
  }

  function publishCompletionMessage(completionType, content) {
    deactivate();
    logger.debug(`<${executionId} (${id})> ${completionType}`);
    if (!content) content = createMessage();
    return broker.publish('execution', `execution.${completionType}.${executionId}`, content, {
      type: completionType
    });
  }

  function createMessage(content = {}) {
    return {
      id,
      type,
      executionId,
      status,
      ...content
    };
  }

  function getApi(apiMessage) {
    if (!apiMessage) apiMessage = initMessage;
    const content = apiMessage.content;

    if (content.executionId !== executionId) {
      return getProcessApi(apiMessage);
    }

    const api = (0, _Api.DefinitionApi)(broker, apiMessage);

    api.getExecuting = function getExecuting() {
      return postponed.reduce((result, msg) => {
        if (msg.content.executionId === content.executionId) return result;
        result.push(getApi(msg));
        return result;
      }, []);
    };

    return api;
  }

  function getProcessApi(message) {
    const content = message.content;
    let api = getApiByProcessId(content.id);
    if (api) return api;
    if (!content.parent) return;
    api = getApiByProcessId(content.parent.id);
    if (api) return api;
    if (!content.parent.path) return;

    for (let i = 0; i < content.parent.path.length; i++) {
      api = getApiByProcessId(content.parent.path[i].id);
      if (api) return api;
    }

    function getApiByProcessId(parentId) {
      const processInstance = getProcessById(parentId);
      if (!processInstance) return;
      return processInstance.getApi(message);
    }
  }
}