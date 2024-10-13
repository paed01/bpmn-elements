"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Process = Process;
exports.default = void 0;
var _ProcessExecution = _interopRequireDefault(require("./ProcessExecution.js"));
var _shared = require("../shared.js");
var _Api = require("../Api.js");
var _EventBroker = require("../EventBroker.js");
var _messageHelper = require("../messageHelper.js");
var _Errors = require("../error/Errors.js");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const kConsuming = Symbol.for('consuming');
const kCounters = Symbol.for('counters');
const kExec = Symbol.for('execution');
const kExecuteMessage = Symbol.for('executeMessage');
const kExtensions = Symbol.for('extensions');
const kLanes = Symbol.for('lanes');
const kMessageHandlers = Symbol.for('messageHandlers');
const kStateMessage = Symbol.for('stateMessage');
const kStatus = Symbol.for('status');
const kStopped = Symbol.for('stopped');
var _default = exports.default = Process;
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
  this[kExec] = new Map();
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
  if (behaviour.lanes) {
    this[kLanes] = behaviour.lanes.map(lane => new lane.Behaviour(this, lane));
  }
  this[kExtensions] = context.loadExtensions(this);
}
Object.defineProperties(Process.prototype, {
  counters: {
    get() {
      return {
        ...this[kCounters]
      };
    }
  },
  lanes: {
    get() {
      return this[kLanes]?.slice();
    }
  },
  extensions: {
    get() {
      return this[kExtensions];
    }
  },
  stopped: {
    get() {
      return this[kStopped];
    }
  },
  isRunning: {
    get() {
      if (!this[kConsuming]) return false;
      return !!this.status;
    }
  },
  executionId: {
    get() {
      const exec = this[kExec];
      return exec.get('executionId') || exec.get('initExecutionId');
    }
  },
  execution: {
    get() {
      return this[kExec].get('execution');
    }
  },
  status: {
    get() {
      return this[kStatus];
    }
  },
  activityStatus: {
    get() {
      return this[kExec].get('execution')?.activityStatus || 'idle';
    }
  }
});
Process.prototype.init = function init(useAsExecutionId) {
  const initExecutionId = useAsExecutionId || (0, _shared.getUniqueId)(this.id);
  this[kExec].set('initExecutionId', initExecutionId);
  this._debug(`initialized with executionId <${initExecutionId}>`);
  this._publishEvent('init', this._createMessage({
    executionId: initExecutionId
  }));
};
Process.prototype.run = function run(runContent) {
  if (this.isRunning) throw new Error(`process <${this.id}> is already running`);
  const exec = this[kExec];
  const executionId = exec.get('initExecutionId') || (0, _shared.getUniqueId)(this.id);
  exec.delete('initExecutionId');
  exec.set('executionId', executionId);
  const content = this._createMessage({
    ...runContent,
    executionId
  });
  const broker = this.broker;
  broker.publish('run', 'run.enter', content);
  broker.publish('run', 'run.start', (0, _messageHelper.cloneContent)(content));
  broker.publish('run', 'run.execute', (0, _messageHelper.cloneContent)(content));
  this._activateRunConsumers();
};
Process.prototype.resume = function resume() {
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
Process.prototype.getState = function getState() {
  return {
    id: this.id,
    type: this.type,
    executionId: this.executionId,
    environment: this.environment.getState(),
    status: this.status,
    stopped: this.stopped,
    counters: this.counters,
    broker: this.broker.getState(true),
    execution: this.execution?.getState()
  };
};
Process.prototype.recover = function recover(state) {
  if (this.isRunning) throw new Error(`cannot recover running process <${this.id}>`);
  if (!state) return this;
  this[kStopped] = !!state.stopped;
  this[kStatus] = state.status;
  const exec = this[kExec];
  exec.set('executionId', state.executionId);
  this[kCounters] = {
    ...this[kCounters],
    ...state.counters
  };
  this.environment.recover(state.environment);
  if (state.execution) {
    exec.set('execution', new _ProcessExecution.default(this, this.context).recover(state.execution));
  }
  this.broker.recover(state.broker);
  return this;
};
Process.prototype.shake = function shake(startId) {
  if (this.isRunning) return this.execution.shake(startId);
  return new _ProcessExecution.default(this, this.context).shake(startId);
};
Process.prototype.stop = function stop() {
  if (!this.isRunning) return;
  this.getApi().stop();
};
Process.prototype.getApi = function getApi(message) {
  const execution = this.execution;
  if (execution) return execution.getApi(message);
  return (0, _Api.ProcessApi)(this.broker, message || this[kStateMessage]);
};
Process.prototype.signal = function signal(message) {
  return this.getApi().signal(message, {
    delegate: true
  });
};
Process.prototype.cancelActivity = function cancelActivity(message) {
  return this.getApi().cancel(message, {
    delegate: true
  });
};
Process.prototype._activateRunConsumers = function activateRunConsumers() {
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
Process.prototype._deactivateRunConsumers = function deactivateRunConsumers() {
  const broker = this.broker;
  broker.cancel('_process-api');
  broker.cancel('_process-run');
  broker.cancel('_process-execution');
  this[kConsuming] = false;
};
Process.prototype._onRunMessage = function onRunMessage(routingKey, message) {
  const {
    content,
    fields
  } = message;
  if (routingKey === 'run.resume') {
    return this._onResumeMessage(message);
  }
  this[kStateMessage] = message;
  switch (routingKey) {
    case 'run.enter':
      {
        this._debug('enter');
        this[kStatus] = 'entered';
        if (fields.redelivered) break;
        this[kExec].delete('execution');
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
        const exec = this[kExec];
        this[kStatus] = 'executing';
        const executeMessage = (0, _messageHelper.cloneMessage)(message);
        let execution = exec.get('execution');
        if (fields.redelivered && !execution) {
          executeMessage.fields.redelivered = undefined;
        }
        this[kExecuteMessage] = message;
        this.broker.getQueue('execution-q').assertConsumer(this[kMessageHandlers].onExecutionMessage, {
          exclusive: true,
          consumerTag: '_process-execution'
        });
        execution = execution || new _ProcessExecution.default(this, this.context);
        exec.set('execution', execution);
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
        message.ack();
        this._deactivateRunConsumers();
        const {
          output,
          ...rest
        } = content; // eslint-disable-line no-unused-vars
        this._publishEvent('leave', rest);
        return;
      }
  }
  message.ack();
};
Process.prototype._onResumeMessage = function onResumeMessage(message) {
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
Process.prototype._onExecutionMessage = function onExecutionMessage(routingKey, message) {
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
Process.prototype._publishEvent = function publishEvent(state, content) {
  const eventContent = this._createMessage({
    ...content,
    state
  });
  this.broker.publish('event', `process.${state}`, eventContent, {
    type: state,
    mandatory: state === 'error'
  });
};
Process.prototype.sendMessage = function sendMessage(message) {
  const messageContent = message?.content;
  if (!messageContent) return;
  let targetsFound = false;
  if (messageContent.target?.id && this.getActivityById(messageContent.target.id)) {
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
Process.prototype.getActivityById = function getActivityById(childId) {
  const execution = this.execution;
  if (execution) return execution.getActivityById(childId);
  return this.context.getActivityById(childId);
};
Process.prototype.getActivities = function getActivities() {
  const execution = this.execution;
  if (execution) return execution.getActivities();
  return this.context.getActivities(this.id);
};
Process.prototype.getStartActivities = function getStartActivities(filterOptions) {
  return this.context.getStartActivities(filterOptions, this.id);
};
Process.prototype.getSequenceFlows = function getSequenceFlows() {
  const execution = this.execution;
  if (execution) return execution.getSequenceFlows();
  return this.context.getSequenceFlows();
};
Process.prototype.getLaneById = function getLaneById(laneId) {
  const lanes = this[kLanes];
  if (!lanes) return;
  return lanes.find(lane => lane.id === laneId);
};
Process.prototype.getPostponed = function getPostponed(...args) {
  const execution = this.execution;
  if (!execution) return [];
  return execution.getPostponed(...args);
};
Process.prototype._onApiMessage = function onApiMessage(routingKey, message) {
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
Process.prototype._onStop = function onStop() {
  this[kStopped] = true;
  this._deactivateRunConsumers();
  return this._publishEvent('stop');
};
Process.prototype._createMessage = function createMessage(override) {
  return {
    id: this.id,
    type: this.type,
    name: this.name,
    executionId: this.executionId,
    parent: {
      ...this.parent
    },
    ...override
  };
};
Process.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.id}> ${msg}`);
};