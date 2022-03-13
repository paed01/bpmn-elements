"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Process = Process;
exports.default = void 0;

var _ProcessExecution = _interopRequireDefault(require("./ProcessExecution"));

var _shared = require("../shared");

var _Api = require("../Api");

var _EventBroker = require("../EventBroker");

var _messageHelper = require("../messageHelper");

var _Errors = require("../error/Errors");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const kConsuming = Symbol.for('consuming');
const kCounters = Symbol.for('counters');
const kExec = Symbol.for('execution');
const kExecuteMessage = Symbol.for('executeMessage');
const kExtensions = Symbol.for('extensions');
const kMessageHandlers = Symbol.for('messageHandlers');
const kStateMessage = Symbol.for('stateMessage');
const kStatus = Symbol.for('status');
const kStopped = Symbol.for('stopped');
var _default = Process;
exports.default = _default;

function Process(processDef, context) {
  const {
    id,
    type = 'process',
    name,
    parent,
    behaviour = {}
  } = processDef;
  this.id = id;
  this.type = type;
  this.name = name;
  this.parent = parent ? (0, _messageHelper.cloneParent)(parent) : {};
  this.behaviour = behaviour;
  const {
    isExecutable
  } = behaviour;
  this.isExecutable = isExecutable;
  const environment = this.environment = context.environment;
  this.context = context;
  this[kCounters] = {
    completed: 0,
    discarded: 0
  };
  this[kConsuming] = false;
  this[kExec] = {};
  this[kStatus] = undefined;
  this[kStopped] = false;
  const {
    broker,
    on,
    once,
    waitFor
  } = (0, _EventBroker.ProcessBroker)(this);
  this.broker = broker;
  this.on = on;
  this.once = once;
  this.waitFor = waitFor;
  this[kMessageHandlers] = {
    onApiMessage: this._onApiMessage.bind(this),
    onRunMessage: this._onRunMessage.bind(this),
    onExecutionMessage: this._onExecutionMessage.bind(this)
  };
  this.logger = environment.Logger(type.toLowerCase());
  this[kExtensions] = context.loadExtensions(this);
}

const proto = Process.prototype;
Object.defineProperty(proto, 'counters', {
  enumerable: true,

  get() {
    return { ...this[kCounters]
    };
  }

});
Object.defineProperty(proto, 'extensions', {
  enumerable: true,

  get() {
    return this[kExtensions];
  }

});
Object.defineProperty(proto, 'stopped', {
  enumerable: true,

  get() {
    return this[kStopped];
  }

});
Object.defineProperty(proto, 'isRunning', {
  enumerable: true,

  get() {
    if (!this[kConsuming]) return false;
    return !!this.status;
  }

});
Object.defineProperty(proto, 'executionId', {
  enumerable: true,

  get() {
    const {
      executionId,
      initExecutionId
    } = this[kExec];
    return executionId || initExecutionId;
  }

});
Object.defineProperty(proto, 'execution', {
  enumerable: true,

  get() {
    return this[kExec].execution;
  }

});
Object.defineProperty(proto, 'status', {
  enumerable: true,

  get() {
    return this[kStatus];
  }

});

proto.init = function init(useAsExecutionId) {
  const exec = this[kExec];
  const initExecutionId = exec.initExecutionId = useAsExecutionId || (0, _shared.getUniqueId)(this.id);

  this._debug(`initialized with executionId <${initExecutionId}>`);

  this._publishEvent('init', this._createMessage({
    executionId: initExecutionId
  }));
};

proto.run = function run(runContent) {
  if (this.isRunning) throw new Error(`process <${this.id}> is already running`);
  const exec = this[kExec];
  const executionId = exec.executionId = exec.initExecutionId || (0, _shared.getUniqueId)(this.id);
  exec.initExecutionId = undefined;

  const content = this._createMessage({ ...runContent,
    executionId
  });

  const broker = this.broker;
  broker.publish('run', 'run.enter', content);
  broker.publish('run', 'run.start', (0, _messageHelper.cloneContent)(content));
  broker.publish('run', 'run.execute', (0, _messageHelper.cloneContent)(content));

  this._activateRunConsumers();
};

proto.resume = function resume() {
  if (this.isRunning) throw new Error(`cannot resume running process <${this.id}>`);
  if (!this.status) return this;
  this[kStopped] = false;

  const content = this._createMessage();

  this.broker.publish('run', 'run.resume', content, {
    persistent: false
  });

  this._activateRunConsumers();

  return this;
};

proto.recover = function recover(state) {
  if (this.isRunning) throw new Error(`cannot recover running process <${this.id}>`);
  if (!state) return this;
  this[kStopped] = !!state.stopped;
  this[kStatus] = state.status;
  const exec = this[kExec];
  exec.executionId = state.executionId;
  this[kCounters] = { ...this[kCounters],
    ...state.counters
  };
  this.environment.recover(state.environment);

  if (state.execution) {
    exec.execution = new _ProcessExecution.default(this, this.context).recover(state.execution);
  }

  this.broker.recover(state.broker);
  return this;
};

proto.shake = function shake(startId) {
  if (this.isRunning) return this.execution.shake(startId);
  return new _ProcessExecution.default(this, this.context).shake(startId);
};

proto.stop = function stop() {
  if (!this.isRunning) return;
  this.getApi().stop();
};

proto.getApi = function getApi(message) {
  const execution = this.execution;
  if (execution) return execution.getApi(message);
  return (0, _Api.ProcessApi)(this.broker, message || this[kStateMessage]);
};

proto.signal = function signal(message) {
  return this.getApi().signal(message, {
    delegate: true
  });
};

proto.getState = function getState() {
  return this._createMessage({
    environment: this.environment.getState(),
    status: this.status,
    stopped: this.stopped,
    counters: this.counters,
    broker: this.broker.getState(true),
    execution: this.execution && this.execution.getState()
  });
};

proto.cancelActivity = function cancelActivity(message) {
  return this.getApi().cancel(message, {
    delegate: true
  });
};

proto._activateRunConsumers = function activateRunConsumers() {
  this[kConsuming] = true;
  const broker = this.broker;
  const {
    onApiMessage,
    onRunMessage
  } = this[kMessageHandlers];
  broker.subscribeTmp('api', `process.*.${this.executionId}`, onApiMessage, {
    noAck: true,
    consumerTag: '_process-api',
    priority: 100
  });
  broker.getQueue('run-q').assertConsumer(onRunMessage, {
    exclusive: true,
    consumerTag: '_process-run'
  });
};

proto._deactivateRunConsumers = function deactivateRunConsumers() {
  const broker = this.broker;
  broker.cancel('_process-api');
  broker.cancel('_process-run');
  broker.cancel('_process-execution');
  this[kConsuming] = false;
};

proto._onRunMessage = function onRunMessage(routingKey, message) {
  const {
    content,
    fields
  } = message;

  if (routingKey === 'run.resume') {
    return this._onResumeMessage(message);
  }

  const exec = this[kExec];
  this[kStateMessage] = message;

  switch (routingKey) {
    case 'run.enter':
      {
        this._debug('enter');

        this[kStatus] = 'entered';
        if (fields.redelivered) break;
        exec.execution = undefined;

        this._publishEvent('enter', content);

        break;
      }

    case 'run.start':
      {
        this._debug('start');

        this[kStatus] = 'start';

        this._publishEvent('start', content);

        break;
      }

    case 'run.execute':
      {
        this[kStatus] = 'executing';
        const executeMessage = (0, _messageHelper.cloneMessage)(message);

        if (fields.redelivered && !exec.execution) {
          executeMessage.fields.redelivered = undefined;
        }

        this[kExecuteMessage] = message;
        this.broker.getQueue('execution-q').assertConsumer(this[kMessageHandlers].onExecutionMessage, {
          exclusive: true,
          consumerTag: '_process-execution'
        });
        const execution = exec.execution = exec.execution || new _ProcessExecution.default(this, this.context);
        return execution.execute(executeMessage);
      }

    case 'run.error':
      {
        this[kStatus] = 'errored';

        this._publishEvent('error', (0, _messageHelper.cloneContent)(content, {
          error: fields.redelivered ? (0, _Errors.makeErrorFromMessage)(message) : content.error
        }));

        break;
      }

    case 'run.end':
      {
        this[kStatus] = 'end';
        if (fields.redelivered) break;

        this._debug('completed');

        this[kCounters].completed++;
        this.broker.publish('run', 'run.leave', content);

        this._publishEvent('end', content);

        break;
      }

    case 'run.discarded':
      {
        this[kStatus] = 'discarded';
        if (fields.redelivered) break;
        this[kCounters].discarded++;
        this.broker.publish('run', 'run.leave', content);

        this._publishEvent('discarded', content);

        break;
      }

    case 'run.leave':
      {
        this[kStatus] = undefined;
        this.broker.cancel('_process-api');
        const {
          output,
          ...rest
        } = content; // eslint-disable-line no-unused-vars

        this._publishEvent('leave', rest);

        break;
      }
  }

  message.ack();
};

proto._onResumeMessage = function onResumeMessage(message) {
  message.ack();
  const stateMessage = this[kStateMessage];

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

  return this.broker.publish('run', stateMessage.fields.routingKey, (0, _messageHelper.cloneContent)(stateMessage.content), stateMessage.properties);
};

proto._onExecutionMessage = function onExecutionMessage(routingKey, message) {
  const content = message.content;
  const messageType = message.properties.type;
  message.ack();

  switch (messageType) {
    case 'stopped':
      {
        return this._onStop();
      }

    case 'error':
      {
        this.broker.publish('run', 'run.error', content);
        this.broker.publish('run', 'run.discarded', content);
        break;
      }

    case 'discard':
      this.broker.publish('run', 'run.discarded', content);
      break;

    default:
      {
        this.broker.publish('run', 'run.end', content);
      }
  }

  const executeMessage = this[kExecuteMessage];
  this[kExecuteMessage] = null;
  executeMessage.ack();
};

proto._publishEvent = function publishEvent(state, content) {
  const eventContent = this._createMessage({ ...content,
    state
  });

  this.broker.publish('event', `process.${state}`, eventContent, {
    type: state,
    mandatory: state === 'error'
  });
};

proto.sendMessage = function sendMessage(message) {
  const messageContent = message && message.content;
  if (!messageContent) return;
  let targetsFound = false;

  if (messageContent.target && messageContent.target.id && this.getActivityById(messageContent.target.id)) {
    targetsFound = true;
  } else if (messageContent.message && this.getStartActivities({
    referenceId: messageContent.message.id,
    referenceType: messageContent.message.messageType
  }).length) {
    targetsFound = true;
  }

  if (!targetsFound) return;
  if (!this.status) this.run();
  this.getApi().sendApiMessage(message.properties.type || 'message', (0, _messageHelper.cloneContent)(messageContent), {
    delegate: true
  });
};

proto.getActivityById = function getActivityById(childId) {
  const execution = this.execution;
  if (execution) return execution.getActivityById(childId);
  return this.context.getActivityById(childId);
};

proto.getActivities = function getActivities() {
  const execution = this.execution;
  if (execution) return execution.getActivities();
  return this.context.getActivities(this.id);
};

proto.getStartActivities = function getStartActivities(filterOptions) {
  return this.context.getStartActivities(filterOptions, this.id);
};

proto.getSequenceFlows = function getSequenceFlows() {
  const execution = this.execution;
  if (execution) return execution.getSequenceFlows();
  return this.context.getSequenceFlows();
};

proto.getPostponed = function getPostponed(...args) {
  const execution = this.execution;
  if (!execution) return [];
  return execution.getPostponed(...args);
};

proto._onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;

  switch (messageType) {
    case 'stop':
      {
        if (this.execution && !this.execution.completed) return;

        this._onStop();

        break;
      }
  }
};

proto._onStop = function onStop() {
  this[kStopped] = true;

  this._deactivateRunConsumers();

  return this._publishEvent('stop');
};

proto._createMessage = function createMessage(override) {
  return {
    id: this.id,
    type: this.type,
    name: this.name,
    executionId: this.executionId,
    parent: { ...this.parent
    },
    ...override
  };
};

proto._debug = function debug(msg) {
  this.logger.debug(`<${this.id}> ${msg}`);
};