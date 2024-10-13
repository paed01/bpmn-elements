import { ActivityApi } from '../Api.js';
import { cloneContent, cloneMessage } from '../messageHelper.js';

const kCompleted = Symbol.for('completed');
const kExecuteQ = Symbol.for('executeQ');
const kExecuteMessage = Symbol.for('executeMessage');
const kMessageHandlers = Symbol.for('messageHandlers');
const kPostponed = Symbol.for('postponed');

export default ActivityExecution;

function ActivityExecution(activity, context) {
  this.activity = activity;
  this.context = context;
  this.id = activity.id;
  this.broker = activity.broker;
  this[kPostponed] = new Set();
  this[kCompleted] = false;
  this[kExecuteQ] = this.broker.assertQueue('execute-q', { durable: true, autoDelete: false });

  this[kMessageHandlers] = {
    onParentApiMessage: this._onParentApiMessage.bind(this),
    onExecuteMessage: this._onExecuteMessage.bind(this),
  };
}

Object.defineProperty(ActivityExecution.prototype, 'completed', {
  get() {
    return this[kCompleted];
  },
});

ActivityExecution.prototype.execute = function execute(executeMessage) {
  if (!executeMessage) throw new Error('Execution requires message');
  const executionId = executeMessage.content?.executionId;
  if (!executionId) throw new Error('Execution requires execution id');

  this.executionId = executionId;
  const initMessage = (this[kExecuteMessage] = cloneMessage(executeMessage, {
    executionId,
    state: 'start',
    isRootScope: true,
  }));

  if (executeMessage.fields.redelivered) {
    this[kPostponed].clear();
    this._debug('resume execution');

    if (!this.source) this.source = new this.activity.Behaviour(this.activity, this.context);

    this.activate();
    return this.broker.publish('execution', 'execute.resume.execution', cloneContent(initMessage.content), { persistent: false });
  }

  this._debug('execute');
  this.activate();
  this.source = new this.activity.Behaviour(this.activity, this.context);
  this.broker.publish('execution', 'execute.start', cloneContent(initMessage.content));
};

ActivityExecution.prototype.activate = function activate() {
  if (this[kCompleted]) return;

  const broker = this.broker;
  const batchSize = this.activity.environment.settings.batchSize || 50;
  broker.bindQueue('execute-q', 'execution', 'execute.#', { priority: 100 });

  const { onExecuteMessage, onParentApiMessage } = this[kMessageHandlers];
  this[kExecuteQ].assertConsumer(onExecuteMessage, {
    exclusive: true,
    prefetch: batchSize * 2,
    priority: 100,
    consumerTag: '_activity-execute',
  });

  if (this[kCompleted]) return this.deactivate();

  broker.subscribeTmp('api', `activity.*.${this.executionId}`, onParentApiMessage, {
    noAck: true,
    consumerTag: '_activity-api-execution',
    priority: 200,
  });
};

ActivityExecution.prototype.deactivate = function deactivate() {
  const broker = this.broker;
  broker.cancel('_activity-api-execution');
  broker.cancel('_activity-execute');
  broker.unbindQueue('execute-q', 'execution', 'execute.#');
};

ActivityExecution.prototype.discard = function discard() {
  if (this[kCompleted]) return;
  const initMessage = this[kExecuteMessage];
  if (!initMessage) return this.activity.logger.warn(`<${this.id}> is not executing`);
  this.getApi(initMessage).discard();
};

ActivityExecution.prototype.getApi = function getApi(apiMessage) {
  const self = this;
  if (!apiMessage) apiMessage = this[kExecuteMessage];

  if (self.source.getApi) {
    const sourceApi = self.source.getApi(apiMessage);
    if (sourceApi) return sourceApi;
  }

  const api = ActivityApi(self.broker, apiMessage);

  api.getExecuting = function getExecuting() {
    const result = [];
    for (const msg of self[kPostponed]) {
      if (msg.content.executionId === apiMessage.content.executionId) continue;
      result.push(self.getApi(msg));
    }
    return result;
  };

  return api;
};

ActivityExecution.prototype.passthrough = function passthrough(executeMessage) {
  if (!this.source) return this.execute(executeMessage);
  return this._sourceExecute(executeMessage);
};

ActivityExecution.prototype.getPostponed = function getPostponed() {
  let apis = [];
  for (const msg of this[kPostponed]) {
    apis.push(this.getApi(msg));
  }
  if (!this.activity.isSubProcess || !this.source) return apis;
  apis = apis.concat(this.source.getPostponed());
  return apis;
};

ActivityExecution.prototype.getState = function getState() {
  const result = { completed: this[kCompleted] };
  const source = this.source;

  if (!source || !source.getState) return result;
  return { ...result, ...source.getState() };
};

ActivityExecution.prototype.recover = function recover(state) {
  this[kPostponed].clear();

  if (!state) return this;
  if ('completed' in state) this[kCompleted] = state.completed;

  const source = (this.source = new this.activity.Behaviour(this.activity, this.context));
  if (source.recover) {
    source.recover(state);
  }

  return this;
};

ActivityExecution.prototype.stop = function stop() {
  const executeMessage = this[kExecuteMessage];
  if (!executeMessage) return;
  this.getApi(executeMessage).stop();
};

ActivityExecution.prototype._sourceExecute = function sourceExecute(executeMessage) {
  try {
    return this.source.execute(executeMessage);
  } catch (error) {
    return this.broker.publish('execution', 'execute.error', cloneContent(executeMessage.content, { error }));
  }
};

ActivityExecution.prototype._onExecuteMessage = function onExecuteMessage(routingKey, message) {
  const { fields, content, properties } = message;
  const isRedelivered = fields.redelivered;

  if (isRedelivered && properties.persistent === false) return message.ack();

  switch (routingKey) {
    case 'execute.resume.execution': {
      if (!this[kPostponed].size) return this.broker.publish('execution', 'execute.start', cloneContent(this[kExecuteMessage].content));
      break;
    }
    case 'execute.cancel':
      return this._onExecutionDiscarded('cancel', message);
    case 'execute.error':
      return this._onExecutionDiscarded('error', message);
    case 'execute.discard':
      return this._onExecutionDiscarded('discard', message);
    case 'execute.completed': {
      if (isRedelivered) {
        message.ack();
        return this.broker.publish('execution', routingKey, getExecuteMessage(message).content);
      }

      return this._onExecutionCompleted(message);
    }
    case 'execute.start': {
      if (!this._onStateChangeMessage(message)) return;
      return this._sourceExecute(getExecuteMessage(message));
    }
    case 'execute.outbound.take': {
      if (isRedelivered) {
        message.ack();
        break;
      }
      this.broker.publish('execution', 'execution.outbound.take', cloneContent(content), { type: 'outbound' });
      break;
    }
    default: {
      if (!this._onStateChangeMessage(message)) return;
      if (isRedelivered) {
        return this._sourceExecute(getExecuteMessage(message));
      }
    }
  }
};

ActivityExecution.prototype._onStateChangeMessage = function onStateChangeMessage(message) {
  const { ignoreIfExecuting, executionId } = message.content;
  const postponed = this[kPostponed];

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

ActivityExecution.prototype._onExecutionCompleted = function onExecutionCompleted(message) {
  const postponedMsg = this._ackPostponed(message);
  if (!postponedMsg) return;
  const postponed = this[kPostponed];

  const { executionId, keep, isRootScope } = message.content;
  if (!isRootScope) {
    this._debug('completed sub execution');
    if (!keep) message.ack();
    if (postponed.size === 1) {
      const onlyMessage = postponed.values().next().value;
      if (onlyMessage.content.isRootScope && !onlyMessage.content.preventComplete) {
        return this.broker.publish('execution', 'execute.completed', cloneContent(onlyMessage.content));
      }
    }
    return;
  }

  this._debug('completed execution', executionId);
  this[kCompleted] = true;

  message.ack(true);

  this.deactivate();

  const subApis = this.getPostponed();
  postponed.clear();
  for (const api of subApis) api.discard();

  this._publishExecutionCompleted('completed', { ...postponedMsg.content, ...message.content }, message.properties.correlationId);
};

ActivityExecution.prototype._onExecutionDiscarded = function onExecutionDiscarded(discardType, message) {
  const postponedMsg = this._ackPostponed(message);
  const { isRootScope, error } = message.content;
  if (!isRootScope && !postponedMsg) return;

  const postponed = this[kPostponed];
  const correlationId = message.properties.correlationId;
  if (!error && !isRootScope) {
    message.ack();
    if (postponed.size === 1) {
      const onlyMessage = postponed.values().next().value;
      if (onlyMessage.content.isRootScope) {
        return this.broker.publish('execution', 'execute.discard', onlyMessage.content, { correlationId });
      }
    }
    return;
  }

  message.ack(true);

  this.deactivate();

  const subApis = this.getPostponed();
  postponed.clear();
  for (const api of subApis) api.discard();

  this._publishExecutionCompleted(discardType, cloneContent(message.content), correlationId);
};

ActivityExecution.prototype._publishExecutionCompleted = function publishExecutionCompleted(
  completionType,
  completeContent,
  correlationId,
) {
  this[kCompleted] = true;

  this.broker.publish(
    'execution',
    `execution.${completionType}`,
    {
      ...completeContent,
      state: completionType,
    },
    { type: completionType, correlationId },
  );
};

ActivityExecution.prototype._ackPostponed = function ackPostponed(completeMessage) {
  const { executionId: eid } = completeMessage.content;

  const postponed = this[kPostponed];
  for (const msg of postponed) {
    if (msg.content.executionId === eid) {
      postponed.delete(msg);
      msg.ack();
      return msg;
    }
  }
};

ActivityExecution.prototype._onParentApiMessage = function onParentApiMessage(routingKey, message) {
  switch (message.properties.type) {
    case 'error':
      return this[kExecuteQ].queueMessage({ routingKey: 'execute.error' }, { error: message.content.error });
    case 'discard':
      return this[kExecuteQ].queueMessage({ routingKey: 'execute.discard' }, cloneContent(this[kExecuteMessage].content));
    case 'stop': {
      return this._onStop(message);
    }
  }
};

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

ActivityExecution.prototype._debug = function debug(logMessage, executionId) {
  executionId = executionId || this.executionId;
  this.activity.logger.debug(`<${executionId} (${this.id})> ${logMessage}`);
};

function getExecuteMessage(message) {
  const result = cloneMessage(message, {
    ...(message.fields.redelivered && { isRecovered: true }),
    ignoreIfExecuting: undefined,
  });
  return result;
}
