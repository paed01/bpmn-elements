import getPropertyValue from '../getPropertyValue';
import {DefinitionApi} from '../Api';
import {brokerSafeId} from '../shared';
import {cloneContent, cloneMessage, pushParent, cloneParent} from '../messageHelper';

const activatedSymbol = Symbol.for('activated');
const processesQSymbol = Symbol.for('processesQ');
const completedSymbol = Symbol.for('completed');
const executeMessageSymbol = Symbol.for('executeMessage');
const messageHandlersSymbol = Symbol.for('messageHandlers');
const parentSymbol = Symbol.for('definition');
const processesSymbol = Symbol.for('processes');
const statusSymbol = Symbol.for('status');
const stoppedSymbol = Symbol.for('stopped');

export default function DefinitionExecution(definition, context) {
  const broker = definition.broker;

  this[parentSymbol] = definition;
  this.id = definition.id;
  this.type = definition.type;
  this.broker = broker;
  this.environment = definition.environment;
  this.context = context;

  const processes = this[processesSymbol] = context.getProcesses();
  this[processesSymbol] = {
    processes,
    running: [],
    ids: processes.map(({id: childId}) => childId),
    executable: context.getExecutableProcesses(),
    postponed: [],
  };

  broker.assertExchange('execution', 'topic', {autoDelete: false, durable: true});
  broker.assertQueue('activity-q', {autoDelete: false, durable: false});

  this[completedSymbol] = false;
  this[stoppedSymbol] = false;
  this[activatedSymbol] = false;
  this[statusSymbol] = 'init';
  this.executionId = undefined;

  this[messageHandlersSymbol] = {
    onApiMessage: this._onApiMessage.bind(this),
    onCallActivity: this._onCallActivity.bind(this),
    onCancelCallActivity: this._onCancelCallActivity.bind(this),
    onChildEvent: this._onChildEvent.bind(this),
    onDelegateMessage: this._onDelegateMessage.bind(this),
    onMessageOutbound: this._onMessageOutbound.bind(this),
    onProcessMessage: this._onProcessMessage.bind(this),
  };
}

const proto = DefinitionExecution.prototype;

Object.defineProperty(proto, 'stopped', {
  enumerable: true,
  get() {
    return this[stoppedSymbol];
  },
});

Object.defineProperty(proto, 'completed', {
  enumerable: true,
  get() {
    return this[completedSymbol];
  },
});

Object.defineProperty(proto, 'status', {
  enumerable: true,
  get() {
    return this[statusSymbol];
  },
});

Object.defineProperty(proto, 'processes', {
  enumerable: true,
  get() {
    return this[processesSymbol].running;
  },
});

Object.defineProperty(proto, 'postponedCount', {
  get() {
    return this[processesSymbol].postponed.length;
  },
});

Object.defineProperty(proto, 'isRunning', {
  get() {
    return this[activatedSymbol];
  },
});

proto.execute = function execute(executeMessage) {
  if (!executeMessage) throw new Error('Definition execution requires message');
  const content = executeMessage.content;
  const executionId = this.executionId = content.executionId;
  if (!executionId) throw new Error('Definition execution requires execution id');


  this[executeMessageSymbol] = cloneMessage(executeMessage, {
    executionId,
    state: 'start',
  });

  this[stoppedSymbol] = false;

  this[processesQSymbol] = this.broker.assertQueue(`execute-${executionId}-q`, {durable: true, autoDelete: false});

  if (executeMessage.fields.redelivered) {
    return this.resume();
  }

  const {running, executable} = this[processesSymbol];

  if (content.processId) {
    const startWithProcess = this.getProcessById(content.processId);
    if (startWithProcess) {
      executable.splice(0);
      executable.push(startWithProcess);
    }
  }

  this._debug('execute definition');
  running.push(...executable);
  this._activate(executable);
  this._start();
  return true;
};

proto.resume = function resume() {
  this._debug(`resume ${this.status} definition execution`);

  if (this.completed) return this._complete('completed');

  const {running, postponed} = this[processesSymbol];
  this._activate(running);
  postponed.splice(0);
  this[processesQSymbol].consume(this[messageHandlersSymbol].onProcessMessage, {
    prefetch: 1000,
    consumerTag: `_definition-activity-${this.executionId}`,
  });

  if (this.completed) return this._complete('completed');
  switch (this.status) {
    case 'init':
      return this._start();
    case 'executing': {
      if (!this.postponedCount) return this._complete('completed');
      break;
    }
  }

  for (const bp of running) bp.resume();
};

proto.recover = function recover(state) {
  if (!state) return this;
  this.executionId = state.executionId;

  this[stoppedSymbol] = state.stopped;
  this[completedSymbol] = state.completed;
  this[statusSymbol] = state.status;

  this._debug(`recover ${this.status} definition execution`);

  const running = this[processesSymbol].running;
  running.splice(0);

  state.processes.map((processState) => {
    const instance = this.context.getNewProcessById(processState.id);
    if (!instance) return;
    instance.recover(processState);
    running.push(instance);
  });

  return this;
};

proto.stop = function stop() {
  this.getApi().stop();
};

proto.getProcesses = function getProcesses() {
  const {running, processes} = this[processesSymbol];
  const result = running.slice();
  for (const bp of processes) {
    if (!result.find((runningBp) => bp.id === runningBp.id)) result.push(bp);
  }
  return result;
};

proto.getProcessById = function getProcessById(processId) {
  return this.getProcesses().find((bp) => bp.id === processId);
};

proto.getProcessesById = function getProcessesById(processId) {
  return this.getProcesses().filter((bp) => bp.id === processId);
};

proto.getProcessByExecutionId = function getProcessByExecutionId(processExecutionId) {
  const running = this[processesSymbol].running;
  return running.find((bp) => bp.executionId === processExecutionId);
};

proto.getRunningProcesses = function getRunningProcesses() {
  const running = this[processesSymbol].running;
  return running.filter((bp) => bp.executionId);
};

proto.getExecutableProcesses = function getExecutableProcesses() {
  return this[processesSymbol].executable.slice();
};

proto.getState = function getState() {
  return {
    executionId: this.executionId,
    stopped: this.stopped,
    completed: this.completed,
    status: this.status,
    processes: this[processesSymbol].running.map((bp) => bp.getState()),
  };
};

proto.getApi = function getApi(apiMessage) {
  if (!apiMessage) apiMessage = this[executeMessageSymbol] || {content: this._createMessage()};

  const content = apiMessage.content;
  if (content.executionId !== this.executionId) {
    return this._getProcessApi(apiMessage);
  }

  const api = DefinitionApi(this.broker, apiMessage);
  const postponed = this[processesSymbol].postponed;
  const self = this;

  api.getExecuting = function getExecuting() {
    return postponed.reduce((result, msg) => {
      const bpApi = self._getProcessApi(msg);
      if (bpApi) result.push(bpApi);
      return result;
    }, []);
  };

  return api;
};

proto.getPostponed = function getPostponed(...args) {
  const running = this[processesSymbol].running;
  return running.reduce((result, p) => {
    result = result.concat(p.getPostponed(...args));
    return result;
  }, []);
};

proto._start = function start() {
  const {ids, executable, postponed} = this[processesSymbol];
  if (!ids.length) {
    return this.publishCompletionMessage('completed');
  }
  if (!executable.length) {
    return this._complete('error', {error: new Error('No executable process')});
  }

  this[statusSymbol] = 'start';

  for (const bp of executable) bp.init();
  for (const bp of executable) bp.run();

  postponed.splice(0);
  this[processesQSymbol].assertConsumer(this[messageHandlersSymbol].onProcessMessage, {
    prefetch: 1000,
    consumerTag: `_definition-activity-${this.executionId}`,
  });
};

proto._activate = function activate(processList) {
  this.broker.subscribeTmp('api', '#', this[messageHandlersSymbol].onApiMessage, {
    noAck: true,
    consumerTag: '_definition-api-consumer',
  });
  for (const bp of processList) this._activateProcess(bp);
  this[activatedSymbol] = true;
};

proto._activateProcess = function activateProcess(bp) {
  const handlers = this[messageHandlersSymbol];

  bp.broker.subscribeTmp('message', 'message.outbound', handlers.onMessageOutbound, {
    noAck: true,
    consumerTag: '_definition-outbound-message-consumer',
  });
  bp.broker.subscribeTmp('event', 'activity.signal', handlers.onDelegateMessage, {
    noAck: true,
    consumerTag: '_definition-signal-consumer',
    priority: 200,
  });
  bp.broker.subscribeTmp('event', 'activity.message', handlers.onDelegateMessage, {
    noAck: true,
    consumerTag: '_definition-message-consumer',
    priority: 200,
  });
  bp.broker.subscribeTmp('event', 'activity.call', handlers.onCallActivity, {
    noAck: true,
    consumerTag: '_definition-call-consumer',
    priority: 200,
  });
  bp.broker.subscribeTmp('event', 'activity.call.cancel', handlers.onCancelCallActivity, {
    noAck: true,
    consumerTag: '_definition-call-cancel-consumer',
    priority: 200,
  });
  bp.broker.subscribeTmp('event', '#', handlers.onChildEvent, {
    noAck: true,
    consumerTag: '_definition-activity-consumer',
    priority: 100,
  });
};

proto._onChildEvent = function onChildEvent(routingKey, originalMessage) {
  const message = cloneMessage(originalMessage);
  const content = message.content;
  const parent = content.parent = content.parent || {};

  const isDirectChild = this[processesSymbol].ids.indexOf(content.id) > -1;
  if (isDirectChild) {
    parent.executionId = this.executionId;
  } else {
    content.parent = pushParent(parent, this);
  }

  this.broker.publish('event', routingKey, content, {...message.properties, mandatory: false});
  if (!isDirectChild) return;

  this[processesQSymbol].queueMessage(message.fields, cloneContent(content), message.properties);
};

proto._deactivate = function deactivate() {
  this.broker.cancel('_definition-api-consumer');
  this.broker.cancel(`_definition-activity-${this.executionId}`);
  for (const bp of this[processesSymbol].running) this._deactivateProcess(bp);
  this[activatedSymbol] = false;
};

proto._deactivateProcess = function deactivateProcess(bp) {
  bp.broker.cancel('_definition-outbound-message-consumer');
  bp.broker.cancel('_definition-activity-consumer');
  bp.broker.cancel('_definition-signal-consumer');
  bp.broker.cancel('_definition-message-consumer');
  bp.broker.cancel('_definition-call-consumer');
  bp.broker.cancel('_definition-call-cancel-consumer');
};

proto._onProcessMessage = function onProcessMessage(routingKey, message) {
  const content = message.content;
  const isRedelivered = message.fields.redelivered;
  const {id: childId, executionId: childExecutionId, inbound} = content;

  if (isRedelivered && message.properties.persistent === false) return;

  switch (routingKey) {
    case 'execution.stop': {
      if (childExecutionId === this.executionId) {
        message.ack();
        return this._onStopped(message);
      }
      break;
    }
    case 'process.leave': {
      return this._onProcessCompleted(message);
    }
  }

  this._stateChangeMessage(message, true);

  switch (routingKey) {
    case 'process.discard':
    case 'process.enter':
      this[statusSymbol] = 'executing';
      break;
    case 'process.discarded': {
      if (inbound && inbound.length) {
        const calledFrom = inbound[0];
        this._getProcessApi({content: calledFrom}).cancel({
          executionId: calledFrom.executionId,
        });
      }
      break;
    }
    case 'process.end': {
      if (inbound && inbound.length) {
        const calledFrom = inbound[0];

        this._getProcessApi({content: calledFrom}).signal({
          executionId: calledFrom.executionId,
          output: {...content.output},
        });
      } else {
        Object.assign(this.environment.output, content.output);
      }
      break;
    }
    case 'process.error': {
      if (inbound && inbound.length) {
        const calledFrom = inbound[0];

        this._getProcessApi({content: calledFrom}).sendApiMessage('error', {
          executionId: calledFrom.executionId,
          error: content.error,
        }, {mandatory: true, type: 'error'});
      } else {
        for (const bp of this[processesSymbol].running.slice()) {
          if (bp.id !== childId) bp.stop();
        }

        this._complete('error', {error: content.error});
      }
      break;
    }
  }
};

proto._stateChangeMessage = function stateChangeMessage(message, postponeMessage) {
  let previousMsg;
  const postponed = this[processesSymbol].postponed;
  const idx = postponed.findIndex((msg) => msg.content.executionId === message.content.executionId);
  if (idx > -1) {
    previousMsg = postponed.splice(idx, 1)[0];
  }

  if (previousMsg) previousMsg.ack();
  if (postponeMessage) postponed.push(message);
};

proto._onProcessCompleted = function onProcessCompleted(message) {
  this._stateChangeMessage(message, false);
  if (message.fields.redelivered) return message.ack();

  const {id, executionId, type, inbound} = message.content;
  this._debug(`left <${executionId} (${id})> (${type}), pending runs ${this.postponedCount}`);

  if (inbound && inbound.length) {
    const bp = this._removeProcessByExecutionId(executionId);
    this._deactivateProcess(bp);
  }

  if (!this.postponedCount) {
    message.ack();
    this._complete('completed');
  }
};

proto._onStopped = function onStopped(message) {
  const running = this[processesSymbol].running;
  this._debug(`stop definition execution (stop process executions ${running.length})`);
  this[processesQSymbol].close();
  this._deactivate();

  for (const bp of running.slice()) bp.stop();

  this[stoppedSymbol] = true;
  return this.broker.publish('execution', `execution.stopped.${this.executionId}`, cloneContent(this[executeMessageSymbol].content, {
    ...message.content,
  }), {type: 'stopped', persistent: false});
};

proto._onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;
  const delegate = message.properties.delegate;

  if (delegate && this.id === message.content.id) {
    const referenceId = getPropertyValue(message, 'content.message.id');
    this._startProcessesByMessage({referenceId, referenceType: messageType});
  }

  if (delegate) {
    for (const bp of this[processesSymbol].running.slice()) {
      bp.broker.publish('api', routingKey, cloneContent(message.content), message.properties);
    }
  }

  if (this.executionId !== message.content.executionId) return;

  if (messageType === 'stop') {
    this[processesQSymbol].queueMessage({routingKey: 'execution.stop'}, cloneContent(message.content), {persistent: false});
  }
};

proto._startProcessesByMessage = function startProcessesByMessage(reference) {
  const {processes: bps, running} = this[processesSymbol];
  if (bps.length < 2) return;

  for (const bp of bps) {
    if (bp.isExecutable) continue;
    if (!bp.getStartActivities(reference).length) continue;

    if (!bp.executionId) {
      this._debug(`start <${bp.id}> by <${reference.referenceId}> (${reference.referenceType})`);
      this._activateProcess(bp);
      running.push(bp);
      bp.init();
      bp.run();
      if (reference.referenceType === 'message') return;
      continue;
    }

    this._debug(`start new <${bp.id}> by <${reference.referenceId}> (${reference.referenceType})`);

    const targetProcess = this.context.getNewProcessById(bp.id);
    this._activateProcess(targetProcess);
    running.push(targetProcess);
    targetProcess.init();
    targetProcess.run();
    if (reference.referenceType === 'message') return;
  }
};

proto._onMessageOutbound = function onMessageOutbound(routingKey, message) {
  const content = message.content;
  const {target, source} = content;

  this._debug(`conveying message from <${source.processId}.${source.id}> to`, target.id ? `<${target.processId}.${target.id}>` : `<${target.processId}>`);

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
  this[processesSymbol].running.push(targetProcess);
  targetProcess.init();
  targetProcess.run();
  targetProcess.sendMessage(message);
};

proto._onCallActivity = function onCallActivity(routingKey, message) {
  const content = message.content;
  const {calledElement, id: fromId, executionId: fromExecutionId, name: fromName, parent: fromParent} = content;

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
  this[processesSymbol].running.push(targetProcess);
  targetProcess.init(bpExecutionId);
  targetProcess.run({inbound: [cloneContent(content)]});
};

proto._onCancelCallActivity = function onCancelCallActivity(routingKey, message) {
  const content = message.content;
  const {calledElement, id: fromId, executionId: fromExecutionId, parent: fromParent} = content;

  const bpExecutionId = `${brokerSafeId(calledElement)}_${fromExecutionId}`;
  const targetProcess = this.getProcessByExecutionId(bpExecutionId);
  if (!targetProcess) return;

  this._debug(`cancel call from <${fromParent.id}.${fromId}> to <${calledElement}>`);

  targetProcess.getApi().discard();
};

proto._onDelegateMessage = function onDelegateMessage(routingKey, executeMessage) {
  const content = executeMessage.content;
  const messageType = executeMessage.properties.type;
  const delegateMessage = executeMessage.content.message;

  const reference = this.context.getActivityById(delegateMessage.id);
  const message = reference && reference.resolve(executeMessage);

  this._debug(`<${reference ? `${messageType} ${delegateMessage.id}>` : `anonymous ${messageType}`} event received from <${content.parent.id}.${content.id}>. Delegating.`);

  this.getApi().sendApiMessage(messageType, {
    source: {
      id: content.id,
      executionId: content.executionId,
      type: content.type,
      parent: cloneParent(content.parent),
    },
    message,
    originalMessage: content.message,
  }, {delegate: true, type: messageType});

  this.broker.publish('event', `definition.${messageType}`, this._createMessage({
    message: message && cloneContent(message),
  }), {type: messageType});
};

proto._removeProcessByExecutionId = function removeProcessByExecutionId(processExecutionId) {
  const running = this[processesSymbol].running;
  const idx = running.findIndex((p) => p.executionId === processExecutionId);
  if (idx === -1) return;
  return running.splice(idx, 1)[0];
};

proto._complete = function complete(completionType, content, options) {
  this._deactivate();
  const stateMessage = this[executeMessageSymbol];
  this._debug(`definition execution ${completionType} in ${Date.now() - stateMessage.properties.timestamp}ms`);
  if (!content) content = this._createMessage();
  this[completedSymbol] = true;
  if (this.status !== 'terminated') this[statusSymbol] = completionType;
  this.broker.deleteQueue(this[processesQSymbol].name);

  return this.broker.publish('execution', `execution.${completionType}.${this.executionId}`, {
    ...stateMessage.content,
    output: {...this.environment.output},
    ...content,
    state: completionType,
  }, {type: completionType, mandatory: completionType === 'error', ...options});
};

proto.publishCompletionMessage = function publishCompletionMessage(completionType, content) {
  this._deactivate();
  this._debug(completionType);
  if (!content) content = this._createMessage();
  return this.broker.publish('execution', `execution.${completionType}.${this.executionId}`, content, { type: completionType });
};

proto._createMessage = function createMessage(content = {}) {
  return {
    id: this.id,
    type: this.type,
    executionId: this.executionId,
    status: this.status,
    ...content,
  };
};

proto._getProcessApi = function getProcessApi(message) {
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

proto._getProcessApiByExecutionId = function getProcessApiByExecutionId(parentExecutionId, message) {
  const processInstance = this.getProcessByExecutionId(parentExecutionId);
  if (!processInstance) return;
  return processInstance.getApi(message);
};

proto._debug = function debug(logMessage) {
  this[parentSymbol].logger.debug(`<${this.executionId} (${this.id})> ${logMessage}`);
};
