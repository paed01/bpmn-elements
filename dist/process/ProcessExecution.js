"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ProcessExecution = ProcessExecution;
var _Api = require("../Api.js");
var _messageHelper = require("../messageHelper.js");
var _shared = require("../shared.js");
var _Tracker = require("../Tracker.js");
var _constants = require("../constants.js");
const K_ACTIVITY_Q = Symbol.for('activityQ');
const K_ELEMENTS = Symbol.for('elements');
const K_PARENT = Symbol.for('parent');
const K_TRACKER = Symbol.for('activity tracker');
const K_PEERS_DISCOVERED = Symbol.for('peers discovered');

/**
 * Drives the execution of a single process or sub-process: activates children, routes activity
 * events, and rolls completion up to the owning Process or sub-process Activity.
 * @param {import('#types').Process | import('#types').Activity} parentActivity
 * @param {import('#types').ContextInstance} context
 */
function ProcessExecution(parentActivity, context) {
  const {
    id,
    type,
    broker,
    isSubProcess,
    isTransaction
  } = parentActivity;
  this[K_PARENT] = parentActivity;
  this.id = id;
  this.type = type;
  this.isSubProcess = isSubProcess;
  this.isTransaction = isSubProcess && isTransaction;
  this.broker = broker;
  this.environment = context.environment;
  this.context = context;
  this[K_ELEMENTS] = {
    postponed: new Set(),
    children: context.getActivities(id),
    associations: context.getAssociations(id),
    flows: context.getSequenceFlows(id),
    outboundMessageFlows: context.getMessageFlows(id),
    startActivities: new Set(),
    triggeredByEvent: new Set(),
    detachedActivities: new Set(),
    convergingGateways: new Set(),
    startSequences: new Map()
  };
  const exchangeName = this._exchangeName = isSubProcess ? 'subprocess-execution' : 'execution';
  broker.assertExchange(exchangeName, 'topic', {
    autoDelete: false,
    durable: true
  });
  this[_constants.K_COMPLETED] = false;
  this[_constants.K_STOPPED] = false;
  this[_constants.K_ACTIVATED] = false;
  this[_constants.K_STATUS] = 'init';
  this[K_TRACKER] = new _Tracker.ActivityTracker(id);
  this.executionId = undefined;
  this[_constants.K_MESSAGE_HANDLERS] = {
    onActivityEvent: this._onActivityEvent.bind(this),
    onApiMessage: this._onApiMessage.bind(this),
    onChildMessage: this._onChildMessage.bind(this),
    onMessageFlowEvent: this._onMessageFlowEvent.bind(this)
  };
}
Object.defineProperties(ProcessExecution.prototype, {
  stopped: {
    get() {
      return this[_constants.K_STOPPED];
    }
  },
  completed: {
    get() {
      return this[_constants.K_COMPLETED];
    }
  },
  status: {
    get() {
      return this[_constants.K_STATUS];
    }
  },
  postponedCount: {
    get() {
      return this[K_ELEMENTS].postponed.size;
    }
  },
  isRunning: {
    get() {
      return this[_constants.K_ACTIVATED];
    }
  },
  activityStatus: {
    get() {
      return this[K_TRACKER].activityStatus;
    }
  }
});

/**
 * Activate children and start the process execution. Resumes if the message is redelivered.
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @throws {Error} when message or executionId is missing
 */
ProcessExecution.prototype.execute = function execute(executeMessage) {
  if (!executeMessage) throw new Error('Process execution requires message');
  if (!executeMessage.content || !executeMessage.content.executionId) throw new Error('Process execution requires execution id');
  const executionId = this.executionId = executeMessage.content.executionId;
  this[_constants.K_EXECUTE_MESSAGE] = (0, _messageHelper.cloneMessage)(executeMessage, {
    executionId,
    state: 'start'
  });
  this[_constants.K_STOPPED] = false;
  this.environment.assignVariables(executeMessage);
  this[K_ACTIVITY_Q] = this.broker.assertQueue(`execute-${executionId}-q`, {
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

/**
 * Resume after recover. Reshakes elements when there are converging gateways or multiple
 * start activities, then resumes any postponed children.
 */
ProcessExecution.prototype.resume = function resume() {
  this._debug(`resume process execution at ${this.status}`);
  if (this[_constants.K_COMPLETED]) return this._complete('completed');
  this._activate();
  const {
    postponed,
    detachedActivities
  } = this[K_ELEMENTS];
  this._shakeOnStart();
  postponed.clear();
  detachedActivities.clear();
  this[K_ACTIVITY_Q].consume(this[_constants.K_MESSAGE_HANDLERS].onChildMessage, {
    prefetch: 1000,
    consumerTag: `_process-activity-${this.executionId}`
  });
  if (this[_constants.K_COMPLETED]) return;
  const status = this.status;
  if (status === 'init') return this._start();
  const tracker = this[K_TRACKER];
  for (const msg of new Set(postponed)) {
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
  if (this[_constants.K_COMPLETED]) return;
  if (!postponed.size && status === 'executing') return this._complete('completed');
};

/**
 * Snapshot execution state including children, flows, message flows, and associations.
 * @returns {import('#types').ProcessExecutionState}
 */
ProcessExecution.prototype.getState = function getState() {
  const {
    children,
    flows,
    outboundMessageFlows,
    associations
  } = this[K_ELEMENTS];
  const flowStates = flows.reduce((result, flow) => {
    const elmState = flow.getState();
    if (elmState) result.push(elmState);
    return result;
  }, []);
  return {
    executionId: this.executionId,
    stopped: this[_constants.K_STOPPED],
    completed: this[_constants.K_COMPLETED],
    status: this.status,
    children: children.reduce((result, activity) => {
      if (activity.placeholder) return result;
      const elmState = activity.getState();
      if (elmState) result.push(elmState);
      return result;
    }, []),
    ...(flows.length && {
      flows: flowStates
    }),
    ...(outboundMessageFlows.length && {
      messageFlows: outboundMessageFlows.map(f => f.getState()).filter(Boolean)
    }),
    ...(associations.length && {
      associations: associations.map(f => f.getState()).filter(Boolean)
    })
  };
};

/**
 * Restore execution state captured by getState.
 * @param {import('#types').ProcessExecutionState} [state]
 * @returns {this}
 */
ProcessExecution.prototype.recover = function recover(state) {
  if (!state) return this;
  this.executionId = state.executionId;
  this[_constants.K_STOPPED] = state.stopped;
  this[_constants.K_COMPLETED] = state.completed;
  this[_constants.K_STATUS] = state.status;
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

/**
 * Walk activity graph from the given start id, or every start activity when omitted.
 * @param {string} [fromId]
 * @returns {import('#types').ShakeResult}
 */
ProcessExecution.prototype.shake = function shake(fromId) {
  return Object.fromEntries(this._shakeElements(fromId).sequences);
};

/**
 * Stop the running process execution via the api.
 */
ProcessExecution.prototype.stop = function stop() {
  this.getApi().stop();
};

/**
 * List currently postponed children as Api wrappers.
 * @param {import('#types').filterPostponed} [filterFn]
 */
ProcessExecution.prototype.getPostponed = function getPostponed(filterFn) {
  const result = [];
  for (const msg of this[K_ELEMENTS].postponed) {
    const api = this._getChildApi(msg);
    if (!api) continue;
    if (filterFn && !filterFn(api)) continue;
    result.push(api);
  }
  return result;
};

/**
 * Queue a discard message that propagates to all running children.
 */
ProcessExecution.prototype.discard = function discard() {
  this[_constants.K_STATUS] = 'discard';
  this[K_ACTIVITY_Q].queueMessage({
    routingKey: 'execution.discard'
  }, {
    id: this.id,
    type: this.type,
    executionId: this.executionId
  }, {
    type: 'discard'
  });
};

/**
 * Queue a cancel message that propagates to all running children.
 */
ProcessExecution.prototype.cancel = function discard() {
  this[K_ACTIVITY_Q].queueMessage({
    routingKey: 'execution.cancel'
  }, {
    id: this.id,
    type: this.type,
    executionId: this.executionId
  }, {
    type: 'cancel'
  });
};

/**
 * Get child activities in the process scope.
 * @returns {import('#types').Activity[]}
 */
ProcessExecution.prototype.getActivities = function getActivities() {
  return this[K_ELEMENTS].children.slice();
};

/**
 * @param {string} activityId
 * @returns {import('#types').Activity}
 */
ProcessExecution.prototype.getActivityById = function getActivityById(activityId) {
  return this[K_ELEMENTS].children.find(child => child.id === activityId);
};

/**
 * Get sequence flows in the process scope.
 * @returns {import('#types').SequenceFlow}
 */
ProcessExecution.prototype.getSequenceFlows = function getSequenceFlows() {
  return this[K_ELEMENTS].flows.slice();
};

/**
 * Get associations in the process scope.
 * @returns {import('../flows/Association.js').Association}
 */
ProcessExecution.prototype.getAssociations = function getAssociations() {
  return this[K_ELEMENTS].associations.slice();
};

/**
 * Resolve a process or child Api for the given message.
 * @param {import('#types').ElementBrokerMessage} [message]
 * @returns {import('#types').IApi<import('#types').Process>}
 */
ProcessExecution.prototype.getApi = function getApi(message) {
  if (!message) return (0, _Api.ProcessApi)(this.broker, this[_constants.K_EXECUTE_MESSAGE]);
  const content = message.content;
  if (content.executionId !== this.executionId) {
    return this._getChildApi(message);
  }
  const api = (0, _Api.ProcessApi)(this.broker, message);
  const postponed = this[K_ELEMENTS].postponed;
  const self = this;
  api.getExecuting = function getExecuting() {
    const result = [];
    for (const msg of postponed) {
      const childApi = self._getChildApi(msg);
      if (childApi) result.push(childApi);
    }
    return result;
  };
  return api;
};

/** @internal */
ProcessExecution.prototype._start = function start() {
  if (!this[K_ELEMENTS].children.length) {
    return this._complete('completed');
  }
  this[_constants.K_STATUS] = 'start';
  const executeContent = {
    ...this[_constants.K_EXECUTE_MESSAGE].content,
    state: this.status
  };
  this.broker.publish(this._exchangeName, 'execute.start', (0, _messageHelper.cloneContent)(executeContent));
  const {
    startActivities,
    postponed,
    detachedActivities
  } = this[K_ELEMENTS];
  this._shakeOnStart();
  for (const a of startActivities) a.init();
  this[_constants.K_STATUS] = 'executing';
  for (const a of startActivities) a.run();
  if (!startActivities.size) {
    for (const a of this[K_ELEMENTS].triggeredByEvent) {
      if (a.isCatching && !a.isRunning) a.run();
    }
  }
  postponed.clear();
  detachedActivities.clear();
  this[K_ACTIVITY_Q].assertConsumer(this[_constants.K_MESSAGE_HANDLERS].onChildMessage, {
    prefetch: 1000,
    consumerTag: `_process-activity-${this.executionId}`
  });
};

/** @internal */
ProcessExecution.prototype._activate = function activate() {
  const {
    onApiMessage,
    onMessageFlowEvent,
    onActivityEvent
  } = this[_constants.K_MESSAGE_HANDLERS];
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
    startSequences,
    triggeredByEvent,
    convergingGateways,
    children
  } = this[K_ELEMENTS];
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
  startActivities.clear();
  triggeredByEvent.clear();
  for (const activity of children) {
    if (activity.placeholder) continue;
    activity.activate(this);
    activity.broker.subscribeTmp('event', '#', onActivityEvent, {
      noAck: true,
      consumerTag: '_process-activity-consumer',
      priority: 200
    });
    if (activity.isStart) {
      startActivities.add(activity);
    }
    if (activity.triggeredByEvent || activity.isCatching) triggeredByEvent.add(activity);
    if (activity.isParallelGateway) convergingGateways.add(activity);
  }
  if (startActivities.size > 1) {
    for (const activity of startActivities) {
      startSequences.set(activity.id, new Set());
    }
  }
  this[_constants.K_ACTIVATED] = true;
};

/** @internal */
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
  } = this[K_ELEMENTS];
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
  this[_constants.K_ACTIVATED] = false;
};

/**
 * Shake on start/resume when there are converging gateways or multiple start activities.
 * Reuses already discovered parallel gateway peers to skip the graph shake on repeated runs.
 * @internal
 */
ProcessExecution.prototype._shakeOnStart = function shakeOnStart() {
  const {
    startActivities,
    convergingGateways
  } = this[K_ELEMENTS];
  if (startActivities.size <= 1 && this._peersDiscovered()) {
    this.environment.settings.skipDiscard = false;
    this._debug(`reuse discovered parallel gateway peers (${convergingGateways.size}), disabling skipDiscard`);
    return;
  }
  if (startActivities.size <= 1 && !convergingGateways.size) return;
  const skipDiscard = this.environment.settings.skipDiscard = this._shakeElements().settings.skipDiscard;
  this._debug(!skipDiscard ? `forced shake, disabling skipDiscard due to converging gateways (${convergingGateways.size})` : 'forced shake');
};

/**
 * Whether every converging parallel gateway has discovered its peers in this runtime instance.
 * Peers are a runtime cache and absent after recover, so a changed source is reshaken.
 * @internal
 */
ProcessExecution.prototype._peersDiscovered = function peersDiscovered() {
  const convergingGateways = this[K_ELEMENTS].convergingGateways;
  if (!convergingGateways.size) return false;
  for (const gateway of convergingGateways) {
    if (!gateway[K_PEERS_DISCOVERED]) return false;
  }
  return true;
};

/** @internal */
ProcessExecution.prototype._shakeElements = function shakeElements(fromId) {
  let executing = true;
  const id = this.id;
  if (!this.isRunning) {
    executing = false;
    this.executionId = (0, _shared.getUniqueId)(id);
    this._activate();
  }
  const toShake = fromId ? [this.getActivityById(fromId)].filter(Boolean) : this[K_ELEMENTS].startActivities;
  const result = {
    settings: {
      skipDiscard: this.environment.settings.skipDiscard
    },
    sequences: new Map()
  };
  const convergingGateways = new Map();
  const consumerTag = `_shaker-${this.executionId}`;
  this.broker.subscribeTmp('event', '*.shake.*', (routingKey, {
    content
  }) => {
    if (content.parent.id !== this.id) return;
    switch (routingKey) {
      case 'activity.shake.join':
        {
          const join = convergingGateways.get(content.join);
          if (!join) {
            convergingGateways.set(content.join, content);
          } else {
            join.sequence = join.sequence.concat(content.sequence);
          }
          break;
        }
      case 'flow.shake.loop':
      case 'activity.shake.linked':
      case 'activity.shake.end':
        {
          const {
            id: shakeId,
            parent: shakeParent
          } = content;
          if (shakeParent.id !== id) return;
          let seqnce;
          if (!(seqnce = result.sequences.get(shakeId))) {
            seqnce = [];
            result.sequences.set(shakeId, seqnce);
          }
          seqnce.push({
            ...content,
            isLooped: routingKey === 'flow.shake.loop'
          });
          break;
        }
    }
  }, {
    noAck: true,
    consumerTag
  });
  for (const a of toShake) a.shake();
  for (const [aid, c] of convergingGateways.entries()) {
    this._debug(`manual shake of converging gateway <${aid}>`);
    this.getActivityById(aid).broker.publish('api', 'activity.shake.continue', c, {
      type: 'shake'
    });
  }
  if (result.settings.skipDiscard) {
    for (const aid of convergingGateways.keys()) {
      if (this.getActivityById(aid).isParallelGateway) {
        result.settings.skipDiscard = false;
        break;
      }
    }
  }
  if (!executing) this._deactivate();
  this.broker.cancel(consumerTag);
  return result;
};

/** @internal */
ProcessExecution.prototype._onDelegateEvent = function onDelegateEvent(message) {
  const eventType = message.properties.type;
  let delegate = true;
  const content = message.content;
  if (content.message?.id) {
    this._debug(`delegate ${eventType} event with id <${content.message.id}>`);
  } else {
    this._debug(`delegate ${eventType} anonymous event`);
  }
  for (const activity of this[K_ELEMENTS].triggeredByEvent) {
    if (activity.isSubProcess && activity.getStartActivities({
      referenceId: content.message?.id,
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

/** @internal */
ProcessExecution.prototype._onMessageFlowEvent = function onMessageFlowEvent(routingKey, message) {
  this.broker.publish('message', routingKey, (0, _messageHelper.cloneContent)(message.content), message.properties);
};

/** @internal */
ProcessExecution.prototype._onActivityEvent = function onActivityEvent(routingKey, message) {
  const {
    fields,
    content,
    properties
  } = message;
  if (fields.redelivered && properties.persistent === false) return;
  const parent = content.parent = content.parent || {};
  let delegate = properties.delegate;
  const shaking = properties.type === 'shake';
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
  this[K_TRACKER].track(routingKey, message);
  this.broker.publish('event', routingKey, content, {
    ...properties,
    delegate,
    mandatory: false
  });
  if (shaking) return this._onShakeMessage(message);
  if (!isDirectChild) return;
  switch (routingKey) {
    case 'process.terminate':
      return this[K_ACTIVITY_Q].queueMessage({
        routingKey: 'execution.terminate'
      }, (0, _messageHelper.cloneContent)(content), {
        type: 'terminate',
        persistent: true
      });
    case 'activity.stop':
      return;
  }
  this[K_ACTIVITY_Q].queueMessage(message.fields, (0, _messageHelper.cloneContent)(content), {
    persistent: true,
    ...message.properties
  });
};

/** @internal */
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
        for (const detached of this[K_ELEMENTS].detachedActivities) {
          this._getChildApi(detached).discard();
        }
        return;
      }
    case 'execution.cancel':
      message.ack();
      return this._onCancel(message);
    case 'activity.error.caught':
      {
        let prevMsg;
        for (const msg of this[K_ELEMENTS].postponed) {
          if (msg.content.executionId === content.executionId) {
            prevMsg = msg;
            break;
          }
        }
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
        this[K_ELEMENTS].detachedActivities.add((0, _messageHelper.cloneMessage)(message));
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
        let eventCaughtBy;
        for (const msg of this[K_ELEMENTS].postponed) {
          if (msg.fields.routingKey === 'activity.catch' && msg.content.source?.executionId === content.executionId) {
            eventCaughtBy = msg;
            break;
          }
        }
        if (eventCaughtBy) {
          this[K_ACTIVITY_Q].queueMessage({
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

/** @internal */
ProcessExecution.prototype._stateChangeMessage = function stateChangeMessage(message, postponeMessage) {
  const previousMsg = this._popPostponed(message.content);
  if (previousMsg) previousMsg.ack();
  if (postponeMessage) this[K_ELEMENTS].postponed.add(message);
};

/** @internal */
ProcessExecution.prototype._popPostponed = function popPostponed(byContent) {
  const {
    postponed,
    detachedActivities
  } = this[K_ELEMENTS];
  let postponedMsg;
  if (byContent.sequenceId) {
    for (const msg of postponed) {
      if (!msg.content.isSequenceFlow && !msg.content.isAssociation) continue;
      if (msg.content.sequenceId === byContent.sequenceId) {
        postponedMsg = msg;
        break;
      }
    }
  } else {
    for (const msg of postponed) {
      if (msg.content.executionId === byContent.executionId) {
        postponedMsg = msg;
        break;
      }
    }
  }
  if (postponedMsg) postponed.delete(postponedMsg);
  for (const msg of detachedActivities) {
    if (msg.content.executionId === byContent.executionId) {
      detachedActivities.delete(msg);
      break;
    }
  }
  return postponedMsg;
};

/** @internal */
ProcessExecution.prototype._onChildCompleted = function onChildCompleted(message) {
  this._stateChangeMessage(message, false);
  if (message.fields.redelivered) return message.ack();
  const {
    id,
    type,
    isEnd,
    isParallelGateway
  } = message.content;
  if (isParallelGateway) {
    for (const inb of message.content.inbound) {
      this._popPostponed(inb)?.ack();
    }
  }
  const {
    postponed,
    detachedActivities,
    startActivities
  } = this[K_ELEMENTS];
  const postponedCount = postponed.size;
  if (!postponedCount) {
    this._debug(`left <${id}> (${type}), pending runs ${postponedCount}`);
    message.ack();
    return this._complete('completed');
  }
  message.ack();
  this._debug(`left <${id}> (${type}), pending activities ${postponedCount} ${[...postponed].map(m => m.content.id)}`);
  if (postponedCount && postponedCount === detachedActivities.size) {
    return this[K_ACTIVITY_Q].queueMessage({
      routingKey: 'execution.discard.detached'
    }, {
      id: this.id,
      type: this.type,
      executionId: this.executionId
    }, {
      type: 'cancel'
    });
  }
  if (isEnd && startActivities.size) {
    const startSequences = this[K_ELEMENTS].startSequences;
    for (const msg of postponed) {
      const postponedId = msg.content.id;
      const startSequence = startSequences.get(postponedId);
      if (!startSequence) continue;
      if (startSequence.has(id)) {
        this._getChildApi(msg).discard();
      }
    }
  }
};

/** @internal */
ProcessExecution.prototype._stopExecution = function stopExecution(message) {
  const postponedCount = this.postponedCount;
  this._debug(`stop process execution (stop child executions ${postponedCount})`);
  if (postponedCount) {
    for (const api of this.getPostponed()) api.stop();
  }
  this._deactivate();
  this[_constants.K_STOPPED] = true;
  return this.broker.publish(this._exchangeName, `execution.stopped.${this.executionId}`, {
    ...this[_constants.K_EXECUTE_MESSAGE].content,
    ...(message && message.content)
  }, {
    type: 'stopped',
    persistent: false
  });
};

/** @internal */
ProcessExecution.prototype._onDiscard = function onDiscard() {
  this._deactivate();
  const postponed = this[K_ELEMENTS].postponed;
  const running = new Set(postponed);
  postponed.clear();
  this._debug(`discard process execution (discard child executions ${running.size})`);
  if (this.isSubProcess) {
    this.stop();
  } else {
    for (const flow of this.getSequenceFlows()) flow.stop();
    for (const flow of this.getAssociations()) flow.stop();
    for (const msg of running) this._getChildApi(msg).discard();
  }
  this[K_ACTIVITY_Q].purge();
  return this._complete('discard');
};

/** @internal */
ProcessExecution.prototype._onCancel = function onCancel() {
  const postponed = this[K_ELEMENTS].postponed;
  const running = new Set(postponed);
  const isTransaction = this.isTransaction;
  if (isTransaction) {
    this._debug(`cancel transaction execution (cancel child executions ${running.size})`);
    this[_constants.K_STATUS] = 'cancel';
    this.broker.publish('event', 'transaction.cancel', (0, _messageHelper.cloneMessage)(this[_constants.K_EXECUTE_MESSAGE], {
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
    this._debug(`cancel process execution (cancel child executions ${running.size})`);
    for (const msg of running) {
      this._getChildApi(msg).discard();
    }
  }
};

/** @internal */
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
      this[K_ACTIVITY_Q].queueMessage({
        routingKey: 'execution.stop'
      }, (0, _messageHelper.cloneContent)(message.content), {
        persistent: false
      });
      break;
  }
};

/** @internal */
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
  for (const child of this[K_ELEMENTS].children) {
    if (child.placeholder) continue;
    child.broker.publish('api', routingKey, (0, _messageHelper.cloneContent)(message.content), message.properties);
    if (consumed && !continueOnConsumed) break;
  }
  return broker.cancel(`_ct-delegate-${correlationId}`);
};

/** @internal */
ProcessExecution.prototype._complete = function complete(completionType, content) {
  this._deactivate();
  this[_constants.K_COMPLETED] = true;
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
      this[_constants.K_STATUS] = completionType;
  }
  const broker = this.broker;
  this[K_ACTIVITY_Q].delete();
  broker.publish(this._exchangeName, `execution.${completionType}.${this.executionId}`, (0, _messageHelper.cloneContent)(this[_constants.K_EXECUTE_MESSAGE].content, {
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

/** @internal */
ProcessExecution.prototype._terminate = function terminate(message) {
  this[_constants.K_STATUS] = 'terminated';
  this._debug('terminating process execution');
  const postponed = this[K_ELEMENTS].postponed;
  const running = new Set(postponed);
  postponed.clear();
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
  this[K_ACTIVITY_Q].purge();
};

/** @internal */
ProcessExecution.prototype._getFlowById = function getFlowById(flowId) {
  return this[K_ELEMENTS].flows.find(f => f.id === flowId);
};

/** @internal */
ProcessExecution.prototype._getAssociationById = function getAssociationById(associationId) {
  return this[K_ELEMENTS].associations.find(a => a.id === associationId);
};

/** @internal */
ProcessExecution.prototype._getMessageFlowById = function getMessageFlowById(flowId) {
  return this[K_ELEMENTS].outboundMessageFlows.find(f => f.id === flowId);
};

/** @internal */
ProcessExecution.prototype._getChildById = function getChildById(childId) {
  return this.getActivityById(childId) || this._getFlowById(childId);
};

/** @internal */
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

/** @internal */
ProcessExecution.prototype._onShakeMessage = function onShakeMessage(message) {
  if (message.fields.routingKey !== 'activity.shake.end') return;
  let seq;
  if (!(seq = this[K_ELEMENTS].startSequences.get(message.content.id))) return;
  for (const s of message.content.sequence) {
    if (s.isSequenceFlow) continue;
    seq.add(s.id);
  }
};

/** @internal */
ProcessExecution.prototype._debug = function debugMessage(logMessage) {
  this[K_PARENT].logger.debug(`<${this.executionId} (${this.id})> ${logMessage}`);
};