import getPropertyValue from '../getPropertyValue';
import {DefinitionApi} from '../Api';
import {brokerSafeId} from '../shared';
import {cloneContent, cloneMessage, pushParent, cloneParent} from '../messageHelper';

const activatedSymbol = Symbol.for('activated');
const completedSymbol = Symbol.for('completed');
const parentSymbol = Symbol.for('parent');
const processesSymbol = Symbol.for('processes');
const stateMessageSymbol = Symbol.for('stateMessage');
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
  this.processes = [];
  this.processIds = processes.map(({id: childId}) => childId);
  this.executableProcesses = context.getExecutableProcesses();

  this.postponed = [];

  broker.assertExchange('execution', 'topic', {autoDelete: false, durable: true});
  broker.assertQueue('activity-q', {autoDelete: false, durable: false});

  this[completedSymbol] = false;
  this[stoppedSymbol] = false;
  this[activatedSymbol] = false;
  this[statusSymbol] = 'init';
  this.executionId = undefined;

  this.onProcessMessage = this.onProcessMessage.bind(this);
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

Object.defineProperty(proto, 'postponedCount', {
  get() {
    return this.postponed.length;
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
  if (!content || !content.executionId) throw new Error('Definition execution requires execution id');

  const executionId = this.executionId = content.executionId;

  this[stateMessageSymbol] = cloneMessage(executeMessage, {executionId, state: 'start'});

  this[stoppedSymbol] = false;

  this.activityQ = this.broker.assertQueue(`execute-${executionId}-q`, {durable: true, autoDelete: false});

  if (executeMessage.fields.redelivered) {
    return this.resume();
  }

  if (content.processId) {
    const startWithProcess = this.getProcessById(content.processId);
    if (startWithProcess) this.executableProcesses = [startWithProcess];
  }

  this.debug('execute definition');
  this.processes.push(...this.executableProcesses);
  this.activate(this.executableProcesses);
  this.start();
  return true;
};

proto.start = function start() {
  if (!this.processIds.length) {
    return this.publishCompletionMessage('completed');
  }
  if (!this.executableProcesses.length) {
    return this.complete('error', {error: new Error('No executable process')});
  }

  this[statusSymbol] = 'start';

  const executableProcesses = this.executableProcesses;
  for (const bp of executableProcesses) bp.init();
  for (const bp of executableProcesses) bp.run();

  this.postponed.splice(0);
  this.activityQ.assertConsumer(this.onProcessMessage, {
    prefetch: 1000,
    consumerTag: `_definition-activity-${this.executionId}`,
  });
};

proto.resume = function resume() {
  this.debug(`resume ${this.status} definition execution`);

  if (this.completed) return this.complete('completed');

  this.activate(this.processes);
  this.postponed.splice(0);
  this.activityQ.consume(this.onProcessMessage, {
    prefetch: 1000,
    consumerTag: `_definition-activity-${this.executionId}`,
  });

  if (this.completed) return this.complete('completed');
  switch (this.status) {
    case 'init':
      return this.start();
    case 'executing': {
      if (!this.postponedCount) return this.complete('completed');
      break;
    }
  }

  for (const bp of this.processes) bp.resume();
};

proto.recover = function recover(state) {
  if (!state) return this;
  this.executionId = state.executionId;

  this[stoppedSymbol] = state.stopped;
  this[completedSymbol] = state.completed;
  this[statusSymbol] = state.status;

  this.debug(`recover ${this.status} definition execution`);

  this.processes.splice(0);

  state.processes.map((processState) => {
    const instance = this.context.getNewProcessById(processState.id);
    if (!instance) return;
    instance.recover(processState);
    this.processes.push(instance);
  });

  return this;
};

proto.stop = function stop() {
  this.getApi().stop();
};

proto.activate = function activate(processList) {
  this.broker.subscribeTmp('api', '#', this.onApiMessage.bind(this), {
    noAck: true,
    consumerTag: '_definition-api-consumer',
  });
  for (const bp of processList) this.activateProcess(bp);
  this[activatedSymbol] = true;
};

proto.activateProcess = function activateProcess(bp) {
  bp.broker.subscribeTmp('message', 'message.outbound', this.onMessageOutbound.bind(this), {noAck: true, consumerTag: '_definition-outbound-message-consumer'});
  bp.broker.subscribeTmp('event', 'activity.signal', this.onDelegateMessage.bind(this), {noAck: true, consumerTag: '_definition-signal-consumer', priority: 200});
  bp.broker.subscribeTmp('event', 'activity.message', this.onDelegateMessage.bind(this), {noAck: true, consumerTag: '_definition-message-consumer', priority: 200});
  bp.broker.subscribeTmp('event', 'activity.call', this.onCallActivity.bind(this), {noAck: true, consumerTag: '_definition-call-consumer', priority: 200});
  bp.broker.subscribeTmp('event', 'activity.call.cancel', this.onCancelCallActivity.bind(this), {noAck: true, consumerTag: '_definition-call-cancel-consumer', priority: 200});
  bp.broker.subscribeTmp('event', '#', this.onChildEvent.bind(this), {noAck: true, consumerTag: '_definition-activity-consumer', priority: 100});
};

proto.onChildEvent = function onChildEvent(routingKey, originalMessage) {
  const message = cloneMessage(originalMessage);
  const content = message.content;
  const parent = content.parent = content.parent || {};

  const isDirectChild = this.processIds.indexOf(content.id) > -1;
  if (isDirectChild) {
    parent.executionId = this.executionId;
  } else {
    content.parent = pushParent(parent, this);
  }

  this.broker.publish('event', routingKey, content, {...message.properties, mandatory: false});
  if (!isDirectChild) return;

  this.activityQ.queueMessage(message.fields, cloneContent(content), message.properties);
};

proto.deactivate = function deactivate() {
  this.broker.cancel('_definition-api-consumer');
  this.broker.cancel(`_definition-activity-${this.executionId}`);
  for (const bp of this.processes) this.deactivateProcess(bp);
  this[activatedSymbol] = false;
};

proto.deactivateProcess = function deactivateProcess(bp) {
  bp.broker.cancel('_definition-outbound-message-consumer');
  bp.broker.cancel('_definition-activity-consumer');
  bp.broker.cancel('_definition-signal-consumer');
  bp.broker.cancel('_definition-message-consumer');
  bp.broker.cancel('_definition-call-consumer');
  bp.broker.cancel('_definition-call-cancel-consumer');
};

proto.onProcessMessage = function onProcessMessage(routingKey, message) {
  const content = message.content;
  const isRedelivered = message.fields.redelivered;
  const {id: childId, executionId: childExecutionId, inbound} = content;

  if (isRedelivered && message.properties.persistent === false) return;

  switch (routingKey) {
    case 'execution.stop': {
      if (childExecutionId === this.executionId) {
        message.ack();
        return this.onStopped(message);
      }
      break;
    }
    case 'process.leave': {
      return this.onProcessCompleted(message);
    }
  }

  this.stateChangeMessage(message, true);

  switch (routingKey) {
    case 'process.discard':
    case 'process.enter':
      this[statusSymbol] = 'executing';
      break;
    case 'process.discarded': {
      if (inbound && inbound.length) {
        const calledFrom = inbound[0];
        this.getApiByProcess({content: calledFrom}).cancel({
          executionId: calledFrom.executionId,
        });
      }
      break;
    }
    case 'process.end': {
      if (inbound && inbound.length) {
        const calledFrom = inbound[0];

        this.getApiByProcess({content: calledFrom}).signal({
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

        this.getApiByProcess({content: calledFrom}).sendApiMessage('error', {
          executionId: calledFrom.executionId,
          error: content.error,
        }, {mandatory: true, type: 'error'});
      } else {
        for (const bp of this.processes.slice()) {
          if (bp.id !== childId) bp.stop();
        }

        this.complete('error', {error: content.error});
      }
      break;
    }
  }
};

proto.stateChangeMessage = function stateChangeMessage(message, postponeMessage = true) {
  let previousMsg;
  const postponed = this.postponed;
  const idx = postponed.findIndex((msg) => msg.content.executionId === message.content.executionId);
  if (idx > -1) {
    previousMsg = postponed.splice(idx, 1)[0];
  }

  if (previousMsg) previousMsg.ack();
  if (postponeMessage) postponed.push(message);
};

proto.onProcessCompleted = function onProcessCompleted(message) {
  this.stateChangeMessage(message, false);
  if (message.fields.redelivered) return message.ack();

  const {id, executionId, type, inbound} = message.content;
  this.debug(`left <${executionId} (${id})> (${type}), pending runs ${this.postponedCount}`);

  if (inbound && inbound.length) {
    const bp = this.removeProcessByExecutionId(executionId);
    this.deactivateProcess(bp);
  }

  if (!this.postponed.length) {
    message.ack();
    this.complete('completed');
  }
};

proto.onStopped = function onStopped(message) {
  this.debug(`stop definition execution (stop process executions ${this.processes.length})`);
  this.activityQ.close();
  this.deactivate();
  for (const bp of this.processes.slice()) bp.stop();
  this[stoppedSymbol] = true;
  return this.broker.publish('execution', `execution.stopped.${this.executionId}`, {
    ...this[stateMessageSymbol].content,
    ...message.content,
  }, {type: 'stopped', persistent: false});
};

proto.onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;
  const delegate = message.properties.delegate;

  if (delegate && this.id === message.content.id) {
    const referenceId = getPropertyValue(message, 'content.message.id');
    this.startProcessesByMessage({referenceId, referenceType: messageType});
  }

  if (delegate) {
    for (const bp of this.processes.slice()) {
      bp.broker.publish('api', routingKey, cloneContent(message.content), message.properties);
    }
  }

  if (this.executionId !== message.content.executionId) return;

  if (messageType === 'stop') {
    this.activityQ.queueMessage({routingKey: 'execution.stop'}, cloneContent(message.content), {persistent: false});
  }
};

proto.startProcessesByMessage = function startProcessesByMessage(reference) {
  const bps = this[processesSymbol];
  if (bps.length < 2) return;

  for (const bp of bps) {
    if (bp.isExecutable) continue;
    if (!bp.getStartActivities(reference).length) continue;

    if (!bp.executionId) {
      this.debug(`start <${bp.id}> by <${reference.referenceId}> (${reference.referenceType})`);
      this.activateProcess(bp);
      this.processes.push(bp);
      bp.init();
      bp.run();
      if (reference.referenceType === 'message') return;
      continue;
    }

    this.debug(`start new <${bp.id}> by <${reference.referenceId}> (${reference.referenceType})`);

    const targetProcess = this.context.getNewProcessById(bp.id);
    this.activateProcess(targetProcess);
    this.processes.push(targetProcess);
    targetProcess.init();
    targetProcess.run();
    if (reference.referenceType === 'message') return;
  }
};

proto.onMessageOutbound = function onMessageOutbound(routingKey, message) {
  const content = message.content;
  const {target, source} = content;

  this.debug(`conveying message from <${source.processId}.${source.id}> to`, target.id ? `<${target.processId}.${target.id}>` : `<${target.processId}>`);

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

  this.activateProcess(targetProcess);
  this.processes.push(targetProcess);
  targetProcess.init();
  targetProcess.run();
  targetProcess.sendMessage(message);
};

proto.onCallActivity = function onCallActivity(routingKey, message) {
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

  this.debug(`call from <${fromParent.id}.${fromId}> to <${calledElement}>`);

  this.activateProcess(targetProcess);
  this.processes.push(targetProcess);
  targetProcess.init(bpExecutionId);
  targetProcess.run({inbound: [cloneContent(content)]});
};

proto.onCancelCallActivity = function onCancelCallActivity(routingKey, message) {
  const content = message.content;
  const {calledElement, id: fromId, executionId: fromExecutionId, parent: fromParent} = content;

  const bpExecutionId = `${brokerSafeId(calledElement)}_${fromExecutionId}`;
  const targetProcess = this.getProcessByExecutionId(bpExecutionId);
  if (!targetProcess) return;

  this.debug(`cancel call from <${fromParent.id}.${fromId}> to <${calledElement}>`);

  targetProcess.getApi().discard();
};

proto.onDelegateMessage = function onDelegateMessage(routingKey, executeMessage) {
  const content = executeMessage.content;
  const messageType = executeMessage.properties.type;
  const delegateMessage = executeMessage.content.message;

  const reference = this.context.getActivityById(delegateMessage.id);
  const message = reference && reference.resolve(executeMessage);

  this.debug(`<${reference ? `${messageType} <${delegateMessage.id}>` : `anonymous ${messageType}`} event received from <${content.parent.id}.${content.id}>. Delegating.`);

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

  this.broker.publish('event', `definition.${messageType}`, this.createMessage({
    message: message && cloneContent(message),
  }), {type: messageType});
};

proto.getProcesses = function getProcesses() {
  const result = this.processes.slice();
  for (const bp of this[processesSymbol]) {
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
  return this.processes.find((bp) => bp.executionId === processExecutionId);
};

proto.getRunningProcesses = function getRunningProcesses() {
  return this.processes.filter((bp) => bp.executionId);
};

proto.getExecutableProcesses = function getExecutableProcesses() {
  return this.executableProcesses.slice();
};

proto.getState = function getState() {
  return {
    executionId: this.executionId,
    stopped: this.stopped,
    completed: this.completed,
    status: this.status,
    processes: this.processes.map((bp) => bp.getState()),
  };
};

proto.removeProcessByExecutionId = function removeProcessByExecutionId(processExecutionId) {
  const idx = this.processes.findIndex((p) => p.executionId === processExecutionId);
  if (idx === -1) return;
  return this.processes.splice(idx, 1)[0];
};

proto.getPostponed = function getPostponed(...args) {
  return this.processes.reduce((result, p) => {
    result = result.concat(p.getPostponed(...args));
    return result;
  }, []);
};

proto.complete = function complete(completionType, content, options) {
  this.deactivate();
  const stateMessage = this[stateMessageSymbol];
  this.debug(`definition execution ${completionType} in ${Date.now() - stateMessage.properties.timestamp}ms`);
  if (!content) content = this.createMessage();
  this[completedSymbol] = true;
  if (this.status !== 'terminated') this[statusSymbol] = completionType;
  this.broker.deleteQueue(this.activityQ.name);

  return this.broker.publish('execution', `execution.${completionType}.${this.executionId}`, {
    ...stateMessage.content,
    output: {...this.environment.output},
    ...content,
    state: completionType,
  }, {type: completionType, mandatory: completionType === 'error', ...options});
};

proto.publishCompletionMessage = function publishCompletionMessage(completionType, content) {
  this.deactivate();
  this.debug(completionType);
  if (!content) content = this.createMessage();
  return this.broker.publish('execution', `execution.${completionType}.${this.executionId}`, content, { type: completionType });
};

proto.createMessage = function createMessage(content = {}) {
  return {
    id: this.id,
    type: this.type,
    executionId: this.executionId,
    status: this.status,
    ...content,
  };
};

proto.getApi = function getApi(apiMessage) {
  if (!apiMessage) apiMessage = this[stateMessageSymbol] || {content: this.createMessage()};

  const content = apiMessage.content;
  if (content.executionId !== this.executionId) {
    return this.getApiByProcess(apiMessage);
  }

  const api = DefinitionApi(this.broker, apiMessage);

  api.getExecuting = function getExecuting() {
    return this.postponed.reduce((result, msg) => {
      if (msg.content.executionId === content.executionId) return result;
      result.push(this.getApi(msg));
      return result;
    }, []);
  };

  return api;
};

proto.getApiByProcess = function getApiByProcess(message) {
  const content = message.content;
  let api = this.getApiByExecutionId(content.executionId, message);
  if (api) return api;

  if (!content.parent) return;

  api = this.getApiByExecutionId(content.parent.executionId, message);
  if (api) return api;

  if (!content.parent.path) return;

  for (const pp of content.parent.path) {
    api = this.getApiByExecutionId(pp.executionId, message);
    if (api) return api;
  }
};

proto.getApiByExecutionId = function getApiByExecutionId(parentExecutionId, message) {
  const processInstance = this.getProcessByExecutionId(parentExecutionId);
  if (!processInstance) return;
  return processInstance.getApi(message);
};

proto.debug = function debugMessage(logMessage, executionId) {
  executionId = executionId || this.executionId;
  this[parentSymbol].logger.debug(`<${executionId} (${this.id})> ${logMessage}`);
};
