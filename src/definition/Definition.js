import DefinitionExecution from './DefinitionExecution';
import {DefinitionApi} from '../Api';
import {DefinitionBroker} from '../EventBroker';
import {getUniqueId, getOptionsAndCallback} from '../shared';
import {makeErrorFromMessage} from '../error/Errors';
import {cloneMessage, cloneContent} from '../messageHelper';

const kConsuming = Symbol.for('consuming');
const kCounters = Symbol.for('counters');
const kExec = Symbol.for('execution');
const kExecuteMessage = Symbol.for('executeMessage');
const kMessageHandlers = Symbol.for('messageHandlers');
const kStateMessage = Symbol.for('stateMessage');
const kStatus = Symbol.for('status');
const kStopped = Symbol.for('stopped');

export default Definition;

export function Definition(context, options) {
  if (!(this instanceof Definition)) return new Definition(context, options);
  if (!context) throw new Error('No context');

  const {id, name, type = 'definition'} = context;

  this.id = id;
  this.type = type;
  this.name = name;

  let environment;
  if (options) {
    environment = this.environment = context.environment.clone(options);
    this.context = context.clone(environment);
  } else {
    environment = this.environment = context.environment;
    this.context = context;
  }

  this[kCounters] = {
    completed: 0,
    discarded: 0,
  };

  this[kStopped] = false;
  this[kExec] = {};

  const onBrokerReturn = this._onBrokerReturnFn.bind(this);
  this[kMessageHandlers] = {
    onBrokerReturn,
    onApiMessage: this._onApiMessage.bind(this),
    onRunMessage: this._onRunMessage.bind(this),
    onExecutionMessage: this._onExecutionMessage.bind(this),
  };

  const {broker, on, once, waitFor, emit, emitFatal} = DefinitionBroker(this, onBrokerReturn);
  this.broker = broker;

  this.on = on;
  this.once = once;
  this.waitFor = waitFor;
  this.emit = emit;
  this.emitFatal = emitFatal;

  this.logger = environment.Logger(type.toLowerCase());
}

const proto = Definition.prototype;

Object.defineProperty(proto, 'counters', {
  enumerable: true,
  get() {
    return {...this[kCounters]};
  },
});

Object.defineProperty(proto, 'execution', {
  enumerable: true,
  get() {
    return this[kExec].execution;
  },
});

Object.defineProperty(proto, 'executionId', {
  enumerable: true,
  get() {
    return this[kExec].executionId;
  },
});

Object.defineProperty(proto, 'isRunning', {
  enumerable: true,
  get() {
    if (!this[kConsuming]) return false;
    return !!this.status;
  },
});

Object.defineProperty(proto, 'status', {
  enumerable: true,
  get() {
    return this[kStatus];
  },
});

Object.defineProperty(proto, 'stopped', {
  enumerable: true,
  get() {
    return this[kStopped];
  },
});

proto.run = function run(optionsOrCallback, optionalCallback) {
  const [runOptions, callback] = getOptionsAndCallback(optionsOrCallback, optionalCallback);
  if (this.isRunning) {
    const err = new Error('definition is already running');
    if (callback) return callback(err);
    throw err;
  }

  if (callback) {
    addConsumerCallbacks(this, callback);
  }

  const exec = this[kExec];
  exec.executionId = getUniqueId(this.id);
  const content = this._createMessage({...runOptions});

  const broker = this.broker;
  broker.publish('run', 'run.enter', content);
  broker.publish('run', 'run.start', cloneContent(content));
  broker.publish('run', 'run.execute', cloneContent(content));

  this.logger.debug(`<${this.executionId} (${this.id})> run`);

  this._activateRunConsumers();

  return this;
};

proto.resume = function resume(callback) {
  if (this.isRunning) {
    const err = new Error('cannot resume running definition');
    if (callback) return callback(err);
    throw err;
  }

  this[kStopped] = false;
  if (!this.status) return this;

  if (callback) {
    addConsumerCallbacks(this, callback);
  }

  this.logger.debug(`<${this.executionId} (${this.id})> resume`);

  const content = this._createMessage();
  this.broker.publish('run', 'run.resume', content, {persistent: false});
  this._activateRunConsumers();
  return this;
};

proto.recover = function recover(state) {
  if (this.isRunning) throw new Error('cannot recover running definition');
  if (!state) return this;

  this[kStopped] = !!state.stopped;
  this[kStatus] = state.status;

  const exec = this[kExec];
  exec.executionId = state.executionId;
  if (state.counters) {
    this[kCounters] = {...this[kCounters], ...state.counters};
  }

  this.environment.recover(state.environment);

  if (state.execution) {
    exec.execution = new DefinitionExecution(this, this.context).recover(state.execution);
  }

  this.broker.recover(state.broker);

  return this;
};

proto.shake = function shake(startId) {
  let result = {};
  const broker = this.broker;

  let bps;
  if (startId) {
    const startActivity = this.getActivityById(startId);
    if (!startActivity) return;
    const bp = this.getProcessById(startActivity.parent.id);
    if (!bp) return;
    bps = [bp];
  } else bps = this.getProcesses();

  bps.forEach(shakeProcess);

  return result;

  function shakeProcess(shakeBp) {
    let shovel;
    if (!shakeBp.isRunning) {
      shovel = shakeBp.broker.createShovel('shaker', {
        exchange: 'event',
        pattern: '*.shake#',
      }, {
        broker,
        exchange: 'event',
      });
    }

    const shakeResult = shakeBp.shake(startId);
    if (shovel) shakeBp.broker.closeShovel('shaker');

    result = {
      ...result,
      ...shakeResult,
    };
  }
};

proto.getState = function getState() {
  return this._createMessage({
    status: this.status,
    stopped: this.stopped,
    counters: this.counters,
    environment: this.environment.getState(),
    execution: this.execution && this.execution.getState(),
    broker: this.broker.getState(true),
  });
};

proto.getProcesses = function getProcesses() {
  const execution = this.execution;
  if (execution) return execution.getProcesses();
  return this.context.getProcesses();
};

proto.getExecutableProcesses = function getExecutableProcesses() {
  const execution = this.execution;
  if (execution) return execution.getExecutableProcesses();
  return this.context.getExecutableProcesses();
};

proto.getRunningProcesses = function getRunningProcesses() {
  const execution = this.execution;
  if (!execution) return [];
  return execution.getRunningProcesses();
};

proto.getProcessById = function getProcessById(processId) {
  return this.getProcesses().find((p) => p.id === processId);
};

proto.getActivityById = function getActivityById(childId) {
  const bps = this.getProcesses();
  for (const bp of bps) {
    const child = bp.getActivityById(childId);
    if (child) return child;
  }
  return null;
};

proto.getElementById = function getElementById(elementId) {
  return this.context.getActivityById(elementId);
};

proto.getPostponed = function getPostponed(...args) {
  const execution = this.execution;
  if (!execution) return [];
  return execution.getPostponed(...args);
};

proto.getApi = function getApi(message) {
  const execution = this.execution;
  if (execution) return execution.getApi(message);
  message = message || this[kStateMessage];
  if (!message) throw new Error('Definition is not running');
  return DefinitionApi(this.broker, message);
};

proto.signal = function signal(message) {
  return this.getApi().signal(message, {delegate: true});
};

proto.cancelActivity = function cancelActivity(message) {
  return this.getApi().cancel(message, {delegate: true});
};

proto.sendMessage = function sendMessage(message) {
  const messageContent = {message};
  let messageType = 'message';
  const reference = message && message.id && this.getElementById(message.id);
  if (reference && reference.resolve) {
    const resolvedReference = reference.resolve(this._createMessage({message}));
    messageType = resolvedReference.messageType || messageType;
    messageContent.message = {...message, ...resolvedReference};
  }

  return this.getApi().sendApiMessage(messageType, messageContent, {delegate: true});
};

proto.stop = function stop() {
  if (!this.isRunning) return;
  this.getApi().stop();
};

proto._activateRunConsumers = function activateRunConsumers() {
  this[kConsuming] = true;
  const broker = this.broker;
  const {onApiMessage, onRunMessage} = this[kMessageHandlers];
  broker.subscribeTmp('api', `definition.*.${this.executionId}`, onApiMessage, {
    noAck: true,
    consumerTag: '_definition-api',
  });
  broker.getQueue('run-q').assertConsumer(onRunMessage, {
    exclusive: true,
    consumerTag: '_definition-run',
  });
};

proto._deactivateRunConsumers = function deactivateRunConsumers() {
  const broker = this.broker;
  broker.cancel('_definition-api');
  broker.cancel('_definition-run');
  broker.cancel('_definition-execution');
  this[kConsuming] = false;
};

proto._createMessage = function createMessage(override) {
  return {
    id: this.id,
    type: this.type,
    name: this.name,
    executionId: this.executionId,
    ...override,
  };
};

proto._onRunMessage = function onRunMessage(routingKey, message) {
  const {content, fields} = message;
  if (routingKey === 'run.resume') {
    return this._onResumeMessage(message);
  }

  const exec = this[kExec];
  this[kStateMessage] = message;

  switch (routingKey) {
    case 'run.enter': {
      this.logger.debug(`<${this.executionId} (${this.id})> enter`);

      this[kStatus] = 'entered';
      if (fields.redelivered) break;

      exec.execution = undefined;
      this._publishEvent('enter', content);
      break;
    }
    case 'run.start': {
      this.logger.debug(`<${this.executionId} (${this.id})> start`);
      this[kStatus] = 'start';
      this._publishEvent('start', content);
      break;
    }
    case 'run.execute': {
      this[kStatus] = 'executing';
      const executeMessage = cloneMessage(message);
      if (fields.redelivered && !exec.execution) {
        executeMessage.fields.redelivered = undefined;
      }
      this[kExecuteMessage] = message;
      this.broker.getQueue('execution-q').assertConsumer(this[kMessageHandlers].onExecutionMessage, {
        exclusive: true,
        consumerTag: '_definition-execution',
      });

      exec.execution = exec.execution || new DefinitionExecution(this, this.context);

      if (executeMessage.fields.redelivered) {
        this._publishEvent('resume', content);
      }

      return exec.execution.execute(executeMessage);
    }
    case 'run.end': {
      if (this[kStatus] === 'end') break;

      this[kCounters].completed++;

      this.logger.debug(`<${this.executionId} (${this.id})> completed`);
      this[kStatus] = 'end';
      this.broker.publish('run', 'run.leave', content);
      this._publishEvent('end', content);
      break;
    }
    case 'run.error': {
      this._publishEvent('error', {
        ...content,
        error: fields.redelivered ? makeErrorFromMessage(message) : content.error,
      }, {mandatory: true});
      break;
    }
    case 'run.discarded': {
      if (this[kStatus] === 'discarded') break;

      this[kCounters].discarded++;

      this[kStatus] = 'discarded';
      this.broker.publish('run', 'run.leave', content);
      break;
    }
    case 'run.leave': {
      message.ack();
      this[kStatus] = undefined;
      this._deactivateRunConsumers();

      this._publishEvent('leave', this._createMessage());
      return;
    }
  }

  message.ack();
};

proto._onResumeMessage = function onResumeMessage(message) {
  message.ack();

  const stateMessage = this[kStateMessage];

  switch (stateMessage.fields.routingKey) {
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
  const {content, properties} = message;
  const messageType = properties.type;

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
    default: {
      this.broker.publish('run', 'run.end', content);
    }
  }

  const executeMessage = this[kExecuteMessage];
  this[kExecuteMessage] = null;
  executeMessage.ack();
};

proto._onApiMessage = function onApiMessage(routingKey, message) {
  if (message.properties.type === 'stop') {
    const execution = this.execution;
    if (!execution || execution.completed) {
      this._onStop();
    }
  }
};

proto._publishEvent = function publishEvent(action, content, msgOpts) {
  const execution = this.execution;
  this.broker.publish('event', `definition.${action}`, execution ? execution._createMessage(content) : cloneContent(content), {
    type: action,
    ...msgOpts,
  });
};

proto._onStop = function onStop() {
  this[kStopped] = true;
  this._deactivateRunConsumers();
  return this._publishEvent('stop', this._createMessage());
};

proto._onBrokerReturnFn = function onBrokerReturn(message) {
  if (message.properties.type === 'error') {
    this._deactivateRunConsumers();
    const err = makeErrorFromMessage(message);
    throw err;
  }
};

proto._reset = function reset() {
  this[kExec].executionId = undefined;
  this._deactivateRunConsumers();
  this.broker.purgeQueue('run-q');
  this.broker.purgeQueue('execution-q');
};

proto._debug = function debug(msg) {
  this.logger.debug(`<${this.id}> ${msg}`);
};

function addConsumerCallbacks(definition, callback) {
  const broker = definition.broker;
  clearConsumers();

  broker.subscribeOnce('event', 'definition.stop', cbLeave, {consumerTag: '_definition-callback-stop'});
  broker.subscribeOnce('event', 'definition.leave', cbLeave, {consumerTag: '_definition-callback-leave'});
  broker.subscribeOnce('event', 'definition.error', cbError, {consumerTag: '_definition-callback-error'});

  function cbLeave(_, message) {
    clearConsumers();
    return callback(null, definition.getApi(message));
  }

  function cbError(_, message) {
    clearConsumers();
    definition._reset();
    return callback(makeErrorFromMessage(message));
  }

  function clearConsumers() {
    broker.cancel('_definition-callback-stop');
    broker.cancel('_definition-callback-leave');
    broker.cancel('_definition-callback-error');
  }
}
