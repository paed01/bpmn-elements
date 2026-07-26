import { DefinitionApi } from '../Api.js';
import { brokerSafeId } from '../shared.js';
import { cloneContent, cloneMessage, pushParent, cloneParent } from '../messageHelper.js';
import { K_ACTIVATED, K_COMPLETED, K_EXECUTE_MESSAGE, K_MESSAGE_HANDLERS, K_STATUS, K_STOPPED, K_PARENT } from '../constants.js';

const K_PROCESSES_Q = Symbol.for('processesQ');
const K_PROCESSES = Symbol.for('processes');

/**
 * Drives the execution of a Definition. Activates executable processes, routes inter-process
 * delegate messages and call activity hand-offs, and rolls completion up to the Definition.
 * @param {import('./Definition.js').Definition} definition
 * @param {import('../Context.js').ContextInstance} context
 */
export function DefinitionExecution(definition, context) {
  const broker = definition.broker;

  /** @internal */
  this[K_PARENT] = definition;
  this.id = definition.id;
  this.type = definition.type;
  this.broker = broker;
  const environment = (this.environment = definition.environment);
  this.context = context;

  const processes = context.getProcesses();
  /** @type {Set<string>} */
  const ids = new Set();
  /** @type {Set<import('../process/Process.js').Process>} */
  const executable = new Set();
  for (const bp of processes) {
    bp.environment.assignVariables(environment.variables);
    bp.environment.assignSettings(environment.settings);
    ids.add(bp.id);
    if (bp.isExecutable) executable.add(bp);
  }

  /** @internal */
  this[K_PROCESSES] = {
    processes,
    ids,
    executable,
    running: new Set(),
    postponed: new Set(),
  };

  broker.assertExchange('execution', 'topic', { autoDelete: false, durable: true });

  this.executionId = undefined;
  /** @internal */
  this[K_COMPLETED] = false;
  /** @internal */
  this[K_STOPPED] = false;
  /** @internal */
  this[K_ACTIVATED] = false;
  /** @internal */
  this[K_STATUS] = 'init';
  /** @internal */
  this[K_PROCESSES_Q] = undefined;

  /** @internal */
  this[K_MESSAGE_HANDLERS] = {
    onApiMessage: this._onApiMessage.bind(this),
    onCallActivity: this._onCallActivity.bind(this),
    onCancelCallActivity: this._onCancelCallActivity.bind(this),
    onChildEvent: this._onChildEvent.bind(this),
    onDelegateMessage: this._onDelegateMessage.bind(this),
    onMessageOutbound: this._onMessageOutbound.bind(this),
    onProcessMessage: this._onProcessMessage.bind(this),
  };
  /** @internal */
  this[K_EXECUTE_MESSAGE] = undefined;
}

Object.defineProperties(DefinitionExecution.prototype, {
  stopped: {
    get() {
      return this[K_STOPPED];
    },
  },
  completed: {
    get() {
      return this[K_COMPLETED];
    },
  },
  status: {
    get() {
      return this[K_STATUS];
    },
  },
  processes: {
    get() {
      return [...this[K_PROCESSES].running];
    },
  },
  postponedCount: {
    get() {
      return this[K_PROCESSES].postponed.size;
    },
  },
  isRunning: {
    get() {
      return this[K_ACTIVATED];
    },
  },
  activityStatus: {
    get() {
      let status = 'idle';
      const running = this[K_PROCESSES].running;
      if (!running.size) return status;

      for (const bp of running) {
        const bpStatus = bp.activityStatus;
        switch (bp.activityStatus) {
          case 'idle':
            break;
          case 'executing':
            return bpStatus;
          case 'timer':
            status = bpStatus;
            break;
          case 'wait':
            if (status === 'idle') status = bpStatus;
            break;
        }
      }

      return status;
    },
  },
});

/**
 * Activate executable processes and start the definition execution. Resumes if the message
 * is redelivered. When `content.processId` is set, only that process is started.
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @throws {Error} when message or executionId is missing
 */
DefinitionExecution.prototype.execute = function execute(executeMessage) {
  if (!executeMessage) throw new Error('Definition execution requires message');
  const content = executeMessage.content;
  const executionId = (this.executionId = content.executionId);
  if (!executionId) throw new Error('Definition execution requires execution id');

  this[K_EXECUTE_MESSAGE] = cloneMessage(executeMessage, {
    executionId,
    state: 'start',
  });

  this[K_STOPPED] = false;

  this[K_PROCESSES_Q] = this.broker.assertQueue(`execute-${executionId}-q`, { durable: true, autoDelete: false });

  if (executeMessage.fields.redelivered) {
    return this.resume();
  }

  const { running, executable } = this[K_PROCESSES];

  if (content.processId) {
    const startWithProcess = this.getProcessById(content.processId);
    if (startWithProcess) {
      executable.clear();
      executable.add(startWithProcess);
    }
  }

  this._debug('execute definition');
  for (const bp of executable) {
    running.add(bp);
  }
  this._activate(executable);
  this._start();
  return true;
};

/**
 * Resume after recover by reactivating running processes.
 */
DefinitionExecution.prototype.resume = function resume() {
  this._debug(`resume ${this[K_STATUS]} definition execution`);

  if (this[K_COMPLETED]) return this._complete('completed');

  const { running, postponed } = this[K_PROCESSES];
  this._activate(running);
  postponed.clear();
  this[K_PROCESSES_Q].consume(this[K_MESSAGE_HANDLERS].onProcessMessage, {
    prefetch: 1000,
    consumerTag: `_definition-activity-${this.executionId}`,
  });

  if (this[K_COMPLETED]) return;

  for (const bp of running) bp.resume();
};

/**
 * Restore execution state captured by getState. Reinstates running processes from the snapshot.
 * @param {import('#types').DefinitionExecutionState} [state]
 * @param {number} [recoveredVersion] State version
 * @returns {this}
 */
DefinitionExecution.prototype.recover = function recover(state, recoveredVersion) {
  if (!state) return this;
  this.executionId = state.executionId;

  this[K_STOPPED] = state.stopped;
  this[K_COMPLETED] = state.completed;
  this[K_STATUS] = state.status;

  this._debug(`recover ${this[K_STATUS]} definition execution`);

  const running = this[K_PROCESSES].running;
  running.clear();

  const ids = new Set();
  for (const bpState of state.processes) {
    const bpid = bpState.id;
    let bp;
    if (ids.has(bpid)) {
      bp = this.context.getNewProcessById(bpid);
    } else {
      bp = this.getProcessById(bpid);
    }
    if (!bp) continue;

    ids.add(bpid);
    bp.recover(bpState, recoveredVersion);
    running.add(bp);
  }

  return this;
};

/**
 * Stop the running execution via the api.
 */
DefinitionExecution.prototype.stop = function stop() {
  this.getApi().stop();
};

/**
 * Get every process in the definition (running first, then any non-running by id).
 * @returns {import('../process/Process.js').Process[]}
 */
DefinitionExecution.prototype.getProcesses = function getProcesses() {
  const { running, processes } = this[K_PROCESSES];
  const result = [...running];
  for (const bp of processes) {
    if (!result.find((runningBp) => bp.id === runningBp.id)) result.push(bp);
  }
  return result;
};

/**
 * @param {string} processId
 */
DefinitionExecution.prototype.getProcessById = function getProcessById(processId) {
  return this.getProcesses().find((bp) => bp.id === processId);
};

/**
 * Get every process matching the given id (call activities can spawn duplicates).
 * @param {string} processId
 */
DefinitionExecution.prototype.getProcessesById = function getProcessesById(processId) {
  return this.getProcesses().filter((bp) => bp.id === processId);
};

/**
 * @param {string} processExecutionId
 * @returns {import('../process/Process.js').Process | undefined}
 */
DefinitionExecution.prototype.getProcessByExecutionId = function getProcessByExecutionId(processExecutionId) {
  for (const bp of this[K_PROCESSES].running) {
    if (bp.executionId === processExecutionId) return bp;
  }
};

/**
 * Get processes that have an executionId, i.e. are currently running.
 * @returns {import('../process/Process.js').Process[]}
 */
DefinitionExecution.prototype.getRunningProcesses = function getRunningProcesses() {
  return [...this[K_PROCESSES].running].filter((bp) => bp.executionId);
};

/**
 * Get processes flagged executable in the definition.
 * @returns {import('../process/Process.js').Process[]}
 */
DefinitionExecution.prototype.getExecutableProcesses = function getExecutableProcesses() {
  return [...this[K_PROCESSES].executable];
};

/**
 * Snapshot execution state for recover.
 * @returns {import('#types').DefinitionExecutionState}
 */
DefinitionExecution.prototype.getState = function getState() {
  const processes = [];
  for (const bp of this[K_PROCESSES].running) {
    processes.push(bp.getState());
  }

  return {
    executionId: this.executionId,
    stopped: this[K_STOPPED],
    completed: this[K_COMPLETED],
    status: this[K_STATUS],
    processes,
  };
};

/**
 * Resolve a Definition Api or, when the message belongs to a child process, its process Api.
 * @param {import('#types').ElementBrokerMessage} [apiMessage]
 * @returns {import('#types').IApi<import('./Definition.js').Definition>}
 */
DefinitionExecution.prototype.getApi = function getApi(apiMessage) {
  if (!apiMessage) apiMessage = this[K_EXECUTE_MESSAGE] || { content: this._createMessage() };

  const content = apiMessage.content;
  if (content.executionId !== this.executionId) {
    return this._getProcessApi(apiMessage);
  }

  const api = DefinitionApi(this.broker, apiMessage);
  const postponed = this[K_PROCESSES].postponed;
  const self = this;

  api.getExecuting = function getExecuting() {
    const apis = [];
    for (const msg of postponed) {
      const bpApi = self._getProcessApi(msg);
      if (bpApi) apis.push(bpApi);
    }
    return apis;
  };

  return api;
};

/**
 * List currently postponed activities across every running process.
 * @param  {Parameters<import('#types').Process['getPostponed']>} args
 * @returns {import('#types').IApi<import('#types').Activity>[]}
 */
DefinitionExecution.prototype.getPostponed = function getPostponed(...args) {
  let result = [];
  for (const bp of this[K_PROCESSES].running) {
    result = result.concat(bp.getPostponed(...args));
  }
  return result;
};

/** @internal */
DefinitionExecution.prototype._start = function start() {
  const { ids, executable, postponed } = this[K_PROCESSES];
  if (!ids.size) {
    return this._complete('completed');
  }

  if (!executable.size) {
    return this._complete('error', { error: new Error('No executable process') });
  }

  this[K_STATUS] = 'start';

  for (const bp of executable) bp.init();
  for (const bp of executable) bp.run();

  postponed.clear();
  this[K_PROCESSES_Q].assertConsumer(this[K_MESSAGE_HANDLERS].onProcessMessage, {
    prefetch: 1000,
    consumerTag: `_definition-activity-${this.executionId}`,
  });
};

/** @internal */
DefinitionExecution.prototype._activate = function activate(processList) {
  this.broker.subscribeTmp('api', '#', this[K_MESSAGE_HANDLERS].onApiMessage, {
    noAck: true,
    consumerTag: '_definition-api-consumer',
  });
  for (const bp of processList) this._activateProcess(bp);
  this[K_ACTIVATED] = true;
};

/** @internal */
DefinitionExecution.prototype._activateProcess = function activateProcess(bp) {
  const handlers = this[K_MESSAGE_HANDLERS];
  const broker = bp.broker;

  broker.subscribeTmp('message', 'message.outbound', handlers.onMessageOutbound, {
    noAck: true,
    consumerTag: '_definition-outbound-message-consumer',
  });

  const delegateEventQ = broker.assertQueue('_delegate-event-q', { autoDelete: false, durable: false });
  delegateEventQ.consume(handlers.onDelegateMessage, { noAck: true, consumerTag: '_definition-signal-consumer' });
  broker.bindQueue('_delegate-event-q', 'event', 'activity.signal', { priority: 200 });
  broker.bindQueue('_delegate-event-q', 'event', 'activity.message', { priority: 200 });

  broker.subscribeTmp('event', 'activity.call', handlers.onCallActivity, {
    noAck: true,
    consumerTag: '_definition-call-consumer',
    priority: 200,
  });
  broker.subscribeTmp('event', 'activity.call.cancel', handlers.onCancelCallActivity, {
    noAck: true,
    consumerTag: '_definition-call-cancel-consumer',
    priority: 200,
  });
  broker.subscribeTmp('event', '#', handlers.onChildEvent, {
    noAck: true,
    consumerTag: '_definition-activity-consumer',
    priority: 100,
  });
};

/** @internal */
DefinitionExecution.prototype._onChildEvent = function onChildEvent(routingKey, originalMessage) {
  const message = cloneMessage(originalMessage);
  const content = message.content;
  const parent = (content.parent = content.parent || {});

  const isDirectChild = this[K_PROCESSES].ids.has(content.id);
  if (isDirectChild) {
    parent.executionId = this.executionId;
  } else {
    content.parent = pushParent(parent, this);
  }

  this.broker.publish('event', routingKey, content, { ...message.properties, mandatory: false });
  if (!isDirectChild) return;

  this[K_PROCESSES_Q].queueMessage(message.fields, cloneContent(content), message.properties);
};

/** @internal */
DefinitionExecution.prototype._deactivate = function deactivate() {
  this.broker.cancel('_definition-api-consumer');
  this.broker.cancel(`_definition-activity-${this.executionId}`);
  for (const bp of this[K_PROCESSES].running) this._deactivateProcess(bp);
  this[K_ACTIVATED] = false;
};

/** @internal */
DefinitionExecution.prototype._deactivateProcess = function deactivateProcess(bp) {
  bp.broker.cancel('_definition-outbound-message-consumer');
  bp.broker.cancel('_definition-activity-consumer');
  bp.broker.cancel('_definition-signal-consumer');
  bp.broker.cancel('_definition-call-consumer');
  bp.broker.cancel('_definition-call-cancel-consumer');
};

/** @internal */
DefinitionExecution.prototype._onProcessMessage = function onProcessMessage(routingKey, message) {
  const content = message.content;
  const isRedelivered = message.fields.redelivered;
  const { id: childId, inbound } = content;

  if (isRedelivered && message.properties.persistent === false) return;

  switch (routingKey) {
    case 'execution.stop': {
      message.ack();
      return this._onStopped(message);
    }
    case 'process.leave': {
      return this._onProcessCompleted(message);
    }
  }

  this._stateChangeMessage(message, true);

  switch (routingKey) {
    case 'process.enter':
      this[K_STATUS] = 'executing';
      break;
    case 'process.discarded': {
      if (inbound?.length) {
        const calledFrom = inbound[0];
        this._getProcessApi({ content: calledFrom }).cancel({
          executionId: calledFrom.executionId,
        });
      }
      break;
    }
    case 'process.end': {
      if (inbound?.length) {
        const calledFrom = inbound[0];

        this._getProcessApi({ content: calledFrom }).signal({
          executionId: calledFrom.executionId,
          output: { ...content.output },
        });
      } else {
        Object.assign(this.environment.output, content.output);
      }
      break;
    }
    case 'process.error': {
      if (inbound?.length) {
        const calledFrom = inbound[0];

        this._getProcessApi({ content: calledFrom }).sendApiMessage(
          'error',
          {
            executionId: calledFrom.executionId,
            error: content.error,
          },
          { mandatory: true, type: 'error' }
        );
      } else {
        for (const bp of new Set(this[K_PROCESSES].running)) {
          if (bp.id !== childId) bp.stop();
        }

        Object.assign(this.environment.output, content.output);

        this._complete('error', { error: content.error });
      }
      break;
    }
  }
};

/** @internal */
DefinitionExecution.prototype._stateChangeMessage = function stateChangeMessage(message, postponeMessage) {
  let previousMsg;
  const postponed = this[K_PROCESSES].postponed;
  for (const msg of postponed) {
    if (msg.content.executionId === message.content.executionId) {
      previousMsg = msg;
      postponed.delete(msg);
      break;
    }
  }

  if (previousMsg) previousMsg.ack();
  if (postponeMessage) postponed.add(message);
};

/** @internal */
DefinitionExecution.prototype._onProcessCompleted = function onProcessCompleted(message) {
  this._stateChangeMessage(message, false);
  if (message.fields.redelivered) return message.ack();

  const { id, executionId, type, inbound } = message.content;
  message.ack();
  this._debug(`left <${executionId} (${id})> (${type}), pending runs ${this.postponedCount}`);

  if (inbound?.length) {
    const bp = this._removeProcessByExecutionId(executionId);
    this._deactivateProcess(bp);
  }

  if (!this.postponedCount) {
    this._complete('completed');
  }
};

/** @internal */
DefinitionExecution.prototype._onStopped = function onStopped(message) {
  const running = this[K_PROCESSES].running;
  this._debug(`stop definition execution (stop process executions ${running.size})`);
  this[K_PROCESSES_Q].close();
  for (const bp of new Set(running)) bp.stop();
  this._deactivate();

  this[K_STOPPED] = true;
  return this.broker.publish(
    'execution',
    `execution.stopped.${this.executionId}`,
    cloneContent(this[K_EXECUTE_MESSAGE].content, {
      ...message.content,
    }),
    { type: 'stopped', persistent: false }
  );
};

/** @internal */
DefinitionExecution.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;
  const delegate = message.properties.delegate;

  if (delegate && this.id === message.content.id) {
    const referenceId = message.content.message?.id;
    this._startProcessesByMessage({ referenceId, referenceType: messageType });
  }

  if (delegate) {
    for (const bp of new Set(this[K_PROCESSES].running)) {
      bp.broker.publish('api', routingKey, cloneContent(message.content), message.properties);
    }
  }

  if (this.executionId !== message.content.executionId) return;

  if (messageType === 'stop') {
    this[K_PROCESSES_Q].queueMessage({ routingKey: 'execution.stop' }, cloneContent(message.content), { persistent: false });
  }
};

/** @internal */
DefinitionExecution.prototype._startProcessesByMessage = function startProcessesByMessage(reference) {
  const { processes: bps, running } = this[K_PROCESSES];
  if (bps.length < 2) return;

  for (const bp of bps) {
    if (bp.isExecutable) continue;
    if (!bp.getStartActivities(reference).length) continue;

    if (!bp.executionId) {
      this._debug(`start <${bp.id}> by <${reference.referenceId}> (${reference.referenceType})`);
      this._activateProcess(bp);
      running.add(bp);
      bp.init();
      bp.run();
      if (reference.referenceType === 'message') return;
      continue;
    }

    this._debug(`start new <${bp.id}> by <${reference.referenceId}> (${reference.referenceType})`);

    const targetProcess = this.context.getNewProcessById(bp.id);
    this._activateProcess(targetProcess);
    running.add(targetProcess);
    targetProcess.init();
    targetProcess.run();
    if (reference.referenceType === 'message') return;
  }
};

/** @internal */
DefinitionExecution.prototype._onMessageOutbound = function onMessageOutbound(routingKey, message) {
  const content = message.content;
  const { target, source } = content;

  this._debug(
    `conveying message from <${source.processId}.${source.id}> to`,
    target.id ? `<${target.processId}.${target.id}>` : `<${target.processId}>`
  );

  const targetProcesses = this.getProcessesById(target.processId);
  if (!targetProcesses.length) return;

  let targetProcess, found;
  for (const bp of targetProcesses) {
    if (!bp.executionId) {
      targetProcess = bp;
      continue;
    }
    bp.sendMessage(message);
    found = true;
  }

  if (found) return;

  targetProcess = targetProcess || this.context.getNewProcessById(target.processId);

  this._activateProcess(targetProcess);
  this[K_PROCESSES].running.add(targetProcess);
  targetProcess.init();
  targetProcess.run();
  targetProcess.sendMessage(message);
};

/** @internal */
DefinitionExecution.prototype._onCallActivity = function onCallActivity(routingKey, message) {
  const content = message.content;
  const { calledElement, id: fromId, executionId: fromExecutionId, name: fromName, parent: fromParent } = content;
  if (!calledElement) return;

  const bpExecutionId = `${brokerSafeId(calledElement)}_${fromExecutionId}`;
  if (content.isRecovered) {
    if (this.getProcessByExecutionId(bpExecutionId)) return;
  }

  const targetProcess = this.context.getNewProcessById(calledElement, {
    settings: {
      calledFrom: cloneContent({
        id: fromId,
        name: fromName,
        executionId: content.executionId,
        parent: content.parent,
      }),
    },
  });

  if (!targetProcess) return;

  this._debug(`call from <${fromParent.id}.${fromId}> to <${calledElement}>`);

  this._activateProcess(targetProcess);
  this[K_PROCESSES].running.add(targetProcess);
  targetProcess.init(bpExecutionId);
  targetProcess.run({ inbound: [cloneContent(content)] });
};

/** @internal */
DefinitionExecution.prototype._onCancelCallActivity = function onCancelCallActivity(routingKey, message) {
  const { calledElement, id: fromId, executionId: fromExecutionId, parent: fromParent } = message.content;
  if (!calledElement) return;

  const bpExecutionId = `${brokerSafeId(calledElement)}_${fromExecutionId}`;
  const targetProcess = this.getProcessByExecutionId(bpExecutionId);
  if (!targetProcess) return;

  this._debug(`cancel call from <${fromParent.id}.${fromId}> to <${calledElement}>`);

  if (!targetProcess.isRunning) {
    targetProcess
      .getApi({
        content: {
          id: targetProcess.id,
          executionId: targetProcess.executionId,
        },
      })
      .discard();
  } else {
    targetProcess.getApi().discard();
  }
};

/** @internal */
DefinitionExecution.prototype._onDelegateMessage = function onDelegateMessage(routingKey, executeMessage) {
  const content = executeMessage.content;
  const messageType = executeMessage.properties.type;
  const delegateMessage = executeMessage.content.message;

  const reference = this.context.getActivityById(delegateMessage.id);
  const message = reference?.resolve(executeMessage);

  this._debug(
    `<${reference ? `${messageType} ${delegateMessage.id}>` : `anonymous ${messageType}`} event received from <${content.parent.id}.${content.id}>. Delegating.`
  );

  this.getApi().sendApiMessage(
    messageType,
    {
      source: {
        id: content.id,
        executionId: content.executionId,
        type: content.type,
        parent: cloneParent(content.parent),
      },
      message,
      originalMessage: content.message,
    },
    { delegate: true, type: messageType }
  );

  this.broker.publish(
    'event',
    `definition.${messageType}`,
    this._createMessage({
      message: message && cloneContent(message),
    }),
    { type: messageType }
  );
};

/** @internal */
DefinitionExecution.prototype._removeProcessByExecutionId = function removeProcessByExecutionId(processExecutionId) {
  const bp = this.getProcessByExecutionId(processExecutionId);
  if (bp) this[K_PROCESSES].running.delete(bp);
  return bp;
};

/** @internal */
DefinitionExecution.prototype._complete = function complete(completionType, content, options) {
  this._deactivate();
  const stateMessage = this[K_EXECUTE_MESSAGE];
  this._debug(`definition execution ${completionType} in ${Date.now() - stateMessage.properties.timestamp}ms`);
  if (!content) content = this._createMessage();
  this[K_COMPLETED] = true;
  this[K_STATUS] = completionType;
  this.broker.deleteQueue(this[K_PROCESSES_Q].name);

  return this.broker.publish(
    'execution',
    `execution.${completionType}.${this.executionId}`,
    {
      ...stateMessage.content,
      output: { ...this.environment.output },
      ...content,
      state: completionType,
    },
    { type: completionType, mandatory: completionType === 'error', ...options }
  );
};

/** @internal */
DefinitionExecution.prototype._createMessage = function createMessage(content) {
  return {
    id: this.id,
    type: this.type,
    executionId: this.executionId,
    status: this[K_STATUS],
    ...content,
  };
};

/** @internal */
DefinitionExecution.prototype._getProcessApi = function getProcessApi(message) {
  const content = message.content;
  let api = this._getProcessApiByExecutionId(content.executionId, message);
  if (api) return api;

  if (!content.parent) return;

  api = this._getProcessApiByExecutionId(content.parent.executionId, message);
  if (api) return api;

  if (!content.parent.path) return;

  for (const pp of content.parent.path) {
    api = this._getProcessApiByExecutionId(pp.executionId, message);
    if (api) return api;
  }
};

/** @internal */
DefinitionExecution.prototype._getProcessApiByExecutionId = function getProcessApiByExecutionId(parentExecutionId, message) {
  const processInstance = this.getProcessByExecutionId(parentExecutionId);
  if (!processInstance) return;
  return processInstance.getApi(message);
};

/** @internal */
DefinitionExecution.prototype._debug = function debug(logMessage) {
  this[K_PARENT].logger.debug(`<${this.executionId} (${this.id})> ${logMessage}`);
};
