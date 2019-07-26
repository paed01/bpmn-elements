import {DefinitionApi} from '../Api';
import {cloneContent, cloneMessage, pushParent} from '../messageHelper';
import getPropertyValue from '../getPropertyValue';

export default function DefinitionExecution(definition) {
  const {id, type, broker, logger, environment} = definition;

  const processes = definition.getProcesses();
  const processIds = processes.map(({id: childId}) => childId);
  const executableProcesses = definition.getExecutableProcesses();

  const postponed = [];
  broker.assertExchange('execution', 'topic', {autoDelete: false, durable: true});

  let activityQ, status = 'init', executionId, stopped, activated, initMessage, completed = false;

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
    get isRunning() {
      if (activated) return true;
      return false;
    },
    processes,
    createMessage,
    getApi,
    getState,
    getPostponed,
    execute,
    resume,
    recover,
    stop,
  };

  Object.defineProperty(definitionExecution, 'stopped', {
    enumerable: true,
    get: () => stopped,
  });

  return definitionExecution;

  function execute(executeMessage) {
    if (!executeMessage) throw new Error('Definition execution requires message');
    if (!executeMessage.content || !executeMessage.content.executionId) throw new Error('Definition execution requires execution id');

    const isRedelivered = executeMessage.fields.redelivered;
    executionId = executeMessage.content.executionId;

    initMessage = cloneMessage(executeMessage);
    initMessage.content = {...initMessage.content, executionId, state: 'start'};

    stopped = false;

    activityQ = broker.assertQueue(`execute-${executionId}-q`, {durable: true, autoDelete: false});

    if (isRedelivered) {
      return resume();
    }

    logger.debug(`<${executionId} (${id})> execute definition`);
    activate();
    start();
    return true;
  }

  function resume() {
    logger.debug(`<${executionId} (${id})> resume`, status, 'definition execution');

    if (completed) return complete('completed');

    activate();
    postponed.splice(0);
    activityQ.consume(onProcessMessage, {prefetch: 1000, consumerTag: `_definition-activity-${executionId}`});

    if (completed) return complete('completed');
    switch (status) {
      case 'init':
        return start();
      case 'executing': {
        if (!postponed.length) return complete('completed');
        break;
      }
    }

    processes.forEach((p) => p.resume());
  }

  function start() {
    if (!processes.length) {
      return publishCompletionMessage('completed');
    }
    if (!executableProcesses.length) {
      deactivate();
      return definition.emitFatal(new Error('No executable process'));
    }

    status = 'start';

    executableProcesses.forEach((p) => p.init());
    executableProcesses.forEach((p) => p.run());

    postponed.splice(0);
    activityQ.assertConsumer(onProcessMessage, {prefetch: 1000, consumerTag: `_definition-activity-${executionId}`});
  }

  function recover(state) {
    if (!state) return definitionExecution;
    executionId = state.executionId;

    stopped = state.stopped;
    completed = state.completed;
    status = state.status;

    logger.debug(`<${executionId} (${id})> recover`, status, 'definition execution');

    state.processes.forEach((processState) => {
      const instance = definition.getProcessById(processState.id);
      if (!instance) return;

      instance.recover(processState);
    });

    return definitionExecution;
  }

  function stop() {
    getApi().stop();
  }

  function activate() {
    broker.subscribeTmp('api', '#', onApiMessage, {noAck: true, consumerTag: '_definition-api-consumer'});

    processes.forEach((p) => {
      p.broker.subscribeTmp('message', 'message.outbound', onMessageOutbound, {noAck: true, consumerTag: '_definition-message-consumer'});
      p.broker.subscribeTmp('event', 'activity.signal', onDelegateMessage, {noAck: true, consumerTag: '_definition-signal-consumer', priority: 200});
      p.broker.subscribeTmp('event', '#', onEvent, {noAck: true, consumerTag: '_definition-activity-consumer', priority: 100});
    });

    activated = true;

    function onEvent(routingKey, originalMessage) {
      const message = cloneMessage(originalMessage);
      const content = message.content;
      const parent = content.parent = content.parent || {};

      const isDirectChild = processIds.indexOf(content.id) > -1;
      if (isDirectChild) {
        parent.executionId = executionId;
      } else {
        content.parent = pushParent(parent, {id, type, executionId});
      }

      broker.publish('event', routingKey, content, {...message.properties, mandatory: false});
      if (!isDirectChild) return;

      activityQ.queueMessage(message.fields, cloneContent(content), message.properties);
    }
  }

  function deactivate() {
    broker.cancel('_definition-api-consumer');
    broker.cancel(`_definition-activity-${executionId}`);

    processes.forEach((p) => {
      p.broker.cancel('_definition-message-consumer');
      p.broker.cancel('_definition-activity-consumer');
      p.broker.cancel('_definition-signal-consumer');
    });

    activated = false;
  }

  function onProcessMessage(routingKey, message) {
    const content = message.content;
    const isRedelivered = message.fields.redelivered;
    const {id: childId, type: activityType, executionId: childExecutionId} = content;

    if (isRedelivered && message.properties.persistent === false) return;

    switch (routingKey) {
      case 'execution.stop': {
        if (childExecutionId === executionId) {
          message.ack();
          return onStopped();
        }
        break;
      }
      case 'process.leave': {
        return onChildCompleted();
      }
    }

    stateChangeMessage(true);

    switch (routingKey) {
      case 'process.discard':
      case 'process.enter':
        status = 'executing';
        break;
      case 'process.error': {
        processes.slice().forEach((p) => {
          if (p.id !== childId) p.stop();
        });
        complete('error', {error: content.error});
        break;
      }
    }

    function stateChangeMessage(postponeMessage = true) {
      const previousMsg = popPostponed(childId);
      if (previousMsg) previousMsg.ack();
      if (postponeMessage) postponed.push(message);
    }

    function popPostponed(postponedId) {
      const idx = postponed.findIndex((msg) => msg.content.id === postponedId);
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
      processes.slice().forEach((p) => {
        p.stop();
      });
      stopped = true;
      return broker.publish('execution', `execution.stopped.${executionId}`, {
        ...initMessage.content,
        ...content,
      }, {type: 'stopped', persistent: false});
    }
  }

  function onApiMessage(routingKey, message) {
    const messageType = message.properties.type;
    const delegate = message.properties.delegate;

    if (delegate && id === message.content.id) {
      const referenceId = getPropertyValue(message, 'content.message.id');
      for (const bp of processes) {
        if (bp.isRunning) continue;
        if (bp.getStartActivities({referenceId, referenceType: messageType}).length) {
          logger.debug(`<${executionId} (${id})> start <${bp.id}>`);
          bp.run();
        }
      }
    }

    if (message.properties.delegate) {
      for (const bp of processes) {
        bp.broker.publish('api', routingKey, cloneContent(message.content), message.properties);
      }
    }

    if (executionId !== message.content.executionId) return;

    switch (messageType) {
      case 'stop':
        activityQ.queueMessage({routingKey: 'execution.stop'}, cloneContent(message.content), {persistent: false});
        break;
    }
  }

  function getState() {
    return {
      executionId,
      stopped,
      completed,
      processes: processes.map((p) => p.getState()),
    };
  }

  function getPostponed(...args) {
    return processes.reduce((result, p) => {
      result = result.concat(p.getPostponed(...args));
      return result;
    }, []);
  }

  function complete(completionType, content) {
    deactivate();
    logger.debug(`<${executionId} (${id})> definition execution ${completionType}`);
    if (!content) content = createMessage();
    completed = true;
    if (status !== 'terminated') status = completionType;
    broker.deleteQueue(activityQ.name);

    return broker.publish('execution', `execution.${completionType}.${executionId}`, {
      ...initMessage.content,
      output: environment.output,
      ...content,
      state: completionType,
    }, {type: completionType, mandatory: completionType === 'error'});
  }

  function onMessageOutbound(routingKey, message) {
    const content = message.content;
    const {target, source} = content;

    logger.debug(`<${executionId} (${id})> conveying message from <${source.processId}.${source.id}> to <${target.processId}.${target.id}>`);

    const targetProcess = getProcessById(target.processId);

    targetProcess.sendMessage(content);
  }

  function onDelegateMessage(routingKey, executeMessage) {
    const content = executeMessage.content;
    const messageType = executeMessage.properties.type;
    const delegateMessage = executeMessage.content.message;

    const reference = definition.getElementById(delegateMessage.id);
    const message = reference && reference.resolve(executeMessage);

    logger.debug(`<${executionId} (${id})>`, reference ? `${messageType} <${delegateMessage.id}>` : `anonymous ${messageType}`, `event received from <${content.parent.id}.${content.id}>. Delegating.`);

    getApi().sendApiMessage(messageType, {
      message,
    }, {delegate: true, type: messageType});

    broker.publish('event', `definition.${messageType}`, createMessage({
      message: message && cloneContent(message),
    }), {type: messageType});
  }

  function getProcessById(processId) {
    return processes.find((p) => p.id === processId);
  }

  function publishCompletionMessage(completionType, content) {
    deactivate();
    logger.debug(`<${executionId} (${id})> ${completionType}`);
    if (!content) content = createMessage();
    return broker.publish('execution', `execution.${completionType}.${executionId}`, content, { type: completionType });
  }

  function createMessage(content = {}) {
    return {
      id,
      type,
      executionId,
      status,
      ...content,
    };
  }

  function getApi(apiMessage) {
    if (!apiMessage) apiMessage = initMessage;

    const content = apiMessage.content;
    if (content.executionId !== executionId) {
      return getProcessApi(apiMessage);
    }

    const api = DefinitionApi(broker, apiMessage);

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
