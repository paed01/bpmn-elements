import { ProcessExecution } from './ProcessExecution.js';
import { getUniqueId } from '../shared.js';
import { ProcessApi } from '../Api.js';
import { ProcessBroker } from '../EventBroker.js';
import { Formatter } from '../MessageFormatter.js';
import { cloneMessage, cloneContent, cloneParent } from '../messageHelper.js';
import { makeErrorFromMessage } from '../error/Errors.js';
import {
  K_CONSUMING,
  K_COUNTERS,
  K_EXECUTE_MESSAGE,
  K_EXECUTION,
  K_EXTENSIONS,
  K_MESSAGE_HANDLERS,
  K_STATE_MESSAGE,
  K_STATUS,
  K_STOPPED,
  K_FORMATTER,
} from '../constants.js';

const K_LANES = Symbol.for('lanes');

/**
 * Owns one `<bpmn:process>`. Wraps the structural definition and orchestrates flow traversal,
 * joins, and parallel activation through ProcessExecution.
 * @param {import('moddle-context-serializer').Process} processDef
 * @param {import('#types').ContextInstance} context
 */
export function Process(processDef, context) {
  const { id, type = 'process', name, parent, behaviour = {} } = processDef;
  this.id = id;
  this.type = type;
  this.name = name;
  /** @type {import('#types').ElementParent} */
  this.parent = parent ? cloneParent(parent) : {};
  /** @type {import('moddle-context-serializer').Process['behaviour']} */
  this.behaviour = behaviour;

  this.isExecutable = behaviour.isExecutable;

  const environment = (this.environment = context.environment);
  this.context = context;
  /** @internal */
  this[K_COUNTERS] = {
    completed: 0,
    discarded: 0,
  };
  /** @internal */
  this[K_CONSUMING] = false;
  /** @internal */
  this[K_EXECUTION] = new Map();
  /** @internal */
  this[K_STATUS] = undefined;
  /** @internal */
  this[K_STOPPED] = false;

  const { broker, on, once, waitFor, emitFatal } = ProcessBroker(this);
  this.broker = broker;
  this.on = on;
  this.once = once;
  this.waitFor = waitFor;
  this.emitFatal = emitFatal;

  /** @internal */
  this[K_MESSAGE_HANDLERS] = {
    onApiMessage: this._onApiMessage.bind(this),
    onRunMessage: this._onRunMessage.bind(this),
    onExecutionMessage: this._onExecutionMessage.bind(this),
  };

  this.logger = environment.Logger(type.toLowerCase());

  if (behaviour.lanes) {
    /** @internal */
    this[K_LANES] = behaviour.lanes.map((lane) => new lane.Behaviour(this, lane));
  }
  /** @internal */
  this[K_EXTENSIONS] = context.loadExtensions(this);
  /** @internal */
  this[K_STATE_MESSAGE] = undefined;
  /** @internal */
  this[K_EXECUTE_MESSAGE] = undefined;
}

Object.defineProperties(Process.prototype, {
  counters: {
    get() {
      return { ...this[K_COUNTERS] };
    },
  },
  lanes: {
    get() {
      return this[K_LANES]?.slice();
    },
  },
  extensions: {
    get() {
      return this[K_EXTENSIONS];
    },
  },
  formatter: {
    get() {
      let formatter = this[K_FORMATTER];
      if (formatter) return formatter;
      formatter = this[K_FORMATTER] = new Formatter(this);
      return formatter;
    },
  },
  stopped: {
    get() {
      return this[K_STOPPED];
    },
  },
  isRunning: {
    get() {
      if (!this[K_CONSUMING]) return false;
      return !!this.status;
    },
  },
  executionId: {
    get() {
      const exec = this[K_EXECUTION];
      return exec.get('executionId') || exec.get('initExecutionId');
    },
  },
  execution: {
    get() {
      return this[K_EXECUTION].get('execution');
    },
  },
  status: {
    get() {
      return this[K_STATUS];
    },
  },
  activityStatus: {
    get() {
      return this[K_EXECUTION].get('execution')?.activityStatus || 'idle';
    },
  },
});

/**
 * Allocate an executionId and emit init event without starting the run.
 * @param {string} [useAsExecutionId] Override for the generated execution id
 */
Process.prototype.init = function init(useAsExecutionId) {
  const initExecutionId = useAsExecutionId || getUniqueId(this.id);
  this[K_EXECUTION].set('initExecutionId', initExecutionId);

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

  const exec = this[K_EXECUTION];
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
 * @returns {this}
 * @throws {Error} when called on a running process
 */
Process.prototype.resume = function resume() {
  if (this.isRunning) throw new Error(`cannot resume running process <${this.id}>`);
  if (!this.status) return this;

  this[K_STOPPED] = false;

  const content = this._createMessage();
  this.broker.publish('run', 'run.resume', content, { persistent: false });
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
    execution: this.execution?.getState(),
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

  this[K_STOPPED] = !!state.stopped;
  this[K_STATUS] = state.status;
  const exec = this[K_EXECUTION];
  exec.set('executionId', state.executionId);
  this[K_COUNTERS] = { ...this[K_COUNTERS], ...state.counters };
  this.environment.recover(state.environment);

  if (state.execution) {
    exec.set('execution', new ProcessExecution(this, this.context).recover(state.execution, recoveredVersion));
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
 * @param {import('#types').ElementBrokerMessage} [message]
 * @returns {import('#types').IApi<this>}
 */
Process.prototype.getApi = function getApi(message) {
  const execution = this.execution;
  if (execution) return execution.getApi(message);
  return ProcessApi(this.broker, message || this[K_STATE_MESSAGE]);
};

/**
 * Send a delegated signal to the running process.
 * @param {import('#types').signalMessage} [message]
 */
Process.prototype.signal = function signal(message) {
  return this.getApi().signal(message, { delegate: true });
};

/**
 * Cancel a running activity inside the process by delegated api message.
 * @param {import('#types').signalMessage} [message]
 */
Process.prototype.cancelActivity = function cancelActivity(message) {
  return this.getApi().cancel(message, { delegate: true });
};

/** @internal */
Process.prototype._activateRunConsumers = function activateRunConsumers() {
  this[K_CONSUMING] = true;
  const broker = this.broker;
  const { onApiMessage, onRunMessage } = this[K_MESSAGE_HANDLERS];
  broker.subscribeTmp('api', `process.*.${this.executionId}`, onApiMessage, { noAck: true, consumerTag: '_process-api', priority: 100 });
  broker.getQueue('run-q').assertConsumer(onRunMessage, { exclusive: true, consumerTag: '_process-run' });
};

/** @internal */
Process.prototype._deactivateRunConsumers = function deactivateRunConsumers() {
  const broker = this.broker;
  broker.cancel('_process-api');
  broker.cancel('_process-run');
  broker.cancel('_process-execution');
  this[K_CONSUMING] = false;
};

/** @internal */
Process.prototype._onRunMessage = function onRunMessage(routingKey, message, messageProperties) {
  if (routingKey === 'run.resume') {
    return this._onResumeMessage(message);
  }

  const preStatus = this[K_STATUS];
  this[K_STATUS] = 'formatting';

  return this.formatter.format(message, (err, formattedContent, formatted) => {
    this[K_STATUS] = preStatus;
    if (err) {
      return this.emitFatal(err, message.content);
    }
    if (formatted) message.content = formattedContent;
    this._continueRunMessage(routingKey, message, messageProperties);
  });
};

/** @internal */
Process.prototype._continueRunMessage = function continueRunMessage(routingKey, message) {
  const { content, fields } = message;

  this[K_STATE_MESSAGE] = message;

  switch (routingKey) {
    case 'run.enter': {
      this._debug('enter');

      this[K_STATUS] = 'entered';
      if (fields.redelivered) break;

      this[K_EXECUTION].delete('execution');
      if (this.extensions) this.extensions.activate(cloneMessage(message));
      this._publishEvent('enter', content);

      break;
    }
    case 'run.start': {
      this._debug('start');
      this[K_STATUS] = 'start';
      this._publishEvent('start', content);
      break;
    }
    case 'run.execute': {
      const exec = this[K_EXECUTION];
      this[K_STATUS] = 'executing';
      if (fields.redelivered && this.extensions) this.extensions.activate(cloneMessage(message));
      const executeMessage = cloneMessage(message);
      let execution = exec.get('execution');
      if (fields.redelivered && !execution) {
        executeMessage.fields.redelivered = undefined;
      }
      this[K_EXECUTE_MESSAGE] = message;

      this.broker.getQueue('execution-q').assertConsumer(this[K_MESSAGE_HANDLERS].onExecutionMessage, {
        exclusive: true,
        consumerTag: '_process-execution',
      });

      execution = execution || new ProcessExecution(this, this.context);
      exec.set('execution', execution);
      return execution.execute(executeMessage);
    }
    case 'run.error': {
      this[K_STATUS] = 'errored';
      this._publishEvent(
        'error',
        cloneContent(content, {
          error: fields.redelivered ? makeErrorFromMessage(message) : content.error,
        })
      );
      break;
    }
    case 'run.end': {
      this[K_STATUS] = 'end';

      if (fields.redelivered) break;
      this._debug('completed');

      this[K_COUNTERS].completed++;

      this.broker.publish('run', 'run.leave', content);

      this._publishEvent('end', content);
      break;
    }
    case 'run.discarded': {
      this[K_STATUS] = 'discarded';
      if (fields.redelivered) break;

      this[K_COUNTERS].discarded++;

      this.broker.publish('run', 'run.leave', content);

      this._publishEvent('discarded', content);
      break;
    }
    case 'run.leave': {
      this[K_STATUS] = undefined;
      if (this.extensions) this.extensions.deactivate(cloneMessage(message));
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

  const stateMessage = this[K_STATE_MESSAGE];
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

  if (this.extensions) this.extensions.activate(cloneMessage(stateMessage));

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

  const executeMessage = this[K_EXECUTE_MESSAGE];
  this[K_EXECUTE_MESSAGE] = null;
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
 * @param {import('#types').ElementBrokerMessage} message
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
  return this[K_LANES]?.find((lane) => lane.id === laneId);
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
    case 'stop': {
      if (this.execution && !this.execution.completed) return;
      this._onStop();
      break;
    }
  }
};

/** @internal */
Process.prototype._onStop = function onStop() {
  this[K_STOPPED] = true;
  this._deactivateRunConsumers();
  if (this.extensions) this.extensions.deactivate(cloneMessage(this[K_STATE_MESSAGE]));
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
