"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ActivityExecution = ActivityExecution;
var _Api = require("../Api.js");
var _messageHelper = require("../messageHelper.js");
var _constants = require("../constants.js");
const K_EXECUTE_Q = Symbol.for('executeQ');
const K_POSTPONED = Symbol.for('postponed');

/**
 * Per-run execution orchestrator for an Activity. Instantiates the element-specific behaviour
 * and drives the execute message flow over the activity broker.
 * @param {import('./Activity.js').Activity} activity
 * @param {import('../Context.js').ContextInstance} context
 */
function ActivityExecution(activity, context) {
  this.activity = activity;
  this.context = context;
  this.id = activity.id;
  this.broker = activity.broker;
  /** @internal */
  this[K_POSTPONED] = new Set();
  /** @internal */
  this[_constants.K_COMPLETED] = false;
  /** @internal */
  this[K_EXECUTE_Q] = this.broker.assertQueue('execute-q', {
    durable: true,
    autoDelete: false
  });

  /** @internal */
  this[_constants.K_MESSAGE_HANDLERS] = {
    onParentApiMessage: this._onParentApiMessage.bind(this),
    onExecuteMessage: this._onExecuteMessage.bind(this)
  };
  /** @internal */
  this[_constants.K_EXECUTE_MESSAGE] = undefined;
}
Object.defineProperty(ActivityExecution.prototype, 'completed', {
  /** @returns {boolean} */
  get() {
    return this[_constants.K_COMPLETED];
  }
});

/**
 * Begin executing the activity behaviour. Resumes if the message is redelivered.
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @throws {Error} when message or executionId is missing
 */
ActivityExecution.prototype.execute = function execute(executeMessage) {
  if (!executeMessage) throw new Error('Execution requires message');
  const executionId = executeMessage.content?.executionId;
  if (!executionId) throw new Error('Execution requires execution id');
  this.executionId = executionId;
  const initMessage = this[_constants.K_EXECUTE_MESSAGE] = (0, _messageHelper.cloneMessage)(executeMessage, {
    executionId,
    state: 'start',
    isRootScope: true
  });
  if (executeMessage.fields.redelivered) {
    this[K_POSTPONED].clear();
    this._debug('resume execution');
    if (!this.source) this.source = new this.activity.Behaviour(this.activity, this.context);
    this.activate();
    return this.broker.publish('execution', 'execute.resume.execution', (0, _messageHelper.cloneContent)(initMessage.content), {
      persistent: false
    });
  }
  this._debug('execute');
  this.activate();
  this.source = new this.activity.Behaviour(this.activity, this.context);
  this.broker.publish('execution', 'execute.start', (0, _messageHelper.cloneContent)(initMessage.content));
};

/**
 * Bind the execute queue and start consuming execute and api messages.
 */
ActivityExecution.prototype.activate = function activate() {
  if (this[_constants.K_COMPLETED]) return;
  const broker = this.broker;
  const batchSize = this.activity.environment.settings.batchSize || 50;
  broker.bindQueue('execute-q', 'execution', 'execute.#', {
    priority: 100
  });
  const {
    onExecuteMessage,
    onParentApiMessage
  } = this[_constants.K_MESSAGE_HANDLERS];
  this[K_EXECUTE_Q].assertConsumer(onExecuteMessage, {
    exclusive: true,
    prefetch: batchSize * 2,
    priority: 100,
    consumerTag: '_activity-execute'
  });
  if (this[_constants.K_COMPLETED]) return this.deactivate();
  broker.subscribeTmp('api', `activity.*.${this.executionId}`, onParentApiMessage, {
    noAck: true,
    consumerTag: '_activity-api-execution',
    priority: 200
  });
};

/**
 * Cancel execute and api consumers and unbind the execute queue.
 */
ActivityExecution.prototype.deactivate = function deactivate() {
  const broker = this.broker;
  broker.cancel('_activity-api-execution');
  broker.cancel('_activity-execute');
  broker.unbindQueue('execute-q', 'execution', 'execute.#');
};

/**
 * Discard the running execution.
 */
ActivityExecution.prototype.discard = function discard() {
  if (this[_constants.K_COMPLETED]) return;
  const initMessage = this[_constants.K_EXECUTE_MESSAGE];
  if (!initMessage) return this.activity.logger.warn(`<${this.id}> is not executing`);
  this.getApi(initMessage).discard();
};

/**
 * Resolve an Api wrapper, preferring a behaviour-specific Api when the source exposes one.
 * @param {import('#types').ElementBrokerMessage} [apiMessage]
 * @returns {import('#types').IApi<import('./Activity.js').Activity>}
 */
ActivityExecution.prototype.getApi = function getApi(apiMessage) {
  const self = this;
  if (!apiMessage) apiMessage = this[_constants.K_EXECUTE_MESSAGE];
  if (self.source.getApi) {
    const sourceApi = self.source.getApi(apiMessage);
    if (sourceApi) return sourceApi;
  }
  const api = (0, _Api.ActivityApi)(self.broker, apiMessage);
  api.getExecuting = function getExecuting() {
    const result = [];
    for (const msg of self[K_POSTPONED]) {
      if (msg.content.executionId === apiMessage.content.executionId) continue;
      result.push(self.getApi(msg));
    }
    return result;
  };
  return api;
};

/**
 * Pass an execute message straight to the behaviour, executing first if no source is set up yet.
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
ActivityExecution.prototype.passthrough = function passthrough(executeMessage) {
  if (!this.source) return this.execute(executeMessage);
  return this._sourceExecute(executeMessage);
};

/**
 * List currently postponed executions as Api wrappers, including those from sub-process behaviours.
 */
ActivityExecution.prototype.getPostponed = function getPostponed() {
  let apis = [];
  for (const msg of this[K_POSTPONED]) {
    apis.push(this.getApi(msg));
  }
  if (!this.activity.isSubProcess || !this.source) return apis;
  apis = apis.concat(this.source.getPostponed());
  return apis;
};

/**
 * Snapshot execution state, merging behaviour-specific state when the source provides it.
 * @returns {import('#types').ActivityExecutionState}
 */
ActivityExecution.prototype.getState = function getState() {
  const result = {
    completed: this[_constants.K_COMPLETED]
  };
  const source = this.source;
  if (!source || !source.getState) return result;
  return {
    ...result,
    ...source.getState()
  };
};

/**
 * Restore execution state captured by getState.
 * @param {import('#types').ActivityExecutionState} [state]
 * @returns {this}
 */
ActivityExecution.prototype.recover = function recover(state) {
  this[K_POSTPONED].clear();
  if (!state) return this;
  if ('completed' in state) this[_constants.K_COMPLETED] = state.completed;
  const source = this.source = new this.activity.Behaviour(this.activity, this.context);
  if (source.recover) {
    source.recover(state);
  }
  return this;
};

/**
 * Stop the execution via the activity api.
 */
ActivityExecution.prototype.stop = function stop() {
  const executeMessage = this[_constants.K_EXECUTE_MESSAGE];
  if (!executeMessage) return;
  this.getApi(executeMessage).stop();
};

/** @internal */
ActivityExecution.prototype._sourceExecute = function sourceExecute(executeMessage) {
  try {
    return this.source.execute(executeMessage);
  } catch (error) {
    return this.broker.publish('execution', 'execute.error', (0, _messageHelper.cloneContent)(executeMessage.content, {
      error
    }));
  }
};

/** @internal */
ActivityExecution.prototype._onExecuteMessage = function onExecuteMessage(routingKey, message) {
  const {
    fields,
    content,
    properties
  } = message;
  const isRedelivered = fields.redelivered;
  if (isRedelivered && properties.persistent === false) return message.ack();
  switch (routingKey) {
    case 'execute.resume.execution':
      {
        if (!this[K_POSTPONED].size) return this.broker.publish('execution', 'execute.start', (0, _messageHelper.cloneContent)(this[_constants.K_EXECUTE_MESSAGE].content));
        break;
      }
    case 'execute.cancel':
      return this._onExecutionDiscarded('cancel', message);
    case 'execute.error':
      return this._onExecutionDiscarded('error', message);
    case 'execute.discard':
      return this._onExecutionDiscarded('discard', message);
    case 'execute.completed':
      {
        if (isRedelivered) {
          message.ack();
          return this.broker.publish('execution', routingKey, getExecuteMessage(message).content);
        }
        return this._onExecutionCompleted(message);
      }
    case 'execute.start':
      {
        if (!this._onStateChangeMessage(message)) return;
        return this._sourceExecute(getExecuteMessage(message));
      }
    case 'execute.outbound.take':
      {
        if (isRedelivered) {
          message.ack();
          break;
        }
        this.broker.publish('execution', 'execution.outbound.take', (0, _messageHelper.cloneContent)(content), {
          type: 'outbound'
        });
        break;
      }
    default:
      {
        if (!this._onStateChangeMessage(message)) return;
        if (isRedelivered) {
          return this._sourceExecute(getExecuteMessage(message));
        }
      }
  }
};

/** @internal */
ActivityExecution.prototype._onStateChangeMessage = function onStateChangeMessage(message) {
  const {
    ignoreIfExecuting,
    executionId
  } = message.content;
  const postponed = this[K_POSTPONED];
  let previousMsg;
  for (const msg of postponed) {
    if (msg.content.executionId === executionId) previousMsg = msg;
  }
  if (previousMsg) {
    if (ignoreIfExecuting) {
      message.ack();
      return false;
    }
    postponed.delete(previousMsg);
    postponed.add(message);
    previousMsg.ack();
    return true;
  } else {
    postponed.add(message);
    return true;
  }
};

/** @internal */
ActivityExecution.prototype._onExecutionCompleted = function onExecutionCompleted(message) {
  const postponedMsg = this._ackPostponed(message);
  if (!postponedMsg) return;
  const postponed = this[K_POSTPONED];
  const {
    executionId,
    keep,
    isRootScope
  } = message.content;
  if (!isRootScope) {
    this._debug('completed sub execution', executionId);
    if (!keep) message.ack();
    if (postponed.size === 1) {
      const onlyMessage = postponed.values().next().value;
      if (onlyMessage.content.isRootScope && !onlyMessage.content.preventComplete) {
        return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(onlyMessage.content));
      }
    }
    return;
  }
  this._debug('completed execution', executionId);
  this[_constants.K_COMPLETED] = true;
  message.ack(true);
  this.deactivate();
  const subApis = this.getPostponed();
  postponed.clear();
  for (const api of subApis) api.discard();
  this._publishExecutionCompleted('completed', {
    ...postponedMsg.content,
    ...message.content
  }, message.properties.correlationId);
};

/** @internal */
ActivityExecution.prototype._onExecutionDiscarded = function onExecutionDiscarded(discardType, message) {
  const postponedMsg = this._ackPostponed(message);
  const {
    isRootScope,
    error
  } = message.content;
  if (!isRootScope && !postponedMsg) return;
  const postponed = this[K_POSTPONED];
  const correlationId = message.properties.correlationId;
  if (!error && !isRootScope) {
    message.ack();
    if (postponed.size === 1) {
      const onlyMessage = postponed.values().next().value;
      if (onlyMessage.content.isRootScope) {
        return this.broker.publish('execution', 'execute.discard', onlyMessage.content, {
          correlationId
        });
      }
    }
    return;
  }
  message.ack(true);
  this.deactivate();
  const subApis = this.getPostponed();
  postponed.clear();
  for (const api of subApis) api.discard();
  this._publishExecutionCompleted(discardType, (0, _messageHelper.cloneContent)(message.content), correlationId);
};

/** @internal */
ActivityExecution.prototype._publishExecutionCompleted = function publishExecutionCompleted(completionType, completeContent, correlationId) {
  this[_constants.K_COMPLETED] = true;
  this.broker.publish('execution', `execution.${completionType}`, {
    ...completeContent,
    state: completionType
  }, {
    type: completionType,
    correlationId
  });
};

/** @internal */
ActivityExecution.prototype._ackPostponed = function ackPostponed(completeMessage) {
  const {
    executionId: eid
  } = completeMessage.content;
  const postponed = this[K_POSTPONED];
  for (const msg of postponed) {
    if (msg.content.executionId === eid) {
      postponed.delete(msg);
      msg.ack();
      return msg;
    }
  }
};

/** @internal */
ActivityExecution.prototype._onParentApiMessage = function onParentApiMessage(routingKey, message) {
  switch (message.properties.type) {
    case 'error':
      return this[K_EXECUTE_Q].queueMessage({
        routingKey: 'execute.error'
      }, {
        error: message.content.error
      });
    case 'discard':
      return this[K_EXECUTE_Q].queueMessage({
        routingKey: 'execute.discard'
      }, (0, _messageHelper.cloneContent)(this[_constants.K_EXECUTE_MESSAGE].content));
    case 'stop':
      {
        return this._onStop(message);
      }
  }
};

/** @internal */
ActivityExecution.prototype._onStop = function onStop(message) {
  const stoppedId = message?.content?.executionId;
  const running = this.getPostponed();
  for (const api of running) {
    if (stoppedId !== api.content.executionId) {
      api.stop();
    }
  }
  this.broker.cancel('_activity-execute');
  this.broker.cancel('_activity-api-execution');
};

/** @internal */
ActivityExecution.prototype._debug = function debug(logMessage, executionId) {
  executionId = executionId || this.executionId;
  this.activity.logger.debug(`<${executionId} (${this.id})> ${logMessage}`);
};
function getExecuteMessage(message) {
  return (0, _messageHelper.cloneMessage)(message, {
    ...(message.fields.redelivered && {
      isRecovered: true
    }),
    ignoreIfExecuting: undefined
  });
}