"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _Api = require("../Api");

var _messageHelper = require("../messageHelper");

var _shared = require("../shared");

var _default = ProcessExecution;
exports.default = _default;
const parentSymbol = Symbol.for('parent');
const stateMessageSymbol = Symbol.for('stateMessage');
const stoppedSymbol = Symbol.for('stopped');
const completedSymbol = Symbol.for('completed');
const activatedSymbol = Symbol.for('activated');
const statusSymbol = Symbol.for('status');

function ProcessExecution(parentActivity, context) {
  this[parentSymbol] = parentActivity;
  this.id = parentActivity.id;
  this.type = parentActivity.type;
  this.broker = parentActivity.broker;
  this.context = context;
  this.environment = context.environment;
  const {
    id,
    broker,
    isSubProcess
  } = parentActivity;
  this.elements = {
    children: context.getActivities(id),
    associations: context.getAssociations(id),
    flows: context.getSequenceFlows(id),
    outboundMessageFlows: context.getMessageFlows(id),
    startActivities: [],
    triggeredByEvent: [],
    detachedActivities: [],
    startSequences: {}
  };
  this.postponed = [];
  const exchangeName = this.exchangeName = isSubProcess ? 'subprocess-execution' : 'execution';
  broker.assertExchange(exchangeName, 'topic', {
    autoDelete: false,
    durable: true
  });
  this[completedSymbol] = false;
  this[stoppedSymbol] = false;
  this[activatedSymbol] = false;
  this[statusSymbol] = 'init';
  this.onChildMessage = this.onChildMessage.bind(this);
}

const proto = ProcessExecution.prototype;
Object.defineProperty(proto, 'stopped', {
  enumerable: true,

  get() {
    return this[stoppedSymbol];
  }

});
Object.defineProperty(proto, 'completed', {
  enumerable: true,

  get() {
    return this[completedSymbol];
  }

});
Object.defineProperty(proto, 'status', {
  enumerable: true,

  get() {
    return this[statusSymbol];
  }

});
Object.defineProperty(proto, 'postponedCount', {
  get() {
    return this.postponed.length;
  }

});
Object.defineProperty(proto, 'isRunning', {
  get() {
    return this[activatedSymbol];
  }

});

proto.execute = function execute(executeMessage) {
  if (!executeMessage) throw new Error('Process execution requires message');
  if (!executeMessage.content || !executeMessage.content.executionId) throw new Error('Process execution requires execution id');
  const executionId = this.executionId = executeMessage.content.executionId;
  const stateMessage = this[stateMessageSymbol] = (0, _messageHelper.cloneMessage)(executeMessage);
  stateMessage.content = { ...stateMessage.content,
    executionId,
    state: 'start'
  };
  this[stoppedSymbol] = false;
  this.environment.assignVariables(executeMessage);
  this.activityQ = this.broker.assertQueue(`execute-${executionId}-q`, {
    durable: true,
    autoDelete: false
  });

  if (executeMessage.fields.redelivered) {
    return this.resume();
  }

  this.debug(`execute ${this[parentSymbol].isSubProcess ? 'sub process' : 'process'}`);
  this.activate();
  this.start();
  return true;
};

proto.resume = function resume() {
  this.debug(`resume process execution at ${this.status}`);
  if (this[completedSymbol]) return this.complete('completed');
  this.activate();
  const {
    startActivities,
    detachedActivities
  } = this.elements;

  if (startActivities.length > 1) {
    startActivities.forEach(a => a.shake());
  }

  this.postponed.splice(0);
  detachedActivities.splice(0);
  this.activityQ.consume(this.onChildMessage, {
    prefetch: 1000,
    consumerTag: `_process-activity-${this.executionId}`
  });
  if (this[completedSymbol]) return this.complete('completed');

  switch (this.status) {
    case 'init':
      return this.start();

    case 'executing':
      {
        if (!this.postponed.length) return this.complete('completed');
        break;
      }
  }

  for (const {
    content
  } of this.postponed.slice()) {
    const activity = this.getActivityById(content.id);
    if (!activity) continue;
    if (content.placeholder) continue;
    activity.resume();
  }
};

proto.start = function start() {
  if (this.elements.children.length === 0) {
    return this.complete('completed');
  }

  this[statusSymbol] = 'start';
  const executeContent = { ...this[stateMessageSymbol].content,
    state: this.status
  };
  this.broker.publish(this.exchangeName, 'execute.start', (0, _messageHelper.cloneContent)(executeContent));
  const startActivities = this.elements.startActivities;

  if (startActivities.length > 1) {
    startActivities.forEach(a => a.shake());
  }

  startActivities.forEach(activity => activity.init());
  startActivities.forEach(activity => activity.run());
  this.postponed.splice(0);
  this.elements.detachedActivities.splice(0);
  this.activityQ.assertConsumer(this.onChildMessage, {
    prefetch: 1000,
    consumerTag: `_process-activity-${this.executionId}`
  });
};

proto.recover = function recover(state) {
  if (!state) return this;
  this.executionId = state.executionId;
  this[stoppedSymbol] = state.stopped;
  this[completedSymbol] = state.completed;
  this[statusSymbol] = state.status;
  this.debug(`recover process execution at ${this.status}`);

  if (state.messageFlows) {
    state.messageFlows.forEach(flowState => {
      const flow = this.getMessageFlowById(flowState.id);
      if (!flow) return;
      flow.recover(flowState);
    });
  }

  if (state.associations) {
    state.associations.forEach(associationState => {
      const association = this.getAssociationById(associationState.id);
      if (!association) return;
      association.recover(associationState);
    });
  }

  if (state.flows) {
    state.flows.forEach(flowState => {
      const flow = this.getFlowById(flowState.id);
      if (!flow) return;
      flow.recover(flowState);
    });
  }

  if (state.children) {
    state.children.forEach(childState => {
      const child = this.getActivityById(childState.id);
      if (!child) return;
      child.recover(childState);
    });
  }

  return this;
};

proto.shake = function shake(fromId) {
  let executing = true;
  const id = this.id;

  if (!this.isRunning) {
    executing = false;
    this.executionId = (0, _shared.getUniqueId)(id);
    this.activate();
  }

  const toShake = fromId ? [this.getActivityById(fromId)].filter(Boolean) : this.elements.startActivities;
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
          result[shakeId].push({ ...content,
            isLooped
          });
          break;
        }
    }
  }, {
    noAck: true,
    consumerTag: `_shaker-${this.executionId}`
  });
  toShake.forEach(a => a.shake());
  if (!executing) this.deactivate();
  this.broker.cancel(`_shaker-${this.executionId}`);
  return result;
};

proto.stop = function stop() {
  this.getApi().stop();
};

proto.activate = function activate() {
  this.broker.subscribeTmp('api', '#', this.onApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_process-api-consumer-${this.executionId}`,
    priority: 200
  });
  const {
    outboundMessageFlows,
    flows,
    associations,
    startActivities,
    triggeredByEvent,
    children
  } = this.elements;
  outboundMessageFlows.forEach(flow => {
    flow.activate();
    flow.broker.subscribeTmp('event', '#', this.onMessageFlowEvent.bind(this), {
      consumerTag: '_process-message-consumer',
      noAck: true,
      priority: 200
    });
  });
  const onActivityEvent = this.onActivityEvent.bind(this);
  flows.forEach(flow => {
    flow.broker.subscribeTmp('event', '#', onActivityEvent, {
      consumerTag: '_process-flow-controller',
      noAck: true,
      priority: 200
    });
  });
  associations.forEach(association => {
    association.broker.subscribeTmp('event', '#', onActivityEvent, {
      consumerTag: '_process-association-controller',
      noAck: true,
      priority: 200
    });
  });
  startActivities.splice(0);
  triggeredByEvent.splice(0);
  children.forEach(activity => {
    if (activity.placeholder) return;
    activity.activate(this);
    activity.broker.subscribeTmp('event', '#', onActivityEvent, {
      noAck: true,
      consumerTag: '_process-activity-consumer',
      priority: 200
    });
    if (activity.isStart) startActivities.push(activity);
    if (activity.triggeredByEvent) triggeredByEvent.push(activity);
  });
  this[activatedSymbol] = true;
};

proto.deactivate = function deactivate() {
  const broker = this.broker;
  const executionId = this.executionId;
  broker.cancel(`_process-api-consumer-${executionId}`);
  broker.cancel(`_process-activity-${executionId}`);
  const {
    children,
    flows,
    associations,
    outboundMessageFlows
  } = this.elements;
  children.forEach(activity => {
    if (activity.placeholder) return;
    activity.broker.cancel('_process-activity-consumer');
    activity.deactivate();
  });
  flows.forEach(flow => {
    flow.broker.cancel('_process-flow-controller');
  });
  associations.forEach(association => {
    association.broker.cancel('_process-association-controller');
  });
  outboundMessageFlows.forEach(flow => {
    flow.deactivate();
    flow.broker.cancel('_process-message-consumer');
  });
  this[activatedSymbol] = false;
};

proto.onDelegateEvent = function onDelegateEvent(message) {
  const eventType = message.properties.type;
  let delegate = true;
  const content = message.content;

  if (content.message && content.message.id) {
    this.debug(`delegate ${eventType} event with id <${content.message.id}>`);
  } else {
    this.debug(`delegate ${eventType} anonymous event`);
  }

  this.elements.triggeredByEvent.forEach(activity => {
    if (activity.getStartActivities({
      referenceId: content.message && content.message.id,
      referenceType: eventType
    }).length) {
      delegate = false;
      activity.run(content.message);
    }
  });
  this.getApi().sendApiMessage(eventType, content, {
    delegate: true
  });
  return delegate;
};

proto.onMessageFlowEvent = function onMessageFlowEvent(routingKey, message) {
  this.broker.publish('message', routingKey, (0, _messageHelper.cloneContent)(message.content), message.properties);
};

proto.onActivityEvent = function onActivityEvent(routingKey, activityMessage) {
  const message = (0, _messageHelper.cloneMessage)(activityMessage);
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

  if (delegate) delegate = this.onDelegateEvent(message);
  this.broker.publish('event', routingKey, content, { ...message.properties,
    delegate,
    mandatory: false
  });
  if (shaking) return this.onShookEnd(message);
  if (!isDirectChild) return;
  if (content.isAssociation) return;

  switch (routingKey) {
    case 'process.terminate':
      return this.activityQ.queueMessage({
        routingKey: 'execution.terminate'
      }, (0, _messageHelper.cloneContent)(content), {
        type: 'terminate',
        persistent: true
      });

    case 'activity.stop':
      return;
  }

  this.activityQ.queueMessage(message.fields, (0, _messageHelper.cloneContent)(content), {
    persistent: true,
    ...message.properties
  });
};

proto.onChildMessage = function onChildMessage(routingKey, message) {
  if (message.fields.redelivered && message.properties.persistent === false) return message.ack();
  const content = message.content;

  switch (routingKey) {
    case 'execution.stop':
      message.ack();
      return this.stopExecution(message);

    case 'execution.terminate':
      message.ack();
      return this.terminate(message);

    case 'execution.discard':
      message.ack();
      return this.onDiscard(message);

    case 'activity.compensation.end':
    case 'flow.looped':
    case 'activity.leave':
      return this.onChildCompleted(message);
  }

  this.stateChangeMessage(message, true);

  switch (routingKey) {
    case 'activity.detach':
      {
        this.elements.detachedActivities.push((0, _messageHelper.cloneMessage)(message));
        break;
      }

    case 'activity.discard':
    case 'activity.compensation.start':
    case 'activity.enter':
      {
        this[statusSymbol] = 'executing';
        if (!content.inbound) break;

        for (const inbound of content.inbound) {
          if (!inbound.isSequenceFlow) continue;
          const inboundMessage = this.popPostponed(inbound);
          if (inboundMessage) inboundMessage.ack();
        }

        break;
      }

    case 'flow.error':
    case 'activity.error':
      {
        const eventCaughtBy = this.postponed.find(msg => {
          if (msg.fields.routingKey !== 'activity.catch') return;
          return msg.content.source && msg.content.source.executionId === content.executionId;
        });

        if (eventCaughtBy) {
          return this.debug('error was caught');
        }

        return this.complete('error', {
          error: content.error
        });
      }
  }
};

proto.stateChangeMessage = function stateChangeMessage(message, postponeMessage = true) {
  const previousMsg = this.popPostponed(message.content);
  if (previousMsg) previousMsg.ack();
  if (postponeMessage) this.postponed.push(message);
};

proto.popPostponed = function popPostponed(byContent) {
  const postponed = this.postponed;
  const postponedIdx = postponed.findIndex(msg => {
    if (msg.content.isSequenceFlow) return msg.content.sequenceId === byContent.sequenceId;
    return msg.content.executionId === byContent.executionId;
  });
  let postponedMsg;

  if (postponedIdx > -1) {
    postponedMsg = postponed.splice(postponedIdx, 1)[0];
  }

  const detached = this.elements.detachedActivities;
  const detachedIdx = detached.findIndex(msg => msg.content.executionId === byContent.executionId);
  if (detachedIdx > -1) detached.splice(detachedIdx, 1);
  return postponedMsg;
};

proto.onChildCompleted = function onChildCompleted(message) {
  this.stateChangeMessage(message, false);
  if (message.fields.redelivered) return message.ack();
  const {
    id,
    type,
    isEnd
  } = message.content;
  const postponedCount = this.postponedCount;

  if (!postponedCount) {
    this.debug(`left <${id}> (${type}), pending runs ${postponedCount}`);
    message.ack();
    return this.complete('completed');
  }

  this.debug(`left <${id}> (${type}), pending runs ${postponedCount}, ${this.postponed.map(a => a.content.id).join(',')}`);

  if (postponedCount === this.elements.detachedActivities.length) {
    return this.getPostponed().forEach(api => api.discard());
  }

  if (isEnd && this.elements.startActivities.length) {
    const startSequences = this.elements.startSequences;

    for (const p of this.postponed) {
      const postponedId = p.content.id;
      const startSequence = startSequences[postponedId];

      if (startSequence) {
        if (startSequence.content.sequence.some(({
          id: sid
        }) => sid === id)) {
          this.getApi(p).discard();
        }
      }
    }
  }
};

proto.stopExecution = function stopExecution(message) {
  if (this[stoppedSymbol]) return;
  const postponedCount = this.postponedCount;
  this.debug(`stop process execution (stop child executions ${postponedCount})`);

  if (postponedCount) {
    this.getPostponed().forEach(api => {
      api.stop();
    });
  }

  this.deactivate();
  this[stoppedSymbol] = true;
  return this.broker.publish(this.exchangeName, `execution.stopped.${this.executionId}`, { ...this[stateMessageSymbol].content,
    ...(message && message.content)
  }, {
    type: 'stopped',
    persistent: false
  });
};

proto.onDiscard = function onDiscard() {
  this.deactivate();
  const running = this.postponed.splice(0);
  this.debug(`discard process execution (discard child executions ${running.length})`);
  this.getSequenceFlows().forEach(flow => {
    flow.stop();
  });
  running.forEach(msg => {
    this.getApi(msg).discard();
  });
  this.activityQ.purge();
  return this.complete('discard');
};

proto.onApiMessage = function onApiMessage(routingKey, message) {
  const executionId = this.executionId;
  const broker = this.broker;

  if (message.properties.delegate) {
    const {
      correlationId
    } = message.properties || (0, _shared.getUniqueId)(executionId);
    this.debug(`delegate api ${routingKey} message to children, with correlationId <${correlationId}>`);
    let consumed = false;
    broker.subscribeTmp('event', 'activity.consumed', (_, msg) => {
      if (msg.properties.correlationId === correlationId) {
        consumed = true;
        this.debug(`delegated api message was consumed by ${msg.content ? msg.content.executionId : 'unknown'}`);
      }
    }, {
      consumerTag: `_ct-delegate-${correlationId}`,
      noAck: true
    });

    for (const child of this.elements.children) {
      if (child.placeholder) continue;
      child.broker.publish('api', routingKey, (0, _messageHelper.cloneContent)(message.content), message.properties);
      if (consumed) break;
    }

    return broker.cancel(`_ct-delegate-${correlationId}`);
  }

  if (this.id !== message.content.id) {
    const child = this.getActivityById(message.content.id);
    if (!child) return null;
    return child.broker.publish('api', routingKey, message.content, message.properties);
  }

  if (this.executionId !== message.content.executionId) return;

  switch (message.properties.type) {
    case 'discard':
      return this.discard(message);

    case 'stop':
      this.activityQ.queueMessage({
        routingKey: 'execution.stop'
      }, (0, _messageHelper.cloneContent)(message.content), {
        persistent: false
      });
      break;
  }
};

proto.getPostponed = function getPostponed(filterFn) {
  return this.postponed.slice().reduce((result, p) => {
    const api = this.getApi(p);

    if (api) {
      if (filterFn && !filterFn(api)) return result;
      result.push(api);
    }

    return result;
  }, []);
};

proto.complete = function complete(completionType, content = {}) {
  this.deactivate();
  this.debug(`process execution ${completionType}`);
  this[completedSymbol] = true;
  if (this.status !== 'terminated') this[statusSymbol] = completionType;
  const broker = this.broker;
  this.activityQ.delete();
  return broker.publish(this.exchangeName, `execution.${completionType}.${this.executionId}`, { ...this[stateMessageSymbol].content,
    output: { ...this.environment.output
    },
    ...content,
    state: completionType
  }, {
    type: completionType,
    mandatory: completionType === 'error'
  });
};

proto.discard = function discard() {
  this[statusSymbol] = 'discard';
  return this.activityQ.queueMessage({
    routingKey: 'execution.discard'
  }, {
    id: this.id,
    type: this.type,
    executionId: this.executionId
  }, {
    type: 'discard'
  });
};

proto.terminate = function terminate(message) {
  this[statusSymbol] = 'terminated';
  this.debug('terminating process execution');
  const running = this.postponed.splice(0);
  this.getSequenceFlows().forEach(flow => {
    flow.stop();
  });
  running.forEach(msg => {
    const {
      id: postponedId,
      isSequenceFlow
    } = msg.content;
    if (postponedId === message.content.id) return;
    if (isSequenceFlow) return;
    this.getApi(msg).stop();
    msg.ack();
  });
  this.activityQ.purge();
};

proto.getState = function getState() {
  const {
    flows,
    outboundMessageFlows,
    associations
  } = this.elements;
  return {
    executionId: this.executionId,
    stopped: this[stoppedSymbol],
    completed: this[completedSymbol],
    status: this.status,
    children: this.elements.children.reduce((result, activity) => {
      if (activity.placeholder) return result;
      result.push(activity.getState());
      return result;
    }, []),
    flows: flows.map(f => f.getState()),
    messageFlows: outboundMessageFlows.map(f => f.getState()),
    associations: associations.map(f => f.getState())
  };
};

proto.getActivities = function getActivities() {
  return this.elements.children.slice();
};

proto.getActivityById = function getActivityById(activityId) {
  return this.elements.children.find(child => child.id === activityId);
};

proto.getFlowById = function getFlowById(flowId) {
  return this.elements.flows.find(f => f.id === flowId);
};

proto.getAssociationById = function getAssociationById(associationId) {
  return this.elements.associations.find(a => a.id === associationId);
};

proto.getMessageFlowById = function getMessageFlowById(flowId) {
  return this.elements.outboundMessageFlows.find(f => f.id === flowId);
};

proto.getChildById = function getChildById(childId) {
  return this.getActivityById(childId) || this.getFlowById(childId);
};

proto.getSequenceFlows = function getSequenceFlows() {
  return this.elements.flows.slice();
};

proto.getApi = function getApi(message) {
  if (!message) return (0, _Api.ProcessApi)(this.broker, this[stateMessageSymbol]);
  const content = message.content;

  if (content.executionId !== this.executionId) {
    return this.getChildApi(message);
  }

  const api = (0, _Api.ProcessApi)(this.broker, message);
  const postponed = this.postponed;

  api.getExecuting = function getExecuting() {
    return postponed.reduce((result, msg) => {
      if (msg.content.executionId === content.executionId) return result;
      result.push(getApi(msg));
      return result;
    }, []);
  };

  return api;
};

proto.getChildApi = function getChildApi(message) {
  const content = message.content;
  let child = this.getChildById(content.id);
  if (child) return child.getApi(message);
  if (!content.parent) return;
  child = this.getChildById(content.parent.id);
  if (child) return child.getApi(message);
  if (!content.parent.path) return;

  for (let i = 0; i < content.parent.path.length; i++) {
    child = this.getChildById(content.parent.path[i].id, message);
    if (child) return child.getApi(message);
  }
};

proto.onShookEnd = function onShookEnd(message) {
  const routingKey = message.fields.routingKey;
  if (routingKey !== 'activity.shake.end') return;
  this.elements.startSequences[message.content.id] = (0, _messageHelper.cloneMessage)(message);
};

proto.debug = function debugMessage(logMessage, executionId) {
  executionId = executionId || this.executionId;
  this[parentSymbol].logger.debug(`<${executionId} (${this.id})> ${logMessage}`);
};