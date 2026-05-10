import ProcessExecution from './ProcessExecution.js';
import { getUniqueId } from '../shared.js';
import { ProcessApi } from '../Api.js';
import { ProcessBroker } from '../EventBroker.js';
import { cloneMessage, cloneContent, cloneParent } from '../messageHelper.js';
import { makeErrorFromMessage } from '../error/Errors.js';

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

export default Process;

/**
 * Owns one `<bpmn:process>`. Wraps the structural definition and orchestrates flow traversal,
 * joins, and parallel activation through ProcessExecution.
 * @param {import('moddle-context-serializer').SerializableElement} processDef
 * @param {import('types').ContextInstance} context
 */
export function Process(processDef, context) {
  const { id, type = 'process', name, parent, behaviour = {} } = processDef;
  this.id = id;
  this.type = type;
  this.name = name;
  this.parent = parent ? cloneParent(parent) : {};
  this.behaviour = behaviour;

  const { isExecutable } = behaviour;
  this.isExecutable = isExecutable;

  const environment = (this.environment = context.environment);
  this.context = context;
  this[kCounters] = {
    completed: 0,
    discarded: 0,
  };
  this[kConsuming] = false;
  this[kExec] = new Map();
  this[kStatus] = undefined;
  this[kStopped] = false;

  const { broker, on, once, waitFor } = ProcessBroker(this);
  this.broker = broker;
  this.on = on;
  this.once = once;
  this.waitFor = waitFor;

  this[kMessageHandlers] = {
    onApiMessage: this._onApiMessage.bind(this),
    onRunMessage: this._onRunMessage.bind(this),
    onExecutionMessage: this._onExecutionMessage.bind(this),
  };

  this.logger = environment.Logger(type.toLowerCase());

  if (behaviour.lanes) {
    this[kLanes] = behaviour.lanes.map((lane) => new lane.Behaviour(this, lane));
  }
  this[kExtensions] = context.loadExtensions(this);
}

Object.defineProperties(Process.prototype, {
  counters: {
    get() {
      return { ...this[kCounters] };
    },
  },
  lanes: {
    get() {
      return this[kLanes]?.slice();
    },
  },
  extensions: {
    get() {
      return this[kExtensions];
    },
  },
  stopped: {
    get() {
      return this[kStopped];
    },
  },
  isRunning: {
    get() {
      if (!this[kConsuming]) return false;
      return !!this.status;
    },
  },
  executionId: {
    get() {
      const exec = this[kExec];
      return exec.get('executionId') || exec.get('initExecutionId');
    },
  },
  execution: {
    get() {
      return this[kExec].get('execution');
    },
  },
  status: {
    get() {
      return this[kStatus];
    },
  },
  activityStatus: {
    get() {
      return this[kExec].get('execution')?.activityStatus || 'idle';
    },
  },
});

/**
 * Allocate an executionId and emit init event without starting the run.
 * @param {string} [useAsExecutionId] Override for the generated execution id
 */
Process.prototype.init = function init(useAsExecutionId) {
  const initExecutionId = useAsExecutionId || getUniqueId(this.id);
  this[kExec].set('initExecutionId', initExecutionId);

  this._debug(`initialized with executionId <${initExecutionId}>`);
  this._publishEvent('init', this._createMessage({ executionId: initExecutionId }));
};

/**
 * Start running the process by publishing run.enter, run.start, and run.execute.
 * @param {Record<string, any>} [runContent] Optional content merged into the run message
 * @throws {Error} when the process is already running
 */
Process.prototype.run = function run(runContent) {
  if (this.isRunning) throw new Error(`process <${this.id}> is already running`);

  const exec = this[kExec];
  const executionId = exec.get('initExecutionId') || getUniqueId(this.id);
  exec.delete('initExecutionId');
  exec.set('executionId', executionId);

  const content = this._createMessage({ ...runContent, executionId });

  const broker = this.broker;
  broker.publish('run', 'run.enter', content);
  broker.publish('run', 'run.start', cloneContent(content));
  broker.publish('run', 'run.execute', cloneContent(content));

  this._activateRunConsumers();
};

/**
 * Resume after recover by republishing the last run message.
 * @returns this
 * @throws {Error} when called on a running process
 */
Process.prototype.resume = function resume() {
  if (this.isRunning) throw new Error(`cannot resume running process <${this.id}>`);
  if (!this.status) return this;

  this[kStopped] = false;

  const content = this._createMessage();
  this.broker.publish('run', 'run.resume', content, { persistent: false });
  this._activateRunConsumers();
  return this;
};

/**
 * Snapshot process state for recover.
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
    execution: this.execution?.getState(),
  };
};

/**
 * Restore process state captured by getState.
 * @param {import('types').ProcessState} [state]
 * @returns this
 * @throws {Error} when called on a running process
 */
Process.prototype.recover = function recover(state) {
  if (this.isRunning) throw new Error(`cannot recover running process <${this.id}>`);
  if (!state) return this;

  this[kStopped] = !!state.stopped;
  this[kStatus] = state.status;
  const exec = this[kExec];
  exec.set('executionId', state.executionId);
  this[kCounters] = { ...this[kCounters], ...state.counters };
  this.environment.recover(state.environment);

  if (state.execution) {
    exec.set('execution', new ProcessExecution(this, this.context).recover(state.execution));
  }

  this.broker.recover(state.broker);

  return this;
};

/**
 * Walk activity graph from the given start id, or every start activity when omitted.
 * @param {string} [startId]
 */
Process.prototype.shake = function shake(startId) {
  if (this.isRunning) return this.execution.shake(startId);
  return new ProcessExecution(this, this.context).shake(startId);
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
 * @param {import('types').ElementBrokerMessage} [message]
 */
Process.prototype.getApi = function getApi(message) {
  const execution = this.execution;
  if (execution) return execution.getApi(message);
  return ProcessApi(this.broker, message || this[kStateMessage]);
};

/**
 * Send a delegated signal to the running process.
 * @param {import('types').signalMessage} [message]
 */
Process.prototype.signal = function signal(message) {
  return this.getApi().signal(message, { delegate: true });
};

/**
 * Cancel a running activity inside the process by delegated api message.
 * @param {import('types').signalMessage} [message]
 */
Process.prototype.cancelActivity = function cancelActivity(message) {
  return this.getApi().cancel(message, { delegate: true });
};

/** @internal */
Process.prototype._activateRunConsumers = function activateRunConsumers() {
  this[kConsuming] = true;
  const broker = this.broker;
  const { onApiMessage, onRunMessage } = this[kMessageHandlers];
  broker.subscribeTmp('api', `process.*.${this.executionId}`, onApiMessage, { noAck: true, consumerTag: '_process-api', priority: 100 });
  broker.getQueue('run-q').assertConsumer(onRunMessage, { exclusive: true, consumerTag: '_process-run' });
};

/** @internal */
Process.prototype._deactivateRunConsumers = function deactivateRunConsumers() {
  const broker = this.broker;
  broker.cancel('_process-api');
  broker.cancel('_process-run');
  broker.cancel('_process-execution');
  this[kConsuming] = false;
};

/** @internal */
Process.prototype._onRunMessage = function onRunMessage(routingKey, message) {
  const { content, fields } = message;

  if (routingKey === 'run.resume') {
    return this._onResumeMessage(message);
  }

  this[kStateMessage] = message;

  switch (routingKey) {
    case 'run.enter': {
      this._debug('enter');

      this[kStatus] = 'entered';
      if (fields.redelivered) break;

      this[kExec].delete('execution');
      this._publishEvent('enter', content);

      break;
    }
    case 'run.start': {
      this._debug('start');
      this[kStatus] = 'start';
      this._publishEvent('start', content);
      break;
    }
    case 'run.execute': {
      const exec = this[kExec];
      this[kStatus] = 'executing';
      const executeMessage = cloneMessage(message);
      let execution = exec.get('execution');
      if (fields.redelivered && !execution) {
        executeMessage.fields.redelivered = undefined;
      }
      this[kExecuteMessage] = message;

      this.broker.getQueue('execution-q').assertConsumer(this[kMessageHandlers].onExecutionMessage, {
        exclusive: true,
        consumerTag: '_process-execution',
      });

      execution = execution || new ProcessExecution(this, this.context);
      exec.set('execution', execution);
      return execution.execute(executeMessage);
    }
    case 'run.error': {
      this[kStatus] = 'errored';
      this._publishEvent(
        'error',
        cloneContent(content, {
          error: fields.redelivered ? makeErrorFromMessage(message) : content.error,
        })
      );
      break;
    }
    case 'run.end': {
      this[kStatus] = 'end';

      if (fields.redelivered) break;
      this._debug('completed');

      this[kCounters].completed++;

      this.broker.publish('run', 'run.leave', content);

      this._publishEvent('end', content);
      break;
    }
    case 'run.discarded': {
      this[kStatus] = 'discarded';
      if (fields.redelivered) break;

      this[kCounters].discarded++;

      this.broker.publish('run', 'run.leave', content);

      this._publishEvent('discarded', content);
      break;
    }
    case 'run.leave': {
      this[kStatus] = undefined;
      message.ack();
      this._deactivateRunConsumers();
      const { output, ...rest } = content;
      this._publishEvent('leave', rest);
      return;
    }
  }

  message.ack();
};

/** @internal */
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

  return this.broker.publish('run', stateMessage.fields.routingKey, cloneContent(stateMessage.content), stateMessage.properties);
};

/** @internal */
Process.prototype._onExecutionMessage = function onExecutionMessage(routingKey, message) {
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

  const executeMessage = this[kExecuteMessage];
  this[kExecuteMessage] = null;
  executeMessage.ack();
};

/** @internal */
Process.prototype._publishEvent = function publishEvent(state, content) {
  const eventContent = this._createMessage({ ...content, state });
  this.broker.publish('event', `process.${state}`, eventContent, { type: state, mandatory: state === 'error' });
};

/**
 * Deliver a message to a target activity or start activity that references it.
 * Starts the process if a target is found and the process is idle.
 * @param {import('types').ElementBrokerMessage} message
 */
Process.prototype.sendMessage = function sendMessage(message) {
  const messageContent = message?.content;
  if (!messageContent) return;

  let targetsFound = false;
  if (messageContent.target?.id && this.getActivityById(messageContent.target.id)) {
    targetsFound = true;
  } else if (
    messageContent.message &&
    this.getStartActivities({ referenceId: messageContent.message.id, referenceType: messageContent.message.messageType }).length
  ) {
    targetsFound = true;
  }
  if (!targetsFound) return;

  if (!this.status) this.run();
  this.getApi().sendApiMessage(message.properties.type || 'message', cloneContent(messageContent), { delegate: true });
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
 * @param {import('types').startActivityFilterOptions} [filterOptions]
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
 */
Process.prototype.getLaneById = function getLaneById(laneId) {
  const lanes = this[kLanes];
  if (!lanes) return;
  return lanes.find((lane) => lane.id === laneId);
};

/**
 * List currently postponed activities as Api wrappers.
 * @param {import('types').filterPostponed} [filterFn]
 */
Process.prototype.getPostponed = function getPostponed(...args) {
  const execution = this.execution;
  if (!execution) return [];
  return execution.getPostponed(...args);
};

/** @internal */
Process.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;

  switch (messageType) {
    case 'stop': {
      if (this.execution && !this.execution.completed) return;
      this._onStop();
      break;
    }
  }
};

/** @internal */
Process.prototype._onStop = function onStop() {
  this[kStopped] = true;
  this._deactivateRunConsumers();
  return this._publishEvent('stop');
};

/** @internal */
Process.prototype._createMessage = function createMessage(override) {
  return {
    id: this.id,
    type: this.type,
    name: this.name,
    executionId: this.executionId,
    parent: { ...this.parent },
    ...override,
  };
};

/** @internal */
Process.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.id}> ${msg}`);
};
