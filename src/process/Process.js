import ProcessExecution from './ProcessExecution';
import {getUniqueId} from '../shared';
import {ProcessApi} from '../Api';
import {ProcessBroker} from '../EventBroker';
import {cloneMessage, cloneContent, cloneParent} from '../messageHelper';
import {makeErrorFromMessage} from '../error/Errors';

const consumingSymbol = Symbol.for('consuming');
const countersSymbol = Symbol.for('counters');
const execSymbol = Symbol.for('exec');
const executeMessageSymbol = Symbol.for('executeMessage');
const extensionsSymbol = Symbol.for('extensions');
const messageHandlersSymbol = Symbol.for('messageHandlers');
const stateMessageSymbol = Symbol.for('stateMessage');
const statusSymbol = Symbol.for('status');
const stoppedSymbol = Symbol.for('stopped');

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
  this.broker = broker;
  this.on = on;
  this.once = once;
  this.waitFor = waitFor;

  this[messageHandlersSymbol] = {
    onApiMessage: this._onApiMessage.bind(this),
    onRunMessage: this._onRunMessage.bind(this),
    onExecutionMessage: this._onExecutionMessage.bind(this),
  };

  this.logger = environment.Logger(type.toLowerCase());

  this[extensionsSymbol] = context.loadExtensions(this);
}

const proto = Process.prototype;

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
  this._debug(`initialized with executionId <${initExecutionId}>`);
  this._publishEvent('init', this._createMessage({executionId: initExecutionId}));
};

proto.run = function run(runContent) {
  if (this.isRunning) throw new Error(`process <${this.id}> is already running`);

  const exec = this[execSymbol];
  const executionId = exec.executionId = exec.initExecutionId || getUniqueId(this.id);
  exec.initExecutionId = undefined;

  const content = this._createMessage({...runContent, executionId});

  const broker = this.broker;
  broker.publish('run', 'run.enter', content);
  broker.publish('run', 'run.start', cloneContent(content));
  broker.publish('run', 'run.execute', cloneContent(content));

  this._activateRunConsumers();
};

proto.resume = function resume() {
  if (this.isRunning) throw new Error(`cannot resume running process <${this.id}>`);
  if (!this.status) return this;

  this[stoppedSymbol] = false;

  const content = this._createMessage();
  this.broker.publish('run', 'run.resume', content, {persistent: false});
  this._activateRunConsumers();
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

proto.getState = function getState() {
  return this._createMessage({
    environment: this.environment.getState(),
    status: this.status,
    stopped: this.stopped,
    counters: this.counters,
    broker: this.broker.getState(true),
    execution: this.execution && this.execution.getState(),
    output: {...this.environment.output},
  });
};

proto.cancelActivity = function cancelActivity(message) {
  return this.getApi().cancel(message, {delegate: true});
};

proto._activateRunConsumers = function activateRunConsumers() {
  this[consumingSymbol] = true;
  const broker = this.broker;
  const {onApiMessage, onRunMessage} = this[messageHandlersSymbol];
  broker.subscribeTmp('api', `process.*.${this.executionId}`, onApiMessage, {noAck: true, consumerTag: '_process-api', priority: 100});
  broker.getQueue('run-q').assertConsumer(onRunMessage, {exclusive: true, consumerTag: '_process-run'});
};

proto._deactivateRunConsumers = function deactivateRunConsumers() {
  const broker = this.broker;
  broker.cancel('_process-api');
  broker.cancel('_process-run');
  broker.cancel('_process-execution');
  this[consumingSymbol] = false;
};

proto._onRunMessage = function onRunMessage(routingKey, message) {
  const {content, fields} = message;

  if (routingKey === 'run.resume') {
    return this._onResumeMessage(message);
  }

  const exec = this[execSymbol];
  this[stateMessageSymbol] = message;

  switch (routingKey) {
    case 'run.enter': {
      this._debug('enter');

      this[statusSymbol] = 'entered';
      if (fields.redelivered) break;

      exec.execution = undefined;
      this._publishEvent('enter', content);

      break;
    }
    case 'run.start': {
      this._debug('start');
      this[statusSymbol] = 'start';
      this._publishEvent('start', content);
      break;
    }
    case 'run.execute': {
      this[statusSymbol] = 'executing';
      const executeMessage = cloneMessage(message);
      if (fields.redelivered && !exec.execution) {
        executeMessage.fields.redelivered = undefined;
      }
      this[executeMessageSymbol] = message;

      this.broker.getQueue('execution-q').assertConsumer(this[messageHandlersSymbol].onExecutionMessage, {
        exclusive: true,
        consumerTag: '_process-execution',
      });

      const execution = exec.execution = exec.execution || new ProcessExecution(this, this.context);
      return execution.execute(executeMessage);
    }
    case 'run.error': {
      this._publishEvent('error', cloneContent(content, {
        error: fields.redelivered ? makeErrorFromMessage(message) : content.error,
      }));
      break;
    }
    case 'run.end': {
      this[statusSymbol] = 'end';

      if (fields.redelivered) break;
      this._debug('completed');

      this[countersSymbol].completed++;

      this.broker.publish('run', 'run.leave', content);

      this._publishEvent('end', content);
      break;
    }
    case 'run.discarded': {
      this[statusSymbol] = 'discarded';
      if (fields.redelivered) break;

      this[countersSymbol].discarded++;

      this.broker.publish('run', 'run.leave', content);

      this._publishEvent('discarded', content);
      break;
    }
    case 'run.leave': {
      this[statusSymbol] = undefined;
      this.broker.cancel('_process-api');
      const {output, ...rest} = content; // eslint-disable-line no-unused-vars
      this._publishEvent('leave', rest);
      break;
    }
  }

  message.ack();
};

proto._onResumeMessage = function onResumeMessage(message) {
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

  this._debug(`resume from ${this.status}`);

  return this.broker.publish('run', stateMessage.fields.routingKey, cloneContent(stateMessage.content), stateMessage.properties);
};

proto._onExecutionMessage = function onExecutionMessage(routingKey, message) {
  const content = message.content;
  const messageType = message.properties.type;
  message.ack();

  switch (messageType) {
    case 'stopped': {
      return this._onStop();
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

proto._publishEvent = function publishEvent(state, content) {
  const eventContent = this._createMessage({...content, state});
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

proto._onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;

  switch (messageType) {
    case 'stop': {
      if (this.execution && !this.execution.completed) return;
      this._onStop();
      break;
    }
  }
};

proto._onStop = function onStop() {
  this[stoppedSymbol] = true;
  this._deactivateRunConsumers();
  return this._publishEvent('stop');
};

proto._createMessage = function createMessage(override = {}) {
  return {
    id: this.id,
    type: this.type,
    name: this.name,
    executionId: this.executionId,
    parent: {...this.parent},
    ...override,
  };
};

proto._debug = function debug(msg) {
  this.logger.debug(`<${this.id}> ${msg}`);
};
