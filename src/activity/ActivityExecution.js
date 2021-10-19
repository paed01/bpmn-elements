import {ActivityApi} from '../Api';
import {cloneContent, cloneMessage} from '../messageHelper';

const completedSymbol = Symbol.for('completed');

export default ActivityExecution;

function ActivityExecution(activity, context) {
  if (!(this instanceof ActivityExecution)) return new ActivityExecution(activity, context);
  this.activity = activity;
  this.context = context;
  this.id = activity.id;
  this.broker = activity.broker;
  this.postponed = [];
  this.executeQ = this.broker.assertQueue('execute-q', {durable: true, autoDelete: false});
  this[completedSymbol] = false;
  this.onParentApiMessage = this.onParentApiMessage.bind(this);
  this.onExecuteMessage = this.onExecuteMessage.bind(this);
}

Object.defineProperty(ActivityExecution.prototype, 'completed', {
  enumerable: true,
  get() {
    return this[completedSymbol];
  },
});

ActivityExecution.prototype.execute = function execute(executeMessage) {
  if (!executeMessage) throw new Error('Execution requires message');
  const executionId = executeMessage.content && executeMessage.content.executionId;
  if (!executionId) throw new Error('Execution requires execution id');

  this.executionId = executionId;
  const initMessage = this.initMessage = cloneMessage(executeMessage, {
    executionId,
    state: 'start',
    isRootScope: true,
  });

  if (executeMessage.fields.redelivered) {
    this.postponed.splice(0);
    this.debug('resume execution');

    if (!this.source) this.source = this.activity.Behaviour(this.activity, this.context);

    this.activate();
    return this.broker.publish('execution', 'execute.resume.execution', cloneContent(initMessage.content), {persistent: false});
  }

  this.debug('execute');
  this.activate();
  this.source = this.activity.Behaviour(this.activity, this.context);
  this.broker.publish('execution', 'execute.start', cloneContent(this.initMessage.content));
};

ActivityExecution.prototype.activate = function activate() {
  if (this[completedSymbol]) return;

  const broker = this.broker;
  const batchSize = this.activity.environment.settings.batchSize || 50;
  broker.bindQueue('execute-q', 'execution', 'execute.#', {priority: 100});
  this.executeQ.assertConsumer(this.onExecuteMessage, {exclusive: true, prefetch: batchSize * 2, priority: 100, consumerTag: '_activity-execute'});

  if (this[completedSymbol]) return this.deactivate();

  broker.subscribeTmp('api', `activity.*.${this.executionId}`, this.onParentApiMessage, {noAck: true, consumerTag: '_activity-api-execution', priority: 200});
};

ActivityExecution.prototype.deactivate = function deactivate() {
  const broker = this.broker;
  broker.cancel('_activity-api-execution');
  broker.cancel('_activity-execute');
  broker.unbindQueue('execute-q', 'execution', 'execute.#');
};

ActivityExecution.prototype.discard = function discard() {
  if (this[completedSymbol]) return;
  const initMessage = this.initMessage;
  if (!initMessage) return this.activity.logger.warn(`<${this.id}> is not executing`);
  this.getApi(initMessage).discard();
};

ActivityExecution.prototype.passthrough = function passthrough(executeMessage) {
  if (!this.source) return this.execute(executeMessage);
  return this.source.execute(executeMessage);
};

ActivityExecution.prototype.getApi = function getApi(apiMessage) {
  const self = this;
  if (!apiMessage) apiMessage = this.initMessage;

  if (self.source.getApi) {
    const sourceApi = self.source.getApi(apiMessage);
    if (sourceApi) return sourceApi;
  }

  const api = ActivityApi(self.broker, apiMessage);

  api.getExecuting = function getExecuting() {
    return self.postponed.reduce((result, msg) => {
      if (msg.content.executionId === apiMessage.content.executionId) return result;
      result.push(self.getApi(msg));
      return result;
    }, []);
  };

  return api;
};

ActivityExecution.prototype.getPostponed = function getPostponed() {
  let apis = this.postponed.map((msg) => this.getApi(msg));
  if (!this.activity.isSubProcess || !this.source) return apis;
  apis = apis.concat(this.source.getPostponed());
  return apis;
};

ActivityExecution.prototype.getState = function getState() {
  const result = {completed: this[completedSymbol]};
  const source = this.source;

  if (!source || !source.getState) return result;
  return {...result, ...source.getState()};
};

ActivityExecution.prototype.recover = function recover(state) {
  this.postponed.splice(0);

  if (!state) return this;
  if ('completed' in state) this[completedSymbol] = state.completed;

  const source = this.source = this.activity.Behaviour(this.activity, this.context);
  if (source.recover) {
    source.recover(state);
  }

  return this;
};

ActivityExecution.prototype.stop = function stop() {
  if (!this.initMessage) return;
  this.getApi(this.initMessage).stop();
};

ActivityExecution.prototype.onExecuteMessage = function onExecuteMessage(routingKey, message) {
  const {fields = {}, content, properties = {}} = message;
  const isRedelivered = fields.redelivered;

  if (isRedelivered && properties.persistent === false) return message.ack();

  switch (routingKey) {
    case 'execute.resume.execution': {
      if (!this.postponed.length) return this.broker.publish('execution', 'execute.start', cloneContent(this.initMessage.content));
      break;
    }
    case 'execute.error':
    case 'execute.discard':
      return this.onExecutionDiscarded(message);
    case 'execute.cancel':
    case 'execute.completed': {
      if (isRedelivered) {
        message.ack();
        return this.broker.publish('execution', routingKey, getExecuteMessage(message).content);
      }

      return this.onExecutionCompleted(message);
    }
    case 'execute.start': {
      if (!this.onStateChangeMessage(message)) return;
      return this.source.execute(getExecuteMessage(message));
    }
    case 'execute.outbound.take': {
      if (isRedelivered) {
        message.ack();
        break;
      }
      this.broker.publish('execution', 'execution.outbound.take', cloneContent(content), {type: 'outbound'});
      break;
    }
    default: {
      if (!this.onStateChangeMessage(message)) return;
      if (isRedelivered) {
        return this.source.execute(getExecuteMessage(message));
      }
    }
  }
};

ActivityExecution.prototype.onStateChangeMessage = function onStateChangeMessage(message) {
  const {ignoreIfExecuting, executionId} = message.content;
  const postponed = this.postponed;
  const idx = postponed.findIndex((msg) => msg.content.executionId === executionId);
  let previousMsg;
  if (idx > -1) {
    if (ignoreIfExecuting) {
      message.ack();
      return false;
    }

    previousMsg = postponed.splice(idx, 1, message)[0];
    previousMsg.ack();

    return true;
  }

  postponed.push(message);
  return true;
};

ActivityExecution.prototype.onExecutionCompleted = function onExecutionCompleted(message) {
  const postponedMsg = this.ackPostponed(message);
  if (!postponedMsg) return;
  const postponed = this.postponed;

  const {executionId, keep, isRootScope} = message.content;
  if (!isRootScope) {
    this.debug('completed sub execution');
    if (!keep) message.ack();
    if (postponed.length === 1 && postponed[0].content.isRootScope && !postponed[0].content.preventComplete) {
      return this.broker.publish('execution', 'execute.completed', cloneContent(postponed[0].content));
    }
    return;
  }

  this.debug('completed execution', executionId);
  this[completedSymbol] = true;

  message.ack(true);

  this.deactivate();

  const subApis = this.getPostponed();
  postponed.splice(0);
  subApis.forEach((api) => api.discard());

  this.publishExecutionCompleted('completed', {...postponedMsg.content, ...message.content}, message.properties.correlationId);
};

ActivityExecution.prototype.onExecutionDiscarded = function onExecutionDiscarded(message) {
  const postponedMsg = this.ackPostponed(message);
  const {isRootScope, error} = message.content;
  if (!isRootScope && !postponedMsg) return;

  const postponed = this.postponed;
  const correlationId = message.properties.correlationId;
  if (!error && !isRootScope) {
    message.ack();
    if (postponed.length === 1 && postponed[0].content.isRootScope) {
      return this.broker.publish('execution', 'execute.discard', postponed[0].content, {correlationId});
    }
    return;
  }

  message.ack(true);

  this.deactivate();

  const subApis = this.getPostponed();
  postponed.splice(0);
  subApis.forEach((api) => api.discard());

  this.publishExecutionCompleted(error ? 'error' : 'discard', message.content, correlationId);
};

ActivityExecution.prototype.publishExecutionCompleted = function publishExecutionCompleted(completionType, completeContent, correlationId) {
  this[completedSymbol] = true;

  this.broker.publish('execution', `execution.${completionType}`, {
    ...completeContent,
    state: completionType,
  }, {type: completionType, correlationId});
};

ActivityExecution.prototype.ackPostponed = function ackPostponed(completeMessage) {
  const {executionId: eid} = completeMessage.content;

  const postponed = this.postponed;
  const idx = postponed.findIndex(({content: c}) => c.executionId === eid);
  if (idx === -1) return;
  const [msg] = postponed.splice(idx, 1);
  msg.ack();
  return msg;
};

ActivityExecution.prototype.onParentApiMessage = function onParentApiMessage(routingKey, message) {
  const messageType = message.properties.type;

  switch (messageType) {
    case 'error':
      return this.executeQ.queueMessage({routingKey: 'execute.error'}, {error: message.content.error});
    case 'discard':
      return this.executeQ.queueMessage({routingKey: 'execute.discard'}, cloneContent(this.initMessage.content));
    case 'stop': {
      return this.onStop(message);
    }
  }
};

ActivityExecution.prototype.onStop = function onStop(message) {
  const stoppedId = message && message.content && message.content.executionId;
  const running = this.getPostponed();
  running.forEach((api) => {
    if (stoppedId !== api.content.executionId) {
      api.stop();
    }
  });

  this.broker.cancel('_activity-execute');
  this.broker.cancel('_activity-api-execution');
};

ActivityExecution.prototype.debug = function debugMessage(logMessage, executionId) {
  executionId = executionId || this.executionId;
  this.activity.logger.debug(`<${executionId} (${this.id})> ${logMessage}`);
};

function getExecuteMessage(message) {
  const result = cloneMessage(message, {
    ...(message.fields.redelivered ? {isRecovered: true} : undefined),
    ignoreIfExecuting: undefined,
  });
  return result;
}
