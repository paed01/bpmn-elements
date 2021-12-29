import ProcessExecution from './ProcessExecution';
import {getUniqueId} from '../shared';
import {ProcessApi} from '../Api';
import {ProcessBroker} from '../EventBroker';
import {cloneMessage, cloneContent, cloneParent} from '../messageHelper';
import {makeErrorFromMessage} from '../error/Errors';

const brokerSymbol = Symbol.for('broker');
const countersSymbol = Symbol.for('counters');
const extensionsSymbol = Symbol.for('extensions');
const statusSymbol = Symbol.for('status');
const stoppedSymbol = Symbol.for('stopped');
const consumingSymbol = Symbol.for('consuming');
const execSymbol = Symbol.for('exec');
const stateMessageSymbol = Symbol.for('stateMessage');
const executeMessageSymbol = Symbol.for('executeMessage');

export default Process;

export function Process(processDef, context) {
  const {id, type = 'process', name, parent, behaviour = {}} = processDef;
  this.id = id;
  this.type = type;
  this.name = name;
  this.parent = parent ? cloneParent(parent) : {};
  this.behaviour = behaviour;

  const {isExecutable} = behaviour;
  this.isExecutable = isExecutable;

  const environment = this.environment = context.environment;
  this.context = context;
  this[countersSymbol] = {
    completed: 0,
    discarded: 0,
  };
  this[stoppedSymbol] = false;
  this[execSymbol] = {};

  const {broker, on, once, waitFor} = ProcessBroker(this);
  this[brokerSymbol] = broker;
  this.on = on;
  this.once = once;
  this.waitFor = waitFor;

  this.onRunMessage = this.onRunMessage.bind(this);
  this.onExecutionMessage = this.onExecutionMessage.bind(this);
  this.logger = environment.Logger(type.toLowerCase());

  this[extensionsSymbol] = context.loadExtensions(this);
}

const proto = Process.prototype;

Object.defineProperty(proto, 'broker', {
  enumerable: true,
  get() {
    return this[brokerSymbol];
  },
});

Object.defineProperty(proto, 'counters', {
  enumerable: true,
  get() {
    return {...this[countersSymbol]};
  },
});

Object.defineProperty(proto, 'extensions', {
  enumerable: true,
  get() {
    return this[extensionsSymbol];
  },
});

Object.defineProperty(proto, 'stopped', {
  enumerable: true,
  get() {
    return this[stoppedSymbol];
  },
});

Object.defineProperty(proto, 'isRunning', {
  enumerable: true,
  get() {
    if (!this[consumingSymbol]) return false;
    return !!this.status;
  },
});

Object.defineProperty(proto, 'executionId', {
  enumerable: true,
  get() {
    const {executionId, initExecutionId} = this[execSymbol];
    return executionId || initExecutionId;
  },
});

Object.defineProperty(proto, 'execution', {
  enumerable: true,
  get() {
    return this[execSymbol].execution;
  },
});

Object.defineProperty(proto, 'status', {
  enumerable: true,
  get() {
    return this[statusSymbol];
  },
});

proto.init = function init(useAsExecutionId) {
  const exec = this[execSymbol];
  const initExecutionId = exec.initExecutionId = useAsExecutionId || getUniqueId(this.id);
  this.debug(`initialized with executionId <${initExecutionId}>`);
  this.publishEvent('init', this.createMessage({executionId: initExecutionId}));
};

proto.run = function run(runContent) {
  if (this.isRunning) throw new Error(`process <${this.id}> is already running`);

  const exec = this[execSymbol];
  const executionId = exec.executionId = exec.initExecutionId || getUniqueId(this.id);
  exec.initExecutionId = undefined;

  const content = this.createMessage({...runContent, executionId});

  const broker = this.broker;
  broker.publish('run', 'run.enter', content);
  broker.publish('run', 'run.start', cloneContent(content));
  broker.publish('run', 'run.execute', cloneContent(content));

  this.activateRunConsumers();
};

proto.resume = function resume() {
  if (this.isRunning) throw new Error(`cannot resume running process <${this.id}>`);
  if (!this.status) return this;

  this[stoppedSymbol] = false;

  const content = this.createMessage();
  this.broker.publish('run', 'run.resume', content, {persistent: false});
  this.activateRunConsumers();
  return this;
};

proto.recover = function recover(state) {
  if (this.isRunning) throw new Error(`cannot recover running process <${this.id}>`);
  if (!state) return this;

  this[stoppedSymbol] = !!state.stopped;
  this[statusSymbol] = state.status;
  const exec = this[execSymbol];
  exec.executionId = state.executionId;
  this[countersSymbol] = {...this[countersSymbol], ...state.counters};
  this.environment.recover(state.environment);

  if (state.execution) {
    exec.execution = new ProcessExecution(this, this.context).recover(state.execution);
  }

  this.broker.recover(state.broker);

  return this;
};

proto.shake = function shake(startId) {
  if (this.isRunning) return this.execution.shake(startId);
  return new ProcessExecution(this, this.context).shake(startId);
};

proto.activateRunConsumers = function activateRunConsumers() {
  this[consumingSymbol] = true;
  const broker = this.broker;
  broker.subscribeTmp('api', `process.*.${this.executionId}`, this.onApiMessage.bind(this), {noAck: true, consumerTag: '_process-api', priority: 100});
  broker.getQueue('run-q').assertConsumer(this.onRunMessage, {exclusive: true, consumerTag: '_process-run'});
};

proto.deactivateRunConsumers = function deactivateRunConsumers() {
  const broker = this.broker;
  broker.cancel('_process-api');
  broker.cancel('_process-run');
  broker.cancel('_process-execution');
  this[consumingSymbol] = false;
};

proto.stop = function stop() {
  if (!this.isRunning) return;
  this.getApi().stop();
};

proto.getApi = function getApi(message) {
  const execution = this.execution;
  if (execution) return execution.getApi(message);
  return ProcessApi(this.broker, message || this[stateMessageSymbol]);
};

proto.signal = function signal(message) {
  return this.getApi().signal(message, {delegate: true});
};

proto.cancelActivity = function cancelActivity(message) {
  return this.getApi().cancel(message, {delegate: true});
};

proto.onRunMessage = function onRunMessage(routingKey, message) {
  const {content, fields} = message;

  if (routingKey === 'run.resume') {
    return this.onResumeMessage(message);
  }

  const exec = this[execSymbol];
  this[stateMessageSymbol] = message;

  switch (routingKey) {
    case 'run.enter': {
      this.debug('enter');

      this[statusSymbol] = 'entered';
      if (fields.redelivered) break;

      exec.execution = undefined;
      this.publishEvent('enter', content);

      break;
    }
    case 'run.start': {
      this.debug('start');
      this[statusSymbol] = 'start';
      this.publishEvent('start', content);
      break;
    }
    case 'run.execute': {
      this[statusSymbol] = 'executing';
      const executeMessage = cloneMessage(message);
      if (fields.redelivered && !exec.execution) {
        executeMessage.fields.redelivered = undefined;
      }
      this[executeMessageSymbol] = message;

      this.broker.getQueue('execution-q').assertConsumer(this.onExecutionMessage, {exclusive: true, consumerTag: '_process-execution'});

      const execution = exec.execution = exec.execution || new ProcessExecution(this, this.context);
      return execution.execute(executeMessage);
    }
    case 'run.error': {
      this.publishEvent('error', cloneContent(content, {
        error: fields.redelivered ? makeErrorFromMessage(message) : content.error,
      }));
      break;
    }
    case 'run.end': {
      this[statusSymbol] = 'end';

      if (fields.redelivered) break;
      this.debug('completed');

      this[countersSymbol].completed++;

      this.broker.publish('run', 'run.leave', content);

      this.publishEvent('end', content);
      break;
    }
    case 'run.discarded': {
      this[statusSymbol] = 'discarded';
      if (fields.redelivered) break;

      this[countersSymbol].discarded++;

      this.broker.publish('run', 'run.leave', content);

      this.publishEvent('discarded', content);
      break;
    }
    case 'run.leave': {
      this[statusSymbol] = undefined;
      this.broker.cancel('_process-api');
      const {output, ...rest} = content; // eslint-disable-line no-unused-vars
      this.publishEvent('leave', rest);
      break;
    }
  }

  message.ack();
};

proto.onResumeMessage = function onResumeMessage(message) {
  message.ack();

  const stateMessage = this[stateMessageSymbol];
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

  this.debug(`resume from ${this.status}`);

  return this.broker.publish('run', stateMessage.fields.routingKey, cloneContent(stateMessage.content), stateMessage.properties);
};

proto.onExecutionMessage = function onExecutionMessage(routingKey, message) {
  const content = message.content;
  const messageType = message.properties.type;
  message.ack();

  switch (messageType) {
    case 'stopped': {
      return this.onStop();
    }
    case 'error': {
      this.broker.publish('run', 'run.error', content);
      this.broker.publish('run', 'run.discarded', content);
      break;
    }
    case 'discard':
      this.broker.publish('run', 'run.discarded', content);
      break;
    default: {
      this.broker.publish('run', 'run.end', content);
    }
  }

  const executeMessage = this[executeMessageSymbol];
  if (executeMessage) {
    this[executeMessageSymbol] = null;
    executeMessage.ack();
  }
};

proto.publishEvent = function publishEvent(state, content) {
  const eventContent = this.createMessage({...content, state});
  this.broker.publish('event', `process.${state}`, eventContent, {type: state, mandatory: state === 'error'});
};

proto.sendMessage = function sendMessage(message) {
  const messageContent = message.content;
  if (!messageContent) return;

  let targetsFound = false;
  if (messageContent.target && messageContent.target.id && this.getActivityById(messageContent.target.id)) {
    targetsFound = true;
  } else if (messageContent.message && this.getStartActivities({referenceId: messageContent.message.id, referenceType: messageContent.message.messageType}).length) {
    targetsFound = true;
  }
  if (!targetsFound) return;

  if (!this.status) this.run();
  this.getApi().sendApiMessage(message.properties.type || 'message', cloneContent(messageContent), {delegate: true});
};

proto.getActivityById = function getActivityById(childId) {
  if (this.execution) return this.execution.getActivityById(childId);
  return this.context.getActivityById(childId);
};

proto.getActivities = function getActivities() {
  if (this.execution) return this.execution.getActivities();
  return this.context.getActivities(this.id);
};

proto.getStartActivities = function getStartActivities(filterOptions) {
  return this.context.getStartActivities(filterOptions, this.id);
};

proto.getSequenceFlows = function getSequenceFlows() {
  if (this.execution) return this.execution.getSequenceFlows();
  return this.context.getSequenceFlows();
};

proto.getPostponed = function getPostponed(...args) {
  if (!this.execution) return [];
  return this.execution.getPostponed(...args);
};

proto.onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;

  switch (messageType) {
    case 'stop': {
      if (this.execution && !this.execution.completed) return;
      this.onStop();
      break;
    }
  }
};

proto.onStop = function onStop() {
  this[stoppedSymbol] = true;
  this.deactivateRunConsumers();
  return this.publishEvent('stop');
};

proto.createMessage = function createMessage(override = {}) {
  return {
    id: this.id,
    type: this.type,
    name: this.name,
    executionId: this.executionId,
    parent: {...this.parent},
    ...override,
  };
};

proto.getState = function getState() {
  return this.createMessage({
    environment: this.environment.getState(),
    status: this.status,
    stopped: this.stopped,
    counters: this.counters,
    broker: this.broker.getState(true),
    execution: this.execution && this.execution.getState(),
    output: {...this.environment.output},
  });
};

proto.debug = function debug(msg) {
  this.logger.debug(`<${this.id}> ${msg}`);
};

