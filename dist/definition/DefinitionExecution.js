"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = DefinitionExecution;
var _getPropertyValue = _interopRequireDefault(require("../getPropertyValue.js"));
var _Api = require("../Api.js");
var _shared = require("../shared.js");
var _messageHelper = require("../messageHelper.js");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const kActivated = Symbol.for('activated');
const kProcessesQ = Symbol.for('processesQ');
const kCompleted = Symbol.for('completed');
const kExecuteMessage = Symbol.for('executeMessage');
const kMessageHandlers = Symbol.for('messageHandlers');
const kParent = Symbol.for('definition');
const kProcesses = Symbol.for('processes');
const kStatus = Symbol.for('status');
const kStopped = Symbol.for('stopped');
function DefinitionExecution(definition, context) {
  const broker = definition.broker;
  this[kParent] = definition;
  this.id = definition.id;
  this.type = definition.type;
  this.broker = broker;
  const environment = this.environment = definition.environment;
  this.context = context;
  const processes = context.getProcesses();
  const ids = [];
  const executable = [];
  for (const bp of processes) {
    bp.environment.assignVariables(environment.variables);
    bp.environment.assignSettings(environment.settings);
    ids.push(bp.id);
    if (bp.isExecutable) executable.push(bp);
  }
  this[kProcesses] = {
    processes,
    running: [],
    ids,
    executable,
    postponed: []
  };
  broker.assertExchange('execution', 'topic', {
    autoDelete: false,
    durable: true
  });
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
    onProcessMessage: this._onProcessMessage.bind(this)
  };
}
Object.defineProperty(DefinitionExecution.prototype, 'stopped', {
  enumerable: true,
  get() {
    return this[kStopped];
  }
});
Object.defineProperty(DefinitionExecution.prototype, 'completed', {
  enumerable: true,
  get() {
    return this[kCompleted];
  }
});
Object.defineProperty(DefinitionExecution.prototype, 'status', {
  enumerable: true,
  get() {
    return this[kStatus];
  }
});
Object.defineProperty(DefinitionExecution.prototype, 'processes', {
  enumerable: true,
  get() {
    return this[kProcesses].running;
  }
});
Object.defineProperty(DefinitionExecution.prototype, 'postponedCount', {
  get() {
    return this[kProcesses].postponed.length;
  }
});
Object.defineProperty(DefinitionExecution.prototype, 'isRunning', {
  get() {
    return this[kActivated];
  }
});
Object.defineProperty(DefinitionExecution.prototype, 'activityStatus', {
  get() {
    let status = 'idle';
    const running = this[kProcesses].running;
    if (!running || !running.length) return status;
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
  }
});
DefinitionExecution.prototype.execute = function execute(executeMessage) {
  if (!executeMessage) throw new Error('Definition execution requires message');
  const content = executeMessage.content;
  const executionId = this.executionId = content.executionId;
  if (!executionId) throw new Error('Definition execution requires execution id');
  this[kExecuteMessage] = (0, _messageHelper.cloneMessage)(executeMessage, {
    executionId,
    state: 'start'
  });
  this[kStopped] = false;
  this[kProcessesQ] = this.broker.assertQueue(`execute-${executionId}-q`, {
    durable: true,
    autoDelete: false
  });
  if (executeMessage.fields.redelivered) {
    return this.resume();
  }
  const {
    running,
    executable
  } = this[kProcesses];
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
DefinitionExecution.prototype.resume = function resume() {
  this._debug(`resume ${this[kStatus]} definition execution`);
  if (this[kCompleted]) return this._complete('completed');
  const {
    running,
    postponed
  } = this[kProcesses];
  this._activate(running);
  postponed.splice(0);
  this[kProcessesQ].consume(this[kMessageHandlers].onProcessMessage, {
    prefetch: 1000,
    consumerTag: `_definition-activity-${this.executionId}`
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
  running.splice(0);
  const ids = [];
  for (const bpState of state.processes) {
    const bpid = bpState.id;
    let bp;
    if (ids.indexOf(bpid) > -1) {
      bp = this.context.getNewProcessById(bpid);
    } else {
      bp = this.getProcessById(bpid);
    }
    if (!bp) continue;
    ids.push(bpid);
    bp.recover(bpState);
    running.push(bp);
  }
  return this;
};
DefinitionExecution.prototype.stop = function stop() {
  this.getApi().stop();
};
DefinitionExecution.prototype.getProcesses = function getProcesses() {
  const {
    running,
    processes
  } = this[kProcesses];
  const result = running.slice();
  for (const bp of processes) {
    if (!result.find(runningBp => bp.id === runningBp.id)) result.push(bp);
  }
  return result;
};
DefinitionExecution.prototype.getProcessById = function getProcessById(processId) {
  return this.getProcesses().find(bp => bp.id === processId);
};
DefinitionExecution.prototype.getProcessesById = function getProcessesById(processId) {
  return this.getProcesses().filter(bp => bp.id === processId);
};
DefinitionExecution.prototype.getProcessByExecutionId = function getProcessByExecutionId(processExecutionId) {
  const running = this[kProcesses].running;
  return running.find(bp => bp.executionId === processExecutionId);
};
DefinitionExecution.prototype.getRunningProcesses = function getRunningProcesses() {
  const running = this[kProcesses].running;
  return running.filter(bp => bp.executionId);
};
DefinitionExecution.prototype.getExecutableProcesses = function getExecutableProcesses() {
  return this[kProcesses].executable.slice();
};
DefinitionExecution.prototype.getState = function getState() {
  return {
    executionId: this.executionId,
    stopped: this[kStopped],
    completed: this[kCompleted],
    status: this[kStatus],
    processes: this[kProcesses].running.map(bp => bp.getState())
  };
};
DefinitionExecution.prototype.getApi = function getApi(apiMessage) {
  if (!apiMessage) apiMessage = this[kExecuteMessage] || {
    content: this._createMessage()
  };
  const content = apiMessage.content;
  if (content.executionId !== this.executionId) {
    return this._getProcessApi(apiMessage);
  }
  const api = (0, _Api.DefinitionApi)(this.broker, apiMessage);
  const postponed = this[kProcesses].postponed;
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
DefinitionExecution.prototype.getPostponed = function getPostponed(...args) {
  const running = this[kProcesses].running;
  return running.reduce((result, p) => {
    result = result.concat(p.getPostponed(...args));
    return result;
  }, []);
};
DefinitionExecution.prototype._start = function start() {
  const {
    ids,
    executable,
    postponed
  } = this[kProcesses];
  if (!ids.length) {
    return this._complete('completed');
  }
  if (!executable.length) {
    return this._complete('error', {
      error: new Error('No executable process')
    });
  }
  this[kStatus] = 'start';
  for (const bp of executable) bp.init();
  for (const bp of executable) bp.run();
  postponed.splice(0);
  this[kProcessesQ].assertConsumer(this[kMessageHandlers].onProcessMessage, {
    prefetch: 1000,
    consumerTag: `_definition-activity-${this.executionId}`
  });
};
DefinitionExecution.prototype._activate = function activate(processList) {
  this.broker.subscribeTmp('api', '#', this[kMessageHandlers].onApiMessage, {
    noAck: true,
    consumerTag: '_definition-api-consumer'
  });
  for (const bp of processList) this._activateProcess(bp);
  this[kActivated] = true;
};
DefinitionExecution.prototype._activateProcess = function activateProcess(bp) {
  const handlers = this[kMessageHandlers];
  const broker = bp.broker;
  broker.subscribeTmp('message', 'message.outbound', handlers.onMessageOutbound, {
    noAck: true,
    consumerTag: '_definition-outbound-message-consumer'
  });
  const delegateEventQ = broker.assertQueue('_delegate-event-q', {
    autoDelete: false,
    durable: false
  });
  delegateEventQ.consume(handlers.onDelegateMessage, {
    noAck: true,
    consumerTag: '_definition-signal-consumer'
  });
  broker.bindQueue('_delegate-event-q', 'event', 'activity.signal', {
    priority: 200
  });
  broker.bindQueue('_delegate-event-q', 'event', 'activity.message', {
    priority: 200
  });
  broker.subscribeTmp('event', 'activity.call', handlers.onCallActivity, {
    noAck: true,
    consumerTag: '_definition-call-consumer',
    priority: 200
  });
  broker.subscribeTmp('event', 'activity.call.cancel', handlers.onCancelCallActivity, {
    noAck: true,
    consumerTag: '_definition-call-cancel-consumer',
    priority: 200
  });
  broker.subscribeTmp('event', '#', handlers.onChildEvent, {
    noAck: true,
    consumerTag: '_definition-activity-consumer',
    priority: 100
  });
};
DefinitionExecution.prototype._onChildEvent = function onChildEvent(routingKey, originalMessage) {
  const message = (0, _messageHelper.cloneMessage)(originalMessage);
  const content = message.content;
  const parent = content.parent = content.parent || {};
  const isDirectChild = this[kProcesses].ids.indexOf(content.id) > -1;
  if (isDirectChild) {
    parent.executionId = this.executionId;
  } else {
    content.parent = (0, _messageHelper.pushParent)(parent, this);
  }
  this.broker.publish('event', routingKey, content, {
    ...message.properties,
    mandatory: false
  });
  if (!isDirectChild) return;
  this[kProcessesQ].queueMessage(message.fields, (0, _messageHelper.cloneContent)(content), message.properties);
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
  const {
    id: childId,
    inbound
  } = content;
  if (isRedelivered && message.properties.persistent === false) return;
  switch (routingKey) {
    case 'execution.stop':
      {
        message.ack();
        return this._onStopped(message);
      }
    case 'process.leave':
      {
        return this._onProcessCompleted(message);
      }
  }
  this._stateChangeMessage(message, true);
  switch (routingKey) {
    case 'process.enter':
      this[kStatus] = 'executing';
      break;
    case 'process.discarded':
      {
        if (inbound && inbound.length) {
          const calledFrom = inbound[0];
          this._getProcessApi({
            content: calledFrom
          }).cancel({
            executionId: calledFrom.executionId
          });
        }
        break;
      }
    case 'process.end':
      {
        if (inbound && inbound.length) {
          const calledFrom = inbound[0];
          this._getProcessApi({
            content: calledFrom
          }).signal({
            executionId: calledFrom.executionId,
            output: {
              ...content.output
            }
          });
        } else {
          Object.assign(this.environment.output, content.output);
        }
        break;
      }
    case 'process.error':
      {
        if (inbound && inbound.length) {
          const calledFrom = inbound[0];
          this._getProcessApi({
            content: calledFrom
          }).sendApiMessage('error', {
            executionId: calledFrom.executionId,
            error: content.error
          }, {
            mandatory: true,
            type: 'error'
          });
        } else {
          for (const bp of this[kProcesses].running.slice()) {
            if (bp.id !== childId) bp.stop();
          }
          this._complete('error', {
            error: content.error
          });
        }
        break;
      }
  }
};
DefinitionExecution.prototype._stateChangeMessage = function stateChangeMessage(message, postponeMessage) {
  let previousMsg;
  const postponed = this[kProcesses].postponed;
  const idx = postponed.findIndex(msg => msg.content.executionId === message.content.executionId);
  if (idx > -1) {
    previousMsg = postponed.splice(idx, 1)[0];
  }
  if (previousMsg) previousMsg.ack();
  if (postponeMessage) postponed.push(message);
};
DefinitionExecution.prototype._onProcessCompleted = function onProcessCompleted(message) {
  this._stateChangeMessage(message, false);
  if (message.fields.redelivered) return message.ack();
  const {
    id,
    executionId,
    type,
    inbound
  } = message.content;
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
DefinitionExecution.prototype._onStopped = function onStopped(message) {
  const running = this[kProcesses].running;
  this._debug(`stop definition execution (stop process executions ${running.length})`);
  this[kProcessesQ].close();
  for (const bp of running.slice()) bp.stop();
  this._deactivate();
  this[kStopped] = true;
  return this.broker.publish('execution', `execution.stopped.${this.executionId}`, (0, _messageHelper.cloneContent)(this[kExecuteMessage].content, {
    ...message.content
  }), {
    type: 'stopped',
    persistent: false
  });
};
DefinitionExecution.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;
  const delegate = message.properties.delegate;
  if (delegate && this.id === message.content.id) {
    const referenceId = (0, _getPropertyValue.default)(message, 'content.message.id');
    this._startProcessesByMessage({
      referenceId,
      referenceType: messageType
    });
  }
  if (delegate) {
    for (const bp of this[kProcesses].running.slice()) {
      bp.broker.publish('api', routingKey, (0, _messageHelper.cloneContent)(message.content), message.properties);
    }
  }
  if (this.executionId !== message.content.executionId) return;
  if (messageType === 'stop') {
    this[kProcessesQ].queueMessage({
      routingKey: 'execution.stop'
    }, (0, _messageHelper.cloneContent)(message.content), {
      persistent: false
    });
  }
};
DefinitionExecution.prototype._startProcessesByMessage = function startProcessesByMessage(reference) {
  const {
    processes: bps,
    running
  } = this[kProcesses];
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
DefinitionExecution.prototype._onMessageOutbound = function onMessageOutbound(routingKey, message) {
  const content = message.content;
  const {
    target,
    source
  } = content;
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
  this[kProcesses].running.push(targetProcess);
  targetProcess.init();
  targetProcess.run();
  targetProcess.sendMessage(message);
};
DefinitionExecution.prototype._onCallActivity = function onCallActivity(routingKey, message) {
  const content = message.content;
  const {
    calledElement,
    id: fromId,
    executionId: fromExecutionId,
    name: fromName,
    parent: fromParent
  } = content;
  if (!calledElement) return;
  const bpExecutionId = `${(0, _shared.brokerSafeId)(calledElement)}_${fromExecutionId}`;
  if (content.isRecovered) {
    if (this.getProcessByExecutionId(bpExecutionId)) return;
  }
  const targetProcess = this.context.getNewProcessById(calledElement, {
    settings: {
      calledFrom: (0, _messageHelper.cloneContent)({
        id: fromId,
        name: fromName,
        executionId: content.executionId,
        parent: content.parent
      })
    }
  });
  if (!targetProcess) return;
  this._debug(`call from <${fromParent.id}.${fromId}> to <${calledElement}>`);
  this._activateProcess(targetProcess);
  this[kProcesses].running.push(targetProcess);
  targetProcess.init(bpExecutionId);
  targetProcess.run({
    inbound: [(0, _messageHelper.cloneContent)(content)]
  });
};
DefinitionExecution.prototype._onCancelCallActivity = function onCancelCallActivity(routingKey, message) {
  const {
    calledElement,
    id: fromId,
    executionId: fromExecutionId,
    parent: fromParent
  } = message.content;
  if (!calledElement) return;
  const bpExecutionId = `${(0, _shared.brokerSafeId)(calledElement)}_${fromExecutionId}`;
  const targetProcess = this.getProcessByExecutionId(bpExecutionId);
  if (!targetProcess) return;
  this._debug(`cancel call from <${fromParent.id}.${fromId}> to <${calledElement}>`);
  if (!targetProcess.isRunning) {
    targetProcess.getApi({
      content: {
        id: targetProcess.id,
        executionId: targetProcess.executionId
      }
    }).discard();
  } else {
    targetProcess.getApi().discard();
  }
};
DefinitionExecution.prototype._onDelegateMessage = function onDelegateMessage(routingKey, executeMessage) {
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
      parent: (0, _messageHelper.cloneParent)(content.parent)
    },
    message,
    originalMessage: content.message
  }, {
    delegate: true,
    type: messageType
  });
  this.broker.publish('event', `definition.${messageType}`, this._createMessage({
    message: message && (0, _messageHelper.cloneContent)(message)
  }), {
    type: messageType
  });
};
DefinitionExecution.prototype._removeProcessByExecutionId = function removeProcessByExecutionId(processExecutionId) {
  const running = this[kProcesses].running;
  const idx = running.findIndex(p => p.executionId === processExecutionId);
  if (idx === -1) return;
  return running.splice(idx, 1)[0];
};
DefinitionExecution.prototype._complete = function complete(completionType, content, options) {
  this._deactivate();
  const stateMessage = this[kExecuteMessage];
  this._debug(`definition execution ${completionType} in ${Date.now() - stateMessage.properties.timestamp}ms`);
  if (!content) content = this._createMessage();
  this[kCompleted] = true;
  this[kStatus] = completionType;
  this.broker.deleteQueue(this[kProcessesQ].name);
  return this.broker.publish('execution', `execution.${completionType}.${this.executionId}`, {
    ...stateMessage.content,
    output: {
      ...this.environment.output
    },
    ...content,
    state: completionType
  }, {
    type: completionType,
    mandatory: completionType === 'error',
    ...options
  });
};
DefinitionExecution.prototype._createMessage = function createMessage(content = {}) {
  return {
    id: this.id,
    type: this.type,
    executionId: this.executionId,
    status: this[kStatus],
    ...content
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