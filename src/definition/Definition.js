import DefinitionExecution from './DefinitionExecution';
import {DefinitionApi} from '../Api';
import {DefinitionBroker} from '../EventBroker';
import {getUniqueId, getOptionsAndCallback} from '../shared';
import {makeErrorFromMessage} from '../error/Errors';
import {cloneMessage, cloneContent} from '../messageHelper';

const brokerSymbol = Symbol.for('broker');
const countersSymbol = Symbol.for('counters');
const statusSymbol = Symbol.for('status');
const stoppedSymbol = Symbol.for('stopped');
const consumingSymbol = Symbol.for('consuming');
const execSymbol = Symbol.for('exec');
const stateMessageSymbol = Symbol.for('stateMessage');
const executeMessageSymbol = Symbol.for('executeMessage');
const onReturnSymbol = Symbol.for('onReturn');

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

  this[countersSymbol] = {
    completed: 0,
    discarded: 0,
  };

  this[stoppedSymbol] = false;
  this[execSymbol] = {};

  const onReturn = this[onReturnSymbol] = getBrokerReturnFunction(this);
  const {broker, on, once, waitFor, emit, emitFatal} = DefinitionBroker(this, onReturn);
  this[brokerSymbol] = broker;

  this.on = on;
  this.once = once;
  this.waitFor = waitFor;
  this.emit = emit;
  this.emitFatal = emitFatal;

  this.logger = environment.Logger(type.toLowerCase());

  this.onRunMessage = this.onRunMessage.bind(this);
  this.onExecutionMessage = this.onExecutionMessage.bind(this);
}

const proto = Definition.prototype;

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

Object.defineProperty(proto, 'execution', {
  enumerable: true,
  get() {
    return this[execSymbol].execution;
  },
});

Object.defineProperty(proto, 'executionId', {
  enumerable: true,
  get() {
    return this[execSymbol].executionId;
  },
});

Object.defineProperty(proto, 'isRunning', {
  enumerable: true,
  get() {
    if (!this[consumingSymbol]) return false;
    return !!this.status;
  },
});

Object.defineProperty(proto, 'status', {
  enumerable: true,
  get() {
    return this[statusSymbol];
  },
});

Object.defineProperty(proto, 'stopped', {
  enumerable: true,
  get() {
    return this[stoppedSymbol];
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

  const exec = this[execSymbol];
  exec.executionId = getUniqueId(this.id);
  const content = this.createMessage({...runOptions});

  const broker = this.broker;
  broker.publish('run', 'run.enter', content);
  broker.publish('run', 'run.start', cloneContent(content));
  broker.publish('run', 'run.execute', cloneContent(content));

  this.logger.debug(`<${this.executionId} (${this.id})> run`);

  this.activateRunConsumers();

  return this;
};

proto.resume = function resume(callback) {
  if (this.isRunning) {
    const err = new Error('cannot resume running definition');
    if (callback) return callback(err);
    throw err;
  }

  this[stoppedSymbol] = false;
  if (!this.status) return this;

  if (callback) {
    addConsumerCallbacks(this, callback);
  }

  this.logger.debug(`<${this.executionId} (${this.id})> resume`);

  const content = this.createMessage();
  this.broker.publish('run', 'run.resume', content, {persistent: false});
  this.activateRunConsumers();
  return this;
};

proto.recover = function recover(state) {
  if (this.isRunning) throw new Error('cannot recover running definition');
  if (!state) return this;

  this[stoppedSymbol] = !!state.stopped;
  this[statusSymbol] = state.status;

  const exec = this[execSymbol];
  exec.executionId = state.executionId;
  if (state.counters) {
    this[countersSymbol] = {...this[countersSymbol], ...state.counters};
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

proto.activateRunConsumers = function activateRunConsumers() {
  this[consumingSymbol] = true;
  const broker = this.broker;
  broker.subscribeTmp('api', `definition.*.${this.executionId}`, this.onApiMessage.bind(this), {
    noAck: true,
    consumerTag: '_definition-api',
  });
  broker.getQueue('run-q').assertConsumer(this.onRunMessage, {exclusive: true, consumerTag: '_definition-run'});
};

proto.deactivateRunConsumers = function deactivateRunConsumers() {
  const broker = this.broker;
  broker.cancel('_definition-api');
  broker.cancel('_definition-run');
  broker.cancel('_definition-execution');
  this[consumingSymbol] = false;
};

proto.stop = function stop() {
  if (!this.isRunning) return;
  this.getApi().stop();
};

proto.createMessage = function createMessage(override) {
  return {
    id: this.id,
    type: this.type,
    name: this.name,
    executionId: this.executionId,
    ...override,
  };
};

proto.onRunMessage = function onRunMessage(routingKey, message) {
  const {content, ack, fields} = message;
  if (routingKey === 'run.resume') {
    return this.onResumeMessage(message);
  }

  const exec = this[execSymbol];
  this[stateMessageSymbol] = message;

  switch (routingKey) {
    case 'run.enter': {
      this.logger.debug(`<${this.executionId} (${this.id})> enter`);

      this[statusSymbol] = 'entered';
      if (fields.redelivered) break;

      exec.execution = undefined;
      this.publishEvent('enter', content);
      break;
    }
    case 'run.start': {
      this.logger.debug(`<${this.executionId} (${this.id})> start`);
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
      this.broker.getQueue('execution-q').assertConsumer(this.onExecutionMessage, {exclusive: true, consumerTag: '_definition-execution'});

      exec.execution = exec.execution || new DefinitionExecution(this, this.context);

      if (executeMessage.fields.redelivered) {
        this.publishEvent('resume', content);
      }

      return exec.execution.execute(executeMessage);
    }
    case 'run.end': {
      if (this.status === 'end') break;

      this[countersSymbol].completed++;

      this.logger.debug(`<${this.executionId} (${this.id})> completed`);
      this[statusSymbol] = 'end';
      this.broker.publish('run', 'run.leave', content);
      this.publishEvent('end', content);
      break;
    }
    case 'run.discarded': {
      if (this.status === 'discarded') break;

      this[countersSymbol].discarded++;

      this[statusSymbol] = 'discarded';
      this.broker.publish('run', 'run.leave', content);
      break;
    }
    case 'run.error': {
      this.publishEvent('error', cloneContent(content, {
        error: fields.redelivered ? makeErrorFromMessage(message) : content.error,
      }), {mandatory: true});
      break;
    }
    case 'run.leave': {
      ack();
      this[statusSymbol] = undefined;
      this.deactivateRunConsumers();

      this.publishEvent('leave');
      break;
    }
  }

  ack();
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
  const {content, properties} = message;
  const messageType = properties.type;

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
    default: {
      this.broker.publish('run', 'run.end', content);
    }
  }

  const exeuteMessage = this[executeMessageSymbol];
  if (exeuteMessage) {
    const ackMessage = exeuteMessage;
    this[executeMessageSymbol] = null;
    ackMessage.ack();
  }
};

proto.onApiMessage = function onApiMessage(routingKey, message) {
  if (message.properties.type === 'stop') {
    const execution = this.execution;
    if (!execution || execution.completed) {
      this.onStop();
    }
  }
};

proto.publishEvent = function publishEvent(action, content = {}, msgOpts) {
  const execution = this.execution;
  this.broker.publish('event', `definition.${action}`, execution ? execution.createMessage(content) : content, {
    type: action,
    ...msgOpts,
  });
};

proto.getState = function getState() {
  return this.createMessage({
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
  const siblings = this.getProcesses();
  for (const sibling of siblings) {
    const child = sibling.getActivityById(childId);
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
  message = message || this[stateMessageSymbol];
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
    const resolvedReference = reference.resolve(this.createMessage({message}));
    messageType = resolvedReference.messageType || messageType;
    messageContent.message = {...message, ...resolvedReference};
  }

  return this.getApi().sendApiMessage(messageType, messageContent, {delegate: true});
};

proto.onStop = function onStop() {
  this[stoppedSymbol] = true;
  this.deactivateRunConsumers();
  return this.publishEvent('stop');
};

proto.reset = function reset() {
  this[execSymbol].executionId = undefined;
  this.deactivateRunConsumers();
  this.broker.purgeQueue('run-q');
  this.broker.purgeQueue('execution-q');
};

proto.debug = function debug(msg) {
  this.logger.debug(`<${this.id}> ${msg}`);
};

function addConsumerCallbacks(definition, callback) {
  const broker = definition.broker;
  broker.off('return', definition[onReturnSymbol]);

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
    definition.reset();
    return callback(makeErrorFromMessage(message));
  }

  function clearConsumers() {
    broker.cancel('_definition-callback-stop');
    broker.cancel('_definition-callback-leave');
    broker.cancel('_definition-callback-error');
    broker.on('return', definition[onReturnSymbol]);
  }
}

function getBrokerReturnFunction(definition) {
  return function onBrokerReturn(message) {
    if (message.properties.type === 'error') {
      definition.deactivateRunConsumers();
      const err = makeErrorFromMessage(message);
      throw err;
    }
  };
}
