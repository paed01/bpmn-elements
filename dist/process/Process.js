"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Process = Process;
var _ProcessExecution = require("./ProcessExecution.js");
var _shared = require("../shared.js");
var _Api = require("../Api.js");
var _EventBroker = require("../EventBroker.js");
var _messageHelper = require("../messageHelper.js");
var _Errors = require("../error/Errors.js");
var _constants = require("../constants.js");
const K_LANES = Symbol.for('lanes');

/**
 * Owns one `<bpmn:process>`. Wraps the structural definition and orchestrates flow traversal,
 * joins, and parallel activation through ProcessExecution.
 * @param {import('moddle-context-serializer').Process} processDef
 * @param {import('#types').ContextInstance} context
 */
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
  /** @type {import('#types').ElementParent} */
  this.parent = parent ? (0, _messageHelper.cloneParent)(parent) : {};
  /** @type {import('moddle-context-serializer').Process['behaviour']} */
  this.behaviour = behaviour;
  this.isExecutable = behaviour.isExecutable;
  const environment = this.environment = context.environment;
  this.context = context;
  this[_constants.K_COUNTERS] = {
    completed: 0,
    discarded: 0
  };
  this[_constants.K_CONSUMING] = false;
  this[_constants.K_EXECUTION] = new Map();
  this[_constants.K_STATUS] = undefined;
  this[_constants.K_STOPPED] = false;
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
  this[_constants.K_MESSAGE_HANDLERS] = {
    onApiMessage: this._onApiMessage.bind(this),
    onRunMessage: this._onRunMessage.bind(this),
    onExecutionMessage: this._onExecutionMessage.bind(this)
  };
  this.logger = environment.Logger(type.toLowerCase());
  if (behaviour.lanes) {
    this[K_LANES] = behaviour.lanes.map(lane => new lane.Behaviour(this, lane));
  }
  this[_constants.K_EXTENSIONS] = context.loadExtensions(this);
}
Object.defineProperties(Process.prototype, {
  counters: {
    get() {
      return {
        ...this[_constants.K_COUNTERS]
      };
    }
  },
  lanes: {
    get() {
      return this[K_LANES]?.slice();
    }
  },
  extensions: {
    get() {
      return this[_constants.K_EXTENSIONS];
    }
  },
  stopped: {
    get() {
      return this[_constants.K_STOPPED];
    }
  },
  isRunning: {
    get() {
      if (!this[_constants.K_CONSUMING]) return false;
      return !!this.status;
    }
  },
  executionId: {
    get() {
      const exec = this[_constants.K_EXECUTION];
      return exec.get('executionId') || exec.get('initExecutionId');
    }
  },
  execution: {
    get() {
      return this[_constants.K_EXECUTION].get('execution');
    }
  },
  status: {
    get() {
      return this[_constants.K_STATUS];
    }
  },
  activityStatus: {
    get() {
      return this[_constants.K_EXECUTION].get('execution')?.activityStatus || 'idle';
    }
  }
});

/**
 * Allocate an executionId and emit init event without starting the run.
 * @param {string} [useAsExecutionId] Override for the generated execution id
 */
Process.prototype.init = function init(useAsExecutionId) {
  const initExecutionId = useAsExecutionId || (0, _shared.getUniqueId)(this.id);
  this[_constants.K_EXECUTION].set('initExecutionId', initExecutionId);
  this._debug(`initialized with executionId <${initExecutionId}>`);
  this._publishEvent('init', this._createMessage({
    executionId: initExecutionId
  }));
};

/**
 * Start running the process by publishing run.enter, run.start, and run.execute.
 * @param {Record<string, any>} [runContent] Optional content merged into the run message
 * @throws {Error} when the process is already running
 */
Process.prototype.run = function run(runContent) {
  if (this.isRunning) throw new Error(`process <${this.id}> is already running`);
  const exec = this[_constants.K_EXECUTION];
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

/**
 * Resume after recover by republishing the last run message.
 * @returns {this}
 * @throws {Error} when called on a running process
 */
Process.prototype.resume = function resume() {
  if (this.isRunning) throw new Error(`cannot resume running process <${this.id}>`);
  if (!this.status) return this;
  this[_constants.K_STOPPED] = false;
  const content = this._createMessage();
  this.broker.publish('run', 'run.resume', content, {
    persistent: false
  });
  this._activateRunConsumers();
  return this;
};

/**
 * Snapshot process state for recover.
 * @returns {import('#types').ProcessState}
 */
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

/**
 * Restore process state captured by getState.
 * @param {import('#types').ProcessState} [state]
 * @param {number} [recoveredVersion] State version
 * @returns {this}
 * @throws {Error} when called on a running process
 */
Process.prototype.recover = function recover(state, recoveredVersion) {
  if (this.isRunning) throw new Error(`cannot recover running process <${this.id}>`);
  if (!state) return this;
  this[_constants.K_STOPPED] = !!state.stopped;
  this[_constants.K_STATUS] = state.status;
  const exec = this[_constants.K_EXECUTION];
  exec.set('executionId', state.executionId);
  this[_constants.K_COUNTERS] = {
    ...this[_constants.K_COUNTERS],
    ...state.counters
  };
  this.environment.recover(state.environment);
  if (state.execution) {
    exec.set('execution', new _ProcessExecution.ProcessExecution(this, this.context).recover(state.execution, recoveredVersion));
  }
  this.broker.recover(state.broker);
  return this;
};

/**
 * Walk activity graph from the given start id, or every start activity when omitted.
 * @param {string} [startId]
 * @returns {import('#types').ShakeResult}
 */
Process.prototype.shake = function shake(startId) {
  if (this.isRunning) return this.execution.shake(startId);
  return new _ProcessExecution.ProcessExecution(this, this.context).shake(startId);
};

/**
 * Stop the process if running.
 */
Process.prototype.stop = function stop() {
  if (!this.isRunning) return;
  this.getApi().stop();
};

/**
 * Resolve a Process Api wrapper, preferring the running execution if any.
 * @param {import('#types').ElementBrokerMessage} [message]
 * @returns {import('#types').IApi<this>}
 */
Process.prototype.getApi = function getApi(message) {
  const execution = this.execution;
  if (execution) return execution.getApi(message);
  return (0, _Api.ProcessApi)(this.broker, message || this[_constants.K_STATE_MESSAGE]);
};

/**
 * Send a delegated signal to the running process.
 * @param {import('#types').signalMessage} [message]
 */
Process.prototype.signal = function signal(message) {
  return this.getApi().signal(message, {
    delegate: true
  });
};

/**
 * Cancel a running activity inside the process by delegated api message.
 * @param {import('#types').signalMessage} [message]
 */
Process.prototype.cancelActivity = function cancelActivity(message) {
  return this.getApi().cancel(message, {
    delegate: true
  });
};

/** @internal */
Process.prototype._activateRunConsumers = function activateRunConsumers() {
  this[_constants.K_CONSUMING] = true;
  const broker = this.broker;
  const {
    onApiMessage,
    onRunMessage
  } = this[_constants.K_MESSAGE_HANDLERS];
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

/** @internal */
Process.prototype._deactivateRunConsumers = function deactivateRunConsumers() {
  const broker = this.broker;
  broker.cancel('_process-api');
  broker.cancel('_process-run');
  broker.cancel('_process-execution');
  this[_constants.K_CONSUMING] = false;
};

/** @internal */
Process.prototype._onRunMessage = function onRunMessage(routingKey, message) {
  const {
    content,
    fields
  } = message;
  if (routingKey === 'run.resume') {
    return this._onResumeMessage(message);
  }
  this[_constants.K_STATE_MESSAGE] = message;
  switch (routingKey) {
    case 'run.enter':
      {
        this._debug('enter');
        this[_constants.K_STATUS] = 'entered';
        if (fields.redelivered) break;
        this[_constants.K_EXECUTION].delete('execution');
        if (this.extensions) this.extensions.activate((0, _messageHelper.cloneMessage)(message));
        this._publishEvent('enter', content);
        break;
      }
    case 'run.start':
      {
        this._debug('start');
        this[_constants.K_STATUS] = 'start';
        this._publishEvent('start', content);
        break;
      }
    case 'run.execute':
      {
        const exec = this[_constants.K_EXECUTION];
        this[_constants.K_STATUS] = 'executing';
        if (fields.redelivered && this.extensions) this.extensions.activate((0, _messageHelper.cloneMessage)(message));
        const executeMessage = (0, _messageHelper.cloneMessage)(message);
        let execution = exec.get('execution');
        if (fields.redelivered && !execution) {
          executeMessage.fields.redelivered = undefined;
        }
        this[_constants.K_EXECUTE_MESSAGE] = message;
        this.broker.getQueue('execution-q').assertConsumer(this[_constants.K_MESSAGE_HANDLERS].onExecutionMessage, {
          exclusive: true,
          consumerTag: '_process-execution'
        });
        execution = execution || new _ProcessExecution.ProcessExecution(this, this.context);
        exec.set('execution', execution);
        return execution.execute(executeMessage);
      }
    case 'run.error':
      {
        this[_constants.K_STATUS] = 'errored';
        this._publishEvent('error', (0, _messageHelper.cloneContent)(content, {
          error: fields.redelivered ? (0, _Errors.makeErrorFromMessage)(message) : content.error
        }));
        break;
      }
    case 'run.end':
      {
        this[_constants.K_STATUS] = 'end';
        if (fields.redelivered) break;
        this._debug('completed');
        this[_constants.K_COUNTERS].completed++;
        this.broker.publish('run', 'run.leave', content);
        this._publishEvent('end', content);
        break;
      }
    case 'run.discarded':
      {
        this[_constants.K_STATUS] = 'discarded';
        if (fields.redelivered) break;
        this[_constants.K_COUNTERS].discarded++;
        this.broker.publish('run', 'run.leave', content);
        this._publishEvent('discarded', content);
        break;
      }
    case 'run.leave':
      {
        this[_constants.K_STATUS] = undefined;
        if (this.extensions) this.extensions.deactivate((0, _messageHelper.cloneMessage)(message));
        message.ack();
        this._deactivateRunConsumers();
        const {
          output,
          ...rest
        } = content;
        this._publishEvent('leave', rest);
        return;
      }
  }
  message.ack();
};

/** @internal */
Process.prototype._onResumeMessage = function onResumeMessage(message) {
  message.ack();
  const stateMessage = this[_constants.K_STATE_MESSAGE];
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
  if (this.extensions) this.extensions.activate((0, _messageHelper.cloneMessage)(stateMessage));
  this._debug(`resume from ${this.status}`);
  return this.broker.publish('run', stateMessage.fields.routingKey, (0, _messageHelper.cloneContent)(stateMessage.content), stateMessage.properties);
};

/** @internal */
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
  const executeMessage = this[_constants.K_EXECUTE_MESSAGE];
  this[_constants.K_EXECUTE_MESSAGE] = null;
  executeMessage.ack();
};

/** @internal */
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

/**
 * Deliver a message to a target activity or start activity that references it.
 * Starts the process if a target is found and the process is idle.
 * @param {import('#types').ElementBrokerMessage} message
 */
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

/**
 * @param {string} childId
 */
Process.prototype.getActivityById = function getActivityById(childId) {
  const execution = this.execution;
  if (execution) return execution.getActivityById(childId);
  return this.context.getActivityById(childId);
};

/**
 * Get every activity in the process scope.
 */
Process.prototype.getActivities = function getActivities() {
  const execution = this.execution;
  if (execution) return execution.getActivities();
  return this.context.getActivities(this.id);
};

/**
 * Get start activities, optionally filtered by referenced event definition.
 * @param {import('#types').startActivityFilterOptions} [filterOptions]
 */
Process.prototype.getStartActivities = function getStartActivities(filterOptions) {
  return this.context.getStartActivities(filterOptions, this.id);
};

/**
 * Get sequence flows in the process scope.
 */
Process.prototype.getSequenceFlows = function getSequenceFlows() {
  const execution = this.execution;
  if (execution) return execution.getSequenceFlows();
  return this.context.getSequenceFlows();
};

/**
 * @param {string} laneId
 * @returns {import('./Lane.js').Lane | undefined}
 */
Process.prototype.getLaneById = function getLaneById(laneId) {
  return this[K_LANES]?.find(lane => lane.id === laneId);
};

/**
 * List currently postponed activities as Api wrappers.
 * @param {import('#types').filterPostponed} [filterFn]
 */
Process.prototype.getPostponed = function getPostponed(...args) {
  return this.execution?.getPostponed(...args) || [];
};

/** @internal */
Process.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  switch (message.properties.type) {
    case 'stop':
      {
        if (this.execution && !this.execution.completed) return;
        this._onStop();
        break;
      }
  }
};

/** @internal */
Process.prototype._onStop = function onStop() {
  this[_constants.K_STOPPED] = true;
  this._deactivateRunConsumers();
  if (this.extensions) this.extensions.deactivate((0, _messageHelper.cloneMessage)(this[_constants.K_STATE_MESSAGE]));
  return this._publishEvent('stop');
};

/** @internal */
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

/** @internal */
Process.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.id}> ${msg}`);
};