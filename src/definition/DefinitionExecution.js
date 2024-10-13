import getPropertyValue from '../getPropertyValue.js';
import { DefinitionApi } from '../Api.js';
import { brokerSafeId } from '../shared.js';
import { cloneContent, cloneMessage, pushParent, cloneParent } from '../messageHelper.js';

const kActivated = Symbol.for('activated');
const kProcessesQ = Symbol.for('processesQ');
const kCompleted = Symbol.for('completed');
const kExecuteMessage = Symbol.for('executeMessage');
const kMessageHandlers = Symbol.for('messageHandlers');
const kParent = Symbol.for('definition');
const kProcesses = Symbol.for('processes');
const kStatus = Symbol.for('status');
const kStopped = Symbol.for('stopped');

export default function DefinitionExecution(definition, context) {
  const broker = definition.broker;

  this[kParent] = definition;
  this.id = definition.id;
  this.type = definition.type;
  this.broker = broker;
  const environment = (this.environment = definition.environment);
  this.context = context;

  const processes = context.getProcesses();
  const ids = new Set();
  const executable = new Set();
  for (const bp of processes) {
    bp.environment.assignVariables(environment.variables);
    bp.environment.assignSettings(environment.settings);
    ids.add(bp.id);
    if (bp.isExecutable) executable.add(bp);
  }

  this[kProcesses] = {
    processes,
    ids,
    executable,
    running: new Set(),
    postponed: new Set(),
  };

  broker.assertExchange('execution', 'topic', { autoDelete: false, durable: true });

  this.executionId = undefined;
  this[kCompleted] = false;
  this[kStopped] = false;
  this[kActivated] = false;
  this[kStatus] = 'init';
  this[kProcessesQ] = undefined;

  this[kMessageHandlers] = {
    onApiMessage: this._onApiMessage.bind(this),
    onCallActivity: this._onCallActivity.bind(this),
    onCancelCallActivity: this._onCancelCallActivity.bind(this),
    onChildEvent: this._onChildEvent.bind(this),
    onDelegateMessage: this._onDelegateMessage.bind(this),
    onMessageOutbound: this._onMessageOutbound.bind(this),
    onProcessMessage: this._onProcessMessage.bind(this),
  };
}

Object.defineProperties(DefinitionExecution.prototype, {
  stopped: {
    get() {
      return this[kStopped];
    },
  },
  completed: {
    get() {
      return this[kCompleted];
    },
  },
  status: {
    get() {
      return this[kStatus];
    },
  },
  processes: {
    get() {
      return [...this[kProcesses].running];
    },
  },
  postponedCount: {
    get() {
      return this[kProcesses].postponed.size;
    },
  },
  isRunning: {
    get() {
      return this[kActivated];
    },
  },
  activityStatus: {
    get() {
      let status = 'idle';
      const running = this[kProcesses].running;
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

DefinitionExecution.prototype.execute = function execute(executeMessage) {
  if (!executeMessage) throw new Error('Definition execution requires message');
  const content = executeMessage.content;
  const executionId = (this.executionId = content.executionId);
  if (!executionId) throw new Error('Definition execution requires execution id');

  this[kExecuteMessage] = cloneMessage(executeMessage, {
    executionId,
    state: 'start',
  });

  this[kStopped] = false;

  this[kProcessesQ] = this.broker.assertQueue(`execute-${executionId}-q`, { durable: true, autoDelete: false });

  if (executeMessage.fields.redelivered) {
    return this.resume();
  }

  const { running, executable } = this[kProcesses];

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

DefinitionExecution.prototype.resume = function resume() {
  this._debug(`resume ${this[kStatus]} definition execution`);

  if (this[kCompleted]) return this._complete('completed');

  const { running, postponed } = this[kProcesses];
  this._activate(running);
  postponed.clear();
  this[kProcessesQ].consume(this[kMessageHandlers].onProcessMessage, {
    prefetch: 1000,
    consumerTag: `_definition-activity-${this.executionId}`,
  });

  if (this[kCompleted]) return;

  for (const bp of running) bp.resume();
};

DefinitionExecution.prototype.recover = function recover(state) {
  if (!state) return this;
  this.executionId = state.executionId;

  this[kStopped] = state.stopped;
  this[kCompleted] = state.completed;
  this[kStatus] = state.status;

  this._debug(`recover ${this[kStatus]} definition execution`);

  const running = this[kProcesses].running;
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
    bp.recover(bpState);
    running.add(bp);
  }

  return this;
};

DefinitionExecution.prototype.stop = function stop() {
  this.getApi().stop();
};

DefinitionExecution.prototype.getProcesses = function getProcesses() {
  const { running, processes } = this[kProcesses];
  const result = [...running];
  for (const bp of processes) {
    if (!result.find((runningBp) => bp.id === runningBp.id)) result.push(bp);
  }
  return result;
};

DefinitionExecution.prototype.getProcessById = function getProcessById(processId) {
  return this.getProcesses().find((bp) => bp.id === processId);
};

DefinitionExecution.prototype.getProcessesById = function getProcessesById(processId) {
  return this.getProcesses().filter((bp) => bp.id === processId);
};

DefinitionExecution.prototype.getProcessByExecutionId = function getProcessByExecutionId(processExecutionId) {
  for (const bp of this[kProcesses].running) {
    if (bp.executionId === processExecutionId) return bp;
  }
};

DefinitionExecution.prototype.getRunningProcesses = function getRunningProcesses() {
  return [...this[kProcesses].running].filter((bp) => bp.executionId);
};

DefinitionExecution.prototype.getExecutableProcesses = function getExecutableProcesses() {
  return [...this[kProcesses].executable];
};

DefinitionExecution.prototype.getState = function getState() {
  const processes = [];
  for (const bp of this[kProcesses].running) {
    processes.push(bp.getState());
  }

  return {
    executionId: this.executionId,
    stopped: this[kStopped],
    completed: this[kCompleted],
    status: this[kStatus],
    processes,
  };
};

DefinitionExecution.prototype.getApi = function getApi(apiMessage) {
  if (!apiMessage) apiMessage = this[kExecuteMessage] || { content: this._createMessage() };

  const content = apiMessage.content;
  if (content.executionId !== this.executionId) {
    return this._getProcessApi(apiMessage);
  }

  const api = DefinitionApi(this.broker, apiMessage);
  const postponed = this[kProcesses].postponed;
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

DefinitionExecution.prototype.getPostponed = function getPostponed(...args) {
  let result = [];
  for (const bp of this[kProcesses].running) {
    result = result.concat(bp.getPostponed(...args));
  }
  return result;
};

DefinitionExecution.prototype._start = function start() {
  const { ids, executable, postponed } = this[kProcesses];
  if (!ids.size) {
    return this._complete('completed');
  }

  if (!executable.size) {
    return this._complete('error', { error: new Error('No executable process') });
  }

  this[kStatus] = 'start';

  for (const bp of executable) bp.init();
  for (const bp of executable) bp.run();

  postponed.clear();
  this[kProcessesQ].assertConsumer(this[kMessageHandlers].onProcessMessage, {
    prefetch: 1000,
    consumerTag: `_definition-activity-${this.executionId}`,
  });
};

DefinitionExecution.prototype._activate = function activate(processList) {
  this.broker.subscribeTmp('api', '#', this[kMessageHandlers].onApiMessage, {
    noAck: true,
    consumerTag: '_definition-api-consumer',
  });
  for (const bp of processList) this._activateProcess(bp);
  this[kActivated] = true;
};

DefinitionExecution.prototype._activateProcess = function activateProcess(bp) {
  const handlers = this[kMessageHandlers];
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

DefinitionExecution.prototype._onChildEvent = function onChildEvent(routingKey, originalMessage) {
  const message = cloneMessage(originalMessage);
  const content = message.content;
  const parent = (content.parent = content.parent || {});

  const isDirectChild = this[kProcesses].ids.has(content.id);
  if (isDirectChild) {
    parent.executionId = this.executionId;
  } else {
    content.parent = pushParent(parent, this);
  }

  this.broker.publish('event', routingKey, content, { ...message.properties, mandatory: false });
  if (!isDirectChild) return;

  this[kProcessesQ].queueMessage(message.fields, cloneContent(content), message.properties);
};

DefinitionExecution.prototype._deactivate = function deactivate() {
  this.broker.cancel('_definition-api-consumer');
  this.broker.cancel(`_definition-activity-${this.executionId}`);
  for (const bp of this[kProcesses].running) this._deactivateProcess(bp);
  this[kActivated] = false;
};

DefinitionExecution.prototype._deactivateProcess = function deactivateProcess(bp) {
  bp.broker.cancel('_definition-outbound-message-consumer');
  bp.broker.cancel('_definition-activity-consumer');
  bp.broker.cancel('_definition-signal-consumer');
  bp.broker.cancel('_definition-call-consumer');
  bp.broker.cancel('_definition-call-cancel-consumer');
};

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
      this[kStatus] = 'executing';
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
          { mandatory: true, type: 'error' },
        );
      } else {
        for (const bp of new Set(this[kProcesses].running)) {
          if (bp.id !== childId) bp.stop();
        }

        Object.assign(this.environment.output, content.output);

        this._complete('error', { error: content.error });
      }
      break;
    }
  }
};

DefinitionExecution.prototype._stateChangeMessage = function stateChangeMessage(message, postponeMessage) {
  let previousMsg;
  const postponed = this[kProcesses].postponed;
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

DefinitionExecution.prototype._onStopped = function onStopped(message) {
  const running = this[kProcesses].running;
  this._debug(`stop definition execution (stop process executions ${running.size})`);
  this[kProcessesQ].close();
  for (const bp of new Set(running)) bp.stop();
  this._deactivate();

  this[kStopped] = true;
  return this.broker.publish(
    'execution',
    `execution.stopped.${this.executionId}`,
    cloneContent(this[kExecuteMessage].content, {
      ...message.content,
    }),
    { type: 'stopped', persistent: false },
  );
};

DefinitionExecution.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;
  const delegate = message.properties.delegate;

  if (delegate && this.id === message.content.id) {
    const referenceId = getPropertyValue(message, 'content.message.id');
    this._startProcessesByMessage({ referenceId, referenceType: messageType });
  }

  if (delegate) {
    for (const bp of new Set(this[kProcesses].running)) {
      bp.broker.publish('api', routingKey, cloneContent(message.content), message.properties);
    }
  }

  if (this.executionId !== message.content.executionId) return;

  if (messageType === 'stop') {
    this[kProcessesQ].queueMessage({ routingKey: 'execution.stop' }, cloneContent(message.content), { persistent: false });
  }
};

DefinitionExecution.prototype._startProcessesByMessage = function startProcessesByMessage(reference) {
  const { processes: bps, running } = this[kProcesses];
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

DefinitionExecution.prototype._onMessageOutbound = function onMessageOutbound(routingKey, message) {
  const content = message.content;
  const { target, source } = content;

  this._debug(
    `conveying message from <${source.processId}.${source.id}> to`,
    target.id ? `<${target.processId}.${target.id}>` : `<${target.processId}>`,
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
  this[kProcesses].running.add(targetProcess);
  targetProcess.init();
  targetProcess.run();
  targetProcess.sendMessage(message);
};

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
  this[kProcesses].running.add(targetProcess);
  targetProcess.init(bpExecutionId);
  targetProcess.run({ inbound: [cloneContent(content)] });
};

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

DefinitionExecution.prototype._onDelegateMessage = function onDelegateMessage(routingKey, executeMessage) {
  const content = executeMessage.content;
  const messageType = executeMessage.properties.type;
  const delegateMessage = executeMessage.content.message;

  const reference = this.context.getActivityById(delegateMessage.id);
  const message = reference?.resolve(executeMessage);

  this._debug(
    `<${reference ? `${messageType} ${delegateMessage.id}>` : `anonymous ${messageType}`} event received from <${content.parent.id}.${content.id}>. Delegating.`,
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
    { delegate: true, type: messageType },
  );

  this.broker.publish(
    'event',
    `definition.${messageType}`,
    this._createMessage({
      message: message && cloneContent(message),
    }),
    { type: messageType },
  );
};

DefinitionExecution.prototype._removeProcessByExecutionId = function removeProcessByExecutionId(processExecutionId) {
  const bp = this.getProcessByExecutionId(processExecutionId);
  if (bp) this[kProcesses].running.delete(bp);
  return bp;
};

DefinitionExecution.prototype._complete = function complete(completionType, content, options) {
  this._deactivate();
  const stateMessage = this[kExecuteMessage];
  this._debug(`definition execution ${completionType} in ${Date.now() - stateMessage.properties.timestamp}ms`);
  if (!content) content = this._createMessage();
  this[kCompleted] = true;
  this[kStatus] = completionType;
  this.broker.deleteQueue(this[kProcessesQ].name);

  return this.broker.publish(
    'execution',
    `execution.${completionType}.${this.executionId}`,
    {
      ...stateMessage.content,
      output: { ...this.environment.output },
      ...content,
      state: completionType,
    },
    { type: completionType, mandatory: completionType === 'error', ...options },
  );
};

DefinitionExecution.prototype._createMessage = function createMessage(content) {
  return {
    id: this.id,
    type: this.type,
    executionId: this.executionId,
    status: this[kStatus],
    ...content,
  };
};

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

DefinitionExecution.prototype._getProcessApiByExecutionId = function getProcessApiByExecutionId(parentExecutionId, message) {
  const processInstance = this.getProcessByExecutionId(parentExecutionId);
  if (!processInstance) return;
  return processInstance.getApi(message);
};

DefinitionExecution.prototype._debug = function debug(logMessage) {
  this[kParent].logger.debug(`<${this.executionId} (${this.id})> ${logMessage}`);
};
