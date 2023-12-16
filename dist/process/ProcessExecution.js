"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _Api = require("../Api.js");
var _messageHelper = require("../messageHelper.js");
var _shared = require("../shared.js");
var _Tracker = require("../Tracker.js");
var _default = exports.default = ProcessExecution;
const kActivated = Symbol.for('activated');
const kActivityQ = Symbol.for('activityQ');
const kCompleted = Symbol.for('completed');
const kElements = Symbol.for('elements');
const kExecuteMessage = Symbol.for('executeMessage');
const kMessageHandlers = Symbol.for('messageHandlers');
const kParent = Symbol.for('parent');
const kStatus = Symbol.for('status');
const kStopped = Symbol.for('stopped');
const kTracker = Symbol.for('activity tracker');
function ProcessExecution(parentActivity, context) {
  const {
    id,
    type,
    broker,
    isSubProcess,
    isTransaction
  } = parentActivity;
  this[kParent] = parentActivity;
  this.id = id;
  this.type = type;
  this.isSubProcess = isSubProcess;
  this.isTransaction = isSubProcess && isTransaction;
  this.broker = broker;
  this.environment = context.environment;
  this.context = context;
  this[kElements] = {
    children: context.getActivities(id),
    associations: context.getAssociations(id),
    flows: context.getSequenceFlows(id),
    outboundMessageFlows: context.getMessageFlows(id),
    startActivities: [],
    triggeredByEvent: [],
    detachedActivities: [],
    startSequences: {},
    postponed: []
  };
  const exchangeName = this._exchangeName = isSubProcess ? 'subprocess-execution' : 'execution';
  broker.assertExchange(exchangeName, 'topic', {
    autoDelete: false,
    durable: true
  });
  this[kCompleted] = false;
  this[kStopped] = false;
  this[kActivated] = false;
  this[kStatus] = 'init';
  this[kTracker] = new _Tracker.ActivityTracker(id);
  this.executionId = undefined;
  this[kMessageHandlers] = {
    onActivityEvent: this._onActivityEvent.bind(this),
    onApiMessage: this._onApiMessage.bind(this),
    onChildMessage: this._onChildMessage.bind(this),
    onMessageFlowEvent: this._onMessageFlowEvent.bind(this)
  };
}
Object.defineProperty(ProcessExecution.prototype, 'stopped', {
  enumerable: true,
  get() {
    return this[kStopped];
  }
});
Object.defineProperty(ProcessExecution.prototype, 'completed', {
  enumerable: true,
  get() {
    return this[kCompleted];
  }
});
Object.defineProperty(ProcessExecution.prototype, 'status', {
  enumerable: true,
  get() {
    return this[kStatus];
  }
});
Object.defineProperty(ProcessExecution.prototype, 'postponedCount', {
  get() {
    return this[kElements].postponed.length;
  }
});
Object.defineProperty(ProcessExecution.prototype, 'isRunning', {
  get() {
    return this[kActivated];
  }
});
Object.defineProperty(ProcessExecution.prototype, 'activityStatus', {
  get() {
    return this[kTracker].activityStatus;
  }
});
ProcessExecution.prototype.execute = function execute(executeMessage) {
  if (!executeMessage) throw new Error('Process execution requires message');
  if (!executeMessage.content || !executeMessage.content.executionId) throw new Error('Process execution requires execution id');
  const executionId = this.executionId = executeMessage.content.executionId;
  this[kExecuteMessage] = (0, _messageHelper.cloneMessage)(executeMessage, {
    executionId,
    state: 'start'
  });
  this[kStopped] = false;
  this.environment.assignVariables(executeMessage);
  this[kActivityQ] = this.broker.assertQueue(`execute-${executionId}-q`, {
    durable: true,
    autoDelete: false
  });
  if (executeMessage.fields.redelivered) {
    return this.resume();
  }
  this._debug(`execute ${this.isSubProcess ? 'sub process' : 'process'}`);
  this._activate();
  this._start();
  return true;
};
ProcessExecution.prototype.resume = function resume() {
  this._debug(`resume process execution at ${this.status}`);
  if (this[kCompleted]) return this._complete('completed');
  this._activate();
  const {
    startActivities,
    detachedActivities,
    postponed
  } = this[kElements];
  if (startActivities.length > 1) {
    for (const a of startActivities) a.shake();
  }
  postponed.splice(0);
  detachedActivities.splice(0);
  this[kActivityQ].consume(this[kMessageHandlers].onChildMessage, {
    prefetch: 1000,
    consumerTag: `_process-activity-${this.executionId}`
  });
  if (this[kCompleted]) return;
  const status = this.status;
  if (status === 'init') return this._start();
  const tracker = this[kTracker];
  for (const msg of postponed.slice()) {
    const activity = this.getActivityById(msg.content.id);
    if (!activity) continue;
    if (msg.content.placeholder) continue;
    if (!activity.status) {
      this._popPostponed(msg.content);
      msg.ack();
      continue;
    }
    tracker.track(msg.fields.routingKey, msg);
    activity.resume();
  }
  if (this[kCompleted]) return;
  if (!postponed.length && status === 'executing') return this._complete('completed');
};
ProcessExecution.prototype.getState = function getState() {
  const {
    children,
    flows,
    outboundMessageFlows,
    associations
  } = this[kElements];
  return {
    executionId: this.executionId,
    stopped: this[kStopped],
    completed: this[kCompleted],
    status: this.status,
    children: children.reduce((result, activity) => {
      if (activity.placeholder) return result;
      result.push(activity.getState());
      return result;
    }, []),
    ...(flows.length && {
      flows: flows.map(f => f.getState())
    }),
    ...(outboundMessageFlows.length && {
      messageFlows: outboundMessageFlows.length && outboundMessageFlows.map(f => f.getState())
    }),
    ...(associations.length && {
      associations: associations.map(f => f.getState())
    })
  };
};
ProcessExecution.prototype.recover = function recover(state) {
  if (!state) return this;
  this.executionId = state.executionId;
  this[kStopped] = state.stopped;
  this[kCompleted] = state.completed;
  this[kStatus] = state.status;
  this._debug(`recover process execution at ${this.status}`);
  if (state.messageFlows) {
    for (const flowState of state.messageFlows) {
      const flow = this._getMessageFlowById(flowState.id);
      if (!flow) continue;
      flow.recover(flowState);
    }
  }
  if (state.associations) {
    for (const associationState of state.associations) {
      const association = this._getAssociationById(associationState.id);
      if (!association) continue;
      association.recover(associationState);
    }
  }
  if (state.flows) {
    for (const flowState of state.flows) {
      const flow = this._getFlowById(flowState.id);
      if (!flow) continue;
      flow.recover(flowState);
    }
  }
  if (state.children) {
    for (const childState of state.children) {
      const child = this.getActivityById(childState.id);
      if (!child) continue;
      child.recover(childState);
    }
  }
  return this;
};
ProcessExecution.prototype.shake = function shake(fromId) {
  let executing = true;
  const id = this.id;
  if (!this.isRunning) {
    executing = false;
    this.executionId = (0, _shared.getUniqueId)(id);
    this._activate();
  }
  const toShake = fromId ? [this.getActivityById(fromId)].filter(Boolean) : this[kElements].startActivities;
  const result = {};
  this.broker.subscribeTmp('event', '*.shake.*', (routingKey, {
    content
  }) => {
    let isLooped = false;
    switch (routingKey) {
      case 'flow.shake.loop':
        isLooped = true;
      case 'activity.shake.end':
        {
          const {
            id: shakeId,
            parent: shakeParent
          } = content;
          if (shakeParent.id !== id) return;
          result[shakeId] = result[shakeId] || [];
          result[shakeId].push({
            ...content,
            isLooped
          });
          break;
        }
    }
  }, {
    noAck: true,
    consumerTag: `_shaker-${this.executionId}`
  });
  for (const a of toShake) a.shake();
  if (!executing) this._deactivate();
  this.broker.cancel(`_shaker-${this.executionId}`);
  return result;
};
ProcessExecution.prototype.stop = function stop() {
  this.getApi().stop();
};
ProcessExecution.prototype.getPostponed = function getPostponed(filterFn) {
  const result = [];
  for (const msg of this[kElements].postponed.slice()) {
    const api = this._getChildApi(msg);
    if (!api) continue;
    if (filterFn && !filterFn(api)) continue;
    result.push(api);
  }
  return result;
};
ProcessExecution.prototype.discard = function discard() {
  this[kStatus] = 'discard';
  return this[kActivityQ].queueMessage({
    routingKey: 'execution.discard'
  }, {
    id: this.id,
    type: this.type,
    executionId: this.executionId
  }, {
    type: 'discard'
  });
};
ProcessExecution.prototype.cancel = function discard() {
  return this[kActivityQ].queueMessage({
    routingKey: 'execution.cancel'
  }, {
    id: this.id,
    type: this.type,
    executionId: this.executionId
  }, {
    type: 'cancel'
  });
};
ProcessExecution.prototype.getActivities = function getActivities() {
  return this[kElements].children.slice();
};
ProcessExecution.prototype.getActivityById = function getActivityById(activityId) {
  return this[kElements].children.find(child => child.id === activityId);
};
ProcessExecution.prototype.getSequenceFlows = function getSequenceFlows() {
  return this[kElements].flows.slice();
};
ProcessExecution.prototype.getAssociations = function getAssociations() {
  return this[kElements].associations.slice();
};
ProcessExecution.prototype.getApi = function getApi(message) {
  if (!message) return (0, _Api.ProcessApi)(this.broker, this[kExecuteMessage]);
  const content = message.content;
  if (content.executionId !== this.executionId) {
    return this._getChildApi(message);
  }
  const api = (0, _Api.ProcessApi)(this.broker, message);
  const postponed = this[kElements].postponed;
  const self = this;
  api.getExecuting = function getExecuting() {
    return postponed.reduce((result, msg) => {
      const childApi = self._getChildApi(msg);
      if (childApi) result.push(childApi);
      return result;
    }, []);
  };
  return api;
};
ProcessExecution.prototype._start = function start() {
  if (this[kElements].children.length === 0) {
    return this._complete('completed');
  }
  this[kStatus] = 'start';
  const executeContent = {
    ...this[kExecuteMessage].content,
    state: this.status
  };
  this.broker.publish(this._exchangeName, 'execute.start', (0, _messageHelper.cloneContent)(executeContent));
  const {
    startActivities,
    postponed,
    detachedActivities
  } = this[kElements];
  if (startActivities.length > 1) {
    for (const a of startActivities) a.shake();
  }
  for (const a of startActivities) a.init();
  this[kStatus] = 'executing';
  for (const a of startActivities) a.run();
  postponed.splice(0);
  detachedActivities.splice(0);
  this[kActivityQ].assertConsumer(this[kMessageHandlers].onChildMessage, {
    prefetch: 1000,
    consumerTag: `_process-activity-${this.executionId}`
  });
};
ProcessExecution.prototype._activate = function activate() {
  const {
    onApiMessage,
    onMessageFlowEvent,
    onActivityEvent
  } = this[kMessageHandlers];
  if (!this.isSubProcess) {
    this.broker.consume('api-q', onApiMessage, {
      noAck: true,
      consumerTag: `_process-api-consumer-${this.executionId}`,
      priority: 200
    });
  } else {
    this.broker.subscribeTmp('api', '#', onApiMessage, {
      noAck: true,
      consumerTag: `_process-api-consumer-${this.executionId}`,
      priority: 200
    });
  }
  const {
    outboundMessageFlows,
    flows,
    associations,
    startActivities,
    triggeredByEvent,
    children
  } = this[kElements];
  for (const flow of outboundMessageFlows) {
    flow.activate();
    flow.broker.subscribeTmp('event', '#', onMessageFlowEvent, {
      consumerTag: '_process-message-consumer',
      noAck: true,
      priority: 200
    });
  }
  for (const flow of flows) {
    flow.broker.subscribeTmp('event', '#', onActivityEvent, {
      consumerTag: '_process-flow-controller',
      noAck: true,
      priority: 200
    });
  }
  for (const association of associations) {
    association.broker.subscribeTmp('event', '#', onActivityEvent, {
      consumerTag: '_process-association-controller',
      noAck: true,
      priority: 200
    });
  }
  startActivities.splice(0);
  triggeredByEvent.splice(0);
  for (const activity of children) {
    if (activity.placeholder) continue;
    activity.activate(this);
    activity.broker.subscribeTmp('event', '#', onActivityEvent, {
      noAck: true,
      consumerTag: '_process-activity-consumer',
      priority: 200
    });
    if (activity.isStart) startActivities.push(activity);
    if (activity.triggeredByEvent) triggeredByEvent.push(activity);
  }
  this[kActivated] = true;
};
ProcessExecution.prototype._deactivate = function deactivate() {
  const broker = this.broker;
  const executionId = this.executionId;
  broker.cancel(`_process-api-consumer-${executionId}`);
  broker.cancel(`_process-activity-${executionId}`);
  const {
    children,
    flows,
    associations,
    outboundMessageFlows
  } = this[kElements];
  for (const activity of children) {
    if (activity.placeholder) continue;
    activity.broker.cancel('_process-activity-consumer');
    activity.deactivate();
  }
  for (const flow of flows) {
    flow.broker.cancel('_process-flow-controller');
  }
  for (const association of associations) {
    association.broker.cancel('_process-association-controller');
  }
  for (const flow of outboundMessageFlows) {
    flow.deactivate();
    flow.broker.cancel('_process-message-consumer');
  }
  this[kActivated] = false;
};
ProcessExecution.prototype._onDelegateEvent = function onDelegateEvent(message) {
  const eventType = message.properties.type;
  let delegate = true;
  const content = message.content;
  if (content.message && content.message.id) {
    this._debug(`delegate ${eventType} event with id <${content.message.id}>`);
  } else {
    this._debug(`delegate ${eventType} anonymous event`);
  }
  for (const activity of this[kElements].triggeredByEvent) {
    if (activity.getStartActivities({
      referenceId: content.message && content.message.id,
      referenceType: eventType
    }).length) {
      delegate = false;
      activity.run(content.message);
    }
  }
  this.getApi().sendApiMessage(eventType, content, {
    delegate: true
  });
  return delegate;
};
ProcessExecution.prototype._onMessageFlowEvent = function onMessageFlowEvent(routingKey, message) {
  this.broker.publish('message', routingKey, (0, _messageHelper.cloneContent)(message.content), message.properties);
};
ProcessExecution.prototype._onActivityEvent = function onActivityEvent(routingKey, message) {
  if (message.fields.redelivered && message.properties.persistent === false) return;
  const content = message.content;
  const parent = content.parent = content.parent || {};
  let delegate = message.properties.delegate;
  const shaking = message.properties.type === 'shake';
  const isDirectChild = content.parent.id === this.id;
  if (isDirectChild) {
    parent.executionId = this.executionId;
  } else {
    content.parent = (0, _messageHelper.pushParent)(parent, {
      id: this.id,
      type: this.type,
      executionId: this.executionId
    });
  }
  if (delegate) delegate = this._onDelegateEvent(message);
  this[kTracker].track(routingKey, message);
  this.broker.publish('event', routingKey, content, {
    ...message.properties,
    delegate,
    mandatory: false
  });
  if (shaking) return this._onShookEnd(message);
  if (!isDirectChild) return;
  switch (routingKey) {
    case 'process.terminate':
      return this[kActivityQ].queueMessage({
        routingKey: 'execution.terminate'
      }, (0, _messageHelper.cloneContent)(content), {
        type: 'terminate',
        persistent: true
      });
    case 'activity.stop':
      return;
  }
  this[kActivityQ].queueMessage(message.fields, (0, _messageHelper.cloneContent)(content), {
    persistent: true,
    ...message.properties
  });
};
ProcessExecution.prototype._onChildMessage = function onChildMessage(routingKey, message) {
  if (message.fields.redelivered && message.properties.persistent === false) return message.ack();
  const content = message.content;
  switch (routingKey) {
    case 'execution.stop':
      message.ack();
      return this._stopExecution(message);
    case 'execution.terminate':
      message.ack();
      return this._terminate(message);
    case 'execution.discard':
      message.ack();
      return this._onDiscard(message);
    case 'execution.discard.detached':
      {
        message.ack();
        for (const detached of this[kElements].detachedActivities) {
          this._getChildApi(detached).discard();
        }
        return;
      }
    case 'execution.cancel':
      message.ack();
      return this._onCancel(message);
    case 'activity.error.caught':
      {
        const prevMsg = this[kElements].postponed.find(msg => {
          return msg.content.executionId === content.executionId;
        });
        if (!prevMsg) return message.ack();
        break;
      }
    case 'flow.looped':
    case 'activity.leave':
      return this._onChildCompleted(message);
  }
  this._stateChangeMessage(message, true);
  switch (routingKey) {
    case 'activity.detach':
      {
        this[kElements].detachedActivities.push((0, _messageHelper.cloneMessage)(message));
        break;
      }
    case 'activity.cancel':
      {
        if (this.isTransaction) this._onCancel(message);
        break;
      }
    case 'activity.discard':
    case 'activity.enter':
      {
        if (!content.inbound) break;
        for (const inbound of content.inbound) {
          if (!inbound.isSequenceFlow && !inbound.isAssociation) continue;
          const inboundMessage = this._popPostponed(inbound);
          if (inboundMessage) inboundMessage.ack();
        }
        break;
      }
    case 'activity.error':
      {
        const eventCaughtBy = this[kElements].postponed.find(msg => {
          if (msg.fields.routingKey !== 'activity.catch') return;
          return msg.content.source && msg.content.source.executionId === content.executionId;
        });
        if (eventCaughtBy) {
          this[kActivityQ].queueMessage({
            routingKey: 'activity.error.caught'
          }, (0, _messageHelper.cloneContent)(content), {
            persistent: true,
            ...message.properties
          });
          return this._debug('error was caught');
        }
        return this._complete('error', {
          error: content.error
        });
      }
  }
};
ProcessExecution.prototype._stateChangeMessage = function stateChangeMessage(message, postponeMessage) {
  const previousMsg = this._popPostponed(message.content);
  if (previousMsg) previousMsg.ack();
  if (postponeMessage) this[kElements].postponed.push(message);
};
ProcessExecution.prototype._popPostponed = function popPostponed(byContent) {
  const {
    postponed,
    detachedActivities
  } = this[kElements];
  const postponedIdx = postponed.findIndex(msg => {
    if (msg.content.isSequenceFlow || msg.content.isAssociation) return msg.content.sequenceId === byContent.sequenceId;
    return msg.content.executionId === byContent.executionId;
  });
  let postponedMsg;
  if (postponedIdx > -1) {
    postponedMsg = postponed.splice(postponedIdx, 1)[0];
  }
  const detachedIdx = detachedActivities.findIndex(msg => msg.content.executionId === byContent.executionId);
  if (detachedIdx > -1) detachedActivities.splice(detachedIdx, 1);
  return postponedMsg;
};
ProcessExecution.prototype._onChildCompleted = function onChildCompleted(message) {
  this._stateChangeMessage(message, false);
  if (message.fields.redelivered) return message.ack();
  const {
    id,
    type,
    isEnd
  } = message.content;
  const {
    postponed,
    detachedActivities,
    startActivities
  } = this[kElements];
  const postponedCount = postponed.length;
  if (!postponedCount) {
    this._debug(`left <${id}> (${type}), pending runs ${postponedCount}`);
    message.ack();
    return this._complete('completed');
  }
  this._debug(`left <${id}> (${type}), pending runs ${postponedCount}, ${postponed.map(a => a.content.id).join(',')}`);
  if (postponedCount && postponedCount === detachedActivities.length) {
    return this[kActivityQ].queueMessage({
      routingKey: 'execution.discard.detached'
    }, {
      id: this.id,
      type: this.type,
      executionId: this.executionId
    }, {
      type: 'cancel'
    });
  }
  if (isEnd && startActivities.length) {
    const startSequences = this[kElements].startSequences;
    for (const msg of postponed) {
      const postponedId = msg.content.id;
      const startSequence = startSequences[postponedId];
      if (startSequence) {
        if (startSequence.content.sequence.some(({
          id: sid
        }) => sid === id)) {
          this._getChildApi(msg).discard();
        }
      }
    }
  }
};
ProcessExecution.prototype._stopExecution = function stopExecution(message) {
  const postponedCount = this.postponedCount;
  this._debug(`stop process execution (stop child executions ${postponedCount})`);
  if (postponedCount) {
    for (const api of this.getPostponed()) api.stop();
  }
  this._deactivate();
  this[kStopped] = true;
  return this.broker.publish(this._exchangeName, `execution.stopped.${this.executionId}`, {
    ...this[kExecuteMessage].content,
    ...(message && message.content)
  }, {
    type: 'stopped',
    persistent: false
  });
};
ProcessExecution.prototype._onDiscard = function onDiscard() {
  this._deactivate();
  const running = this[kElements].postponed.splice(0);
  this._debug(`discard process execution (discard child executions ${running.length})`);
  if (this.isSubProcess) {
    this.stop();
  } else {
    for (const flow of this.getSequenceFlows()) flow.stop();
    for (const flow of this.getAssociations()) flow.stop();
    for (const msg of running) this._getChildApi(msg).discard();
  }
  this[kActivityQ].purge();
  return this._complete('discard');
};
ProcessExecution.prototype._onCancel = function onCancel() {
  const running = this[kElements].postponed.slice(0);
  const isTransaction = this.isTransaction;
  if (isTransaction) {
    this._debug(`cancel transaction execution (cancel child executions ${running.length})`);
    this[kStatus] = 'cancel';
    this.broker.publish('event', 'transaction.cancel', (0, _messageHelper.cloneMessage)(this[kExecuteMessage], {
      state: 'cancel'
    }));
    for (const msg of running) {
      if (msg.content.expect === 'compensate') {
        this._getChildApi(msg).sendApiMessage('compensate');
      } else if (!msg.content.isForCompensation) {
        this._getChildApi(msg).discard();
      }
    }
  } else {
    this._debug(`cancel process execution (cancel child executions ${running.length})`);
    for (const msg of running) {
      this._getChildApi(msg).discard();
    }
  }
};
ProcessExecution.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  if (message.properties.delegate) {
    return this._delegateApiMessage(routingKey, message);
  }
  if (this.id !== message.content.id) {
    const child = this.getActivityById(message.content.id);
    if (!child) return null;
    return child.broker.publish('api', routingKey, message.content, message.properties);
  }
  if (this.executionId !== message.content.executionId) return;
  switch (message.properties.type) {
    case 'cancel':
      return this.cancel(message);
    case 'discard':
      return this.discard(message);
    case 'stop':
      this[kActivityQ].queueMessage({
        routingKey: 'execution.stop'
      }, (0, _messageHelper.cloneContent)(message.content), {
        persistent: false
      });
      break;
  }
};
ProcessExecution.prototype._delegateApiMessage = function delegateApiMessage(routingKey, message, continueOnConsumed) {
  const correlationId = message.properties.correlationId || (0, _shared.getUniqueId)(this.executionId);
  this._debug(`delegate api ${routingKey} message to children, with correlationId <${correlationId}>`);
  const broker = this.broker;
  let consumed = false;
  broker.subscribeTmp('event', 'activity.consumed', (_, msg) => {
    if (msg.properties.correlationId === correlationId) {
      consumed = true;
      this._debug(`delegated api message was consumed by ${msg.content ? msg.content.executionId : 'unknown'}`);
    }
  }, {
    consumerTag: `_ct-delegate-${correlationId}`,
    noAck: true
  });
  for (const child of this[kElements].children) {
    if (child.placeholder) continue;
    child.broker.publish('api', routingKey, (0, _messageHelper.cloneContent)(message.content), message.properties);
    if (consumed && !continueOnConsumed) break;
  }
  return broker.cancel(`_ct-delegate-${correlationId}`);
};
ProcessExecution.prototype._complete = function complete(completionType, content) {
  this._deactivate();
  this[kCompleted] = true;
  const status = this.status;
  switch (this.status) {
    case 'cancel':
      this._debug('process execution cancelled');
    case 'discard':
      completionType = status;
      break;
    case 'terminated':
      break;
    default:
      this._debug(`process execution ${completionType}`);
      this[kStatus] = completionType;
  }
  const broker = this.broker;
  this[kActivityQ].delete();
  return broker.publish(this._exchangeName, `execution.${completionType}.${this.executionId}`, (0, _messageHelper.cloneContent)(this[kExecuteMessage].content, {
    output: {
      ...this.environment.output
    },
    ...content,
    state: completionType
  }), {
    type: completionType,
    mandatory: completionType === 'error'
  });
};
ProcessExecution.prototype._terminate = function terminate(message) {
  this[kStatus] = 'terminated';
  this._debug('terminating process execution');
  const running = this[kElements].postponed.splice(0);
  for (const flow of this.getSequenceFlows()) flow.stop();
  for (const flow of this.getAssociations()) flow.stop();
  for (const msg of running) {
    const {
      id: postponedId,
      isSequenceFlow,
      isAssociation
    } = msg.content;
    if (postponedId === message.content.id) continue;
    if (isSequenceFlow || isAssociation) continue;
    this._getChildApi(msg).stop();
    msg.ack();
  }
  this[kActivityQ].purge();
};
ProcessExecution.prototype._getFlowById = function getFlowById(flowId) {
  return this[kElements].flows.find(f => f.id === flowId);
};
ProcessExecution.prototype._getAssociationById = function getAssociationById(associationId) {
  return this[kElements].associations.find(a => a.id === associationId);
};
ProcessExecution.prototype._getMessageFlowById = function getMessageFlowById(flowId) {
  return this[kElements].outboundMessageFlows.find(f => f.id === flowId);
};
ProcessExecution.prototype._getChildById = function getChildById(childId) {
  return this.getActivityById(childId) || this._getFlowById(childId);
};
ProcessExecution.prototype._getChildApi = function getChildApi(message) {
  const content = message.content;
  let child = this._getChildById(content.id);
  if (child) return child.getApi(message);
  if (!content.parent) return;
  child = this._getChildById(content.parent.id);
  if (child) return child.getApi(message);
  if (!content.parent.path) return;
  for (const pp of content.parent.path) {
    child = this._getChildById(pp.id, message);
    if (child) return child.getApi(message);
  }
};
ProcessExecution.prototype._onShookEnd = function onShookEnd(message) {
  const routingKey = message.fields.routingKey;
  if (routingKey !== 'activity.shake.end') return;
  this[kElements].startSequences[message.content.id] = (0, _messageHelper.cloneMessage)(message);
};
ProcessExecution.prototype._debug = function debugMessage(logMessage) {
  this[kParent].logger.debug(`<${this.executionId} (${this.id})> ${logMessage}`);
};