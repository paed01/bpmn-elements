"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Activity = Activity;
var _ActivityExecution = require("./ActivityExecution.js");
var _shared = require("../shared.js");
var _Api = require("../Api.js");
var _EventBroker = require("../EventBroker.js");
var _MessageFormatter = require("../MessageFormatter.js");
var _messageHelper = require("../messageHelper.js");
var _Errors = require("../error/Errors.js");
var _outboundEvaluator = require("./outbound-evaluator.js");
var _constants = require("../constants.js");
const K_ACTIVITY_DEF = Symbol.for('activityDefinition');
const K_CONSUMING_RUN_Q = Symbol.for('run queue consumer');
const K_EVENT_DEFINITIONS = Symbol.for('eventDefinitions');
const K_EXEC = Symbol.for('exec');
const K_FLAGS = Symbol.for('flags');
const K_FLOWS = Symbol.for('flows');
const K_FORMATTER = Symbol.for('formatter');

/**
 * Activity wraps any element (task, event, gateway) and orchestrates its lifecycle through the broker.
 * @param {import('#types').IActivityBehaviour} Behaviour Element-specific behaviour constructor invoked per execution
 * @param {import('moddle-context-serializer').Activity} activityDef Parsed BPMN element definition
 * @param {import('#types').ContextInstance} context Per-execution registry and factory
 */
function Activity(Behaviour, activityDef, context) {
  const {
    id,
    type = 'activity',
    name,
    behaviour = {}
  } = activityDef;
  const {
    attachedTo: attachedToRef,
    eventDefinitions
  } = behaviour;
  this[K_ACTIVITY_DEF] = activityDef;
  this.id = id;
  this.type = type;
  this.name = name;
  /** @type {import('moddle-context-serializer').ActivityBehaviour} */
  this.behaviour = {
    ...behaviour,
    eventDefinitions
  };
  this.Behaviour = Behaviour;
  /** @type {import('moddle-context-serializer').Parent} */
  this.parent = activityDef.parent ? (0, _messageHelper.cloneParent)(activityDef.parent) : {};
  /** @type {import('#types').ILogger} */
  this.logger = context.environment.Logger(type.toLowerCase());
  this.environment = context.environment;
  this.context = context;
  /** @type {import('#types').ActivityStatus | undefined} */
  this.status = undefined;
  this[_constants.K_COUNTERS] = {
    taken: 0,
    discarded: 0
  };
  const isForCompensation = !!behaviour.isForCompensation;
  let attachedToActivity, attachedTo;
  if (attachedToRef) {
    attachedTo = attachedToRef.id;
    attachedToActivity = context.getActivityById(attachedToRef.id);
  }
  const {
    broker,
    on,
    once,
    waitFor,
    emitFatal
  } = (0, _EventBroker.ActivityBroker)(this);
  this.broker = broker;
  this.on = on;
  this.once = once;
  this.waitFor = waitFor;
  this.emitFatal = emitFatal;
  const inboundSequenceFlows = context.getInboundSequenceFlows(id);
  const inboundAssociations = context.getInboundAssociations(id);
  let inboundTriggers;
  if (attachedToActivity) {
    inboundTriggers = [attachedToActivity];
  } else if (isForCompensation) {
    inboundTriggers = inboundAssociations.slice();
  } else {
    inboundTriggers = inboundSequenceFlows.slice();
  }
  const outboundSequenceFlows = context.getOutboundSequenceFlows(id);
  const inboundSourceIds = new Set(inboundSequenceFlows.map(({
    sourceId
  }) => sourceId));
  const isParallelJoin = activityDef.isParallelGateway && inboundSourceIds.size > 1;
  this[K_FLOWS] = {
    inboundSequenceFlows,
    inboundAssociations,
    inboundTriggers,
    outboundSequenceFlows,
    outboundEvaluator: new _outboundEvaluator.OutboundEvaluator(this, outboundSequenceFlows)
  };
  this[K_FLAGS] = {
    isEnd: !outboundSequenceFlows.length,
    isStart: !inboundTriggers.length && !behaviour.triggeredByEvent && !activityDef.isCatching,
    isSubProcess: activityDef.isSubProcess,
    isMultiInstance: !!behaviour.loopCharacteristics,
    isForCompensation,
    attachedTo,
    isTransaction: activityDef.isTransaction,
    isParallelJoin,
    isParallelGateway: activityDef.isParallelGateway,
    isThrowing: activityDef.isThrowing,
    isCatching: activityDef.isCatching,
    lane: activityDef.lane?.id
  };
  this[K_EXEC] = new Map();
  this[_constants.K_MESSAGE_HANDLERS] = {
    onInbound: this._onInbound.bind(this),
    onRunMessage: this._onRunMessage.bind(this),
    onApiMessage: this._onApiMessage.bind(this),
    onExecutionMessage: this._onExecutionMessage.bind(this)
  };

  /** @type {import('#types').EventDefinition[] | undefined} */
  this[K_EVENT_DEFINITIONS] = eventDefinitions?.map((ed, idx) => new ed.Behaviour(this, ed, context, idx));
  this[_constants.K_EXTENSIONS] = context.loadExtensions(this);
  this[_constants.K_CONSUMING] = false;
  this[K_CONSUMING_RUN_Q] = undefined;
}
Object.defineProperties(Activity.prototype, {
  counters: {
    get() {
      return {
        ...this[_constants.K_COUNTERS]
      };
    }
  },
  execution: {
    get() {
      return this[K_EXEC].get('execution');
    }
  },
  executionId: {
    get() {
      return this[K_EXEC].get('executionId');
    }
  },
  extensions: {
    get() {
      return this[_constants.K_EXTENSIONS];
    }
  },
  bpmnIo: {
    get() {
      const extensions = this[_constants.K_EXTENSIONS];
      return extensions?.extensions.find(e => e.type === 'bpmnio');
    }
  },
  formatter: {
    get() {
      let formatter = this[K_FORMATTER];
      if (formatter) return formatter;
      formatter = this[K_FORMATTER] = new _MessageFormatter.Formatter(this);
      return formatter;
    }
  },
  isRunning: {
    get() {
      if (!this[_constants.K_CONSUMING]) return false;
      return !!this.status;
    }
  },
  outbound: {
    get() {
      return this[K_FLOWS].outboundSequenceFlows;
    }
  },
  inbound: {
    get() {
      return this[K_FLOWS].inboundSequenceFlows;
    }
  },
  isEnd: {
    get() {
      return this[K_FLAGS].isEnd;
    }
  },
  isStart: {
    get() {
      return this[K_FLAGS].isStart;
    }
  },
  isSubProcess: {
    get() {
      return this[K_FLAGS].isSubProcess;
    }
  },
  isTransaction: {
    get() {
      return this[K_FLAGS].isTransaction;
    }
  },
  isMultiInstance: {
    get() {
      return this[K_FLAGS].isMultiInstance;
    }
  },
  isThrowing: {
    get() {
      return this[K_FLAGS].isThrowing;
    }
  },
  isCatching: {
    get() {
      return this[K_FLAGS].isCatching;
    }
  },
  isForCompensation: {
    get() {
      return this[K_FLAGS].isForCompensation;
    }
  },
  isParallelJoin: {
    get() {
      return this[K_FLAGS].isParallelJoin;
    }
  },
  triggeredByEvent: {
    get() {
      return this[K_ACTIVITY_DEF].triggeredByEvent;
    }
  },
  attachedTo: {
    get() {
      const attachedToId = this[K_FLAGS].attachedTo;
      if (!attachedToId) return null;
      return this.getActivityById(attachedToId);
    }
  },
  lane: {
    get() {
      const laneId = this[K_FLAGS].lane;
      if (!laneId) return undefined;
      const parent = this.parentElement;
      return parent.getLaneById && parent.getLaneById(laneId);
    }
  },
  eventDefinitions: {
    get() {
      return this[K_EVENT_DEFINITIONS];
    }
  },
  parentElement: {
    get() {
      return this.context.getActivityParentById(this.id);
    }
  },
  initialized: {
    get() {
      return !!this[K_EXEC]?.get('initExecutionId');
    }
  }
});

/**
 * Subscribe to inbound flows and start consuming the inbound queue.
 * @returns {void}
 */
Activity.prototype.activate = function activate() {
  if (this[_constants.K_ACTIVATED]) return;
  this[_constants.K_ACTIVATED] = true;
  return this.addInboundListeners() && this._consumeInbound();
};

/**
 * Cancel inbound subscriptions and any pending run/format consumers.
 */
Activity.prototype.deactivate = function deactivate() {
  this[_constants.K_ACTIVATED] = false;
  const broker = this.broker;
  this.removeInboundListeners();
  broker.cancel('_run-on-inbound');
  broker.cancel('_format-consumer');
};

/**
 * Initialise activity executionId and emit init event without starting the run.
 * @param {Record<string, any>} [initContent] Optional content merged into the init message
 */
Activity.prototype.init = function init(initContent) {
  const id = this.id;
  const exec = this[K_EXEC];
  const executionId = exec.has('initExecutionId') ? exec.get('initExecutionId') : (0, _shared.getUniqueId)(id);
  exec.set('initExecutionId', executionId);
  this.logger.debug(`<${id}> initialized with executionId <${executionId}>`);
  this._publishEvent('init', this._createMessage({
    ...initContent,
    executionId
  }));
};

/**
 * Start running the activity by publishing run.enter and run.start.
 * @param {Record<string, any>} [runContent] Optional content merged into the run message
 * @throws {Error} if the activity is already running
 */
Activity.prototype.run = function run(runContent) {
  const id = this.id;
  if (this.isRunning) throw new Error(`activity <${id}> is already running`);
  const exec = this[K_EXEC];
  const executionId = exec.get('initExecutionId') || (0, _shared.getUniqueId)(id);
  exec.set('executionId', executionId);
  exec.delete('initExecutionId');
  this._consumeApi();
  const content = this._createMessage({
    ...runContent,
    executionId
  });
  const broker = this.broker;
  broker.publish('run', 'run.enter', content);
  broker.publish('run', 'run.start', (0, _messageHelper.cloneContent)(content));
  this[_constants.K_CONSUMING] = true;
  this._consumeRunQ();
};

/**
 * Snapshot activity state for recover.
 * Returns undefined when nothing is running and `disableTrackState` is set.
 * @returns {import('#types').ActivityState}
 */
Activity.prototype.getState = function getState() {
  const status = this.status;
  const exec = this[K_EXEC];
  const execution = exec.get('execution');
  const executionId = exec.get('executionId');
  const brokerState = this.broker.getState(true);
  if (!brokerState && this.environment.settings.disableTrackState) return;
  return {
    id: this.id,
    type: this.type,
    ...(status && {
      status
    }),
    executionId,
    stopped: this.stopped,
    counters: this.counters,
    broker: brokerState,
    ...(execution && {
      execution: execution.getState()
    })
  };
};

/**
 * Restore activity state captured by getState. Cannot be called while running.
 * @param {import('#types').ActivityState} [state]
 * @returns {this} this when state was applied
 * @throws {Error} when activity is currently running
 */
Activity.prototype.recover = function recover(state) {
  if (this.isRunning) throw new Error(`cannot recover running activity <${this.id}>`);
  if (!state) return this;
  this.stopped = state.stopped;
  this.status = state.status;
  const exec = this[K_EXEC];
  exec.set('executionId', state.executionId);
  this[_constants.K_COUNTERS] = {
    ...this[_constants.K_COUNTERS],
    ...state.counters
  };
  if (state.execution) {
    exec.set('execution', new _ActivityExecution.ActivityExecution(this, this.context).recover(state.execution));
  }
  this.broker.recover(state.broker);
  return this;
};

/**
 * Resume after recover. If no run has been started, falls back to activate.
 * @throws {Error} when called on a running activity
 */
Activity.prototype.resume = function resume() {
  if (this[_constants.K_CONSUMING]) {
    throw new Error(`cannot resume running activity <${this.id}>`);
  }
  if (!this.status) return this.activate();
  this.stopped = false;
  this._consumeApi();
  const content = this._createMessage();
  this.broker.publish('run', 'run.resume', content, {
    persistent: false
  });
  this[_constants.K_CONSUMING] = true;
  this._consumeRunQ();
};

/**
 * Discard the activity. Stops execution if running and discards outbound flows.
 * @param {Record<string, any>} [discardContent] Optional content propagated with the discard
 * @returns {void}
 */
Activity.prototype.discard = function discard(discardContent) {
  if (!this.status) return this._runDiscard(discardContent);
  const execution = this[K_EXEC].get('execution');
  if (execution && !execution.completed) return execution.discard();
  this._deactivateRunConsumers();
  const broker = this.broker;
  broker.getQueue('run-q').purge();
  broker.publish('run', 'run.discard', (0, _messageHelper.cloneContent)(this[_constants.K_STATE_MESSAGE].content));
  this[_constants.K_CONSUMING] = true;
  this._consumeRunQ();
};

/**
 * Subscribe to inbound triggers (sequence flows, attached activity, or compensation associations).
 * @returns {number} count of subscribed triggers
 */
Activity.prototype.addInboundListeners = function addInboundListeners() {
  const triggers = this[K_FLOWS].inboundTriggers;
  if (triggers.length) {
    const onInboundEvent = this._onInboundEvent.bind(this);
    const triggerConsumerTag = `_inbound-${this.id}`;
    for (const trigger of triggers) {
      if (trigger.isSequenceFlow) {
        trigger.broker.subscribeTmp('event', 'flow.#', onInboundEvent, {
          noAck: true,
          consumerTag: triggerConsumerTag
        });
      } else if (this.isForCompensation) {
        trigger.broker.subscribeTmp('event', 'association.#', onInboundEvent, {
          noAck: true,
          consumerTag: triggerConsumerTag
        });
      } else {
        trigger.broker.subscribeTmp('event', 'activity.#', onInboundEvent, {
          noAck: true,
          consumerTag: triggerConsumerTag
        });
      }
    }
  }
  return triggers.length;
};

/**
 * Cancel inbound trigger subscriptions added by addInboundListeners.
 */
Activity.prototype.removeInboundListeners = function removeInboundListeners() {
  const triggerConsumerTag = `_inbound-${this.id}`;
  for (const trigger of this[K_FLOWS].inboundTriggers) {
    trigger.broker.cancel(triggerConsumerTag);
  }
};

/**
 * Stop the activity. If not currently running, just cancels the inbound consumer.
 */
Activity.prototype.stop = function stop() {
  if (!this[_constants.K_CONSUMING]) return this.broker.cancel('_run-on-inbound');
  return this.getApi(this[_constants.K_STATE_MESSAGE]).stop();
};

/**
 * Advance one run-step when the environment runs in step mode. No-op otherwise.
 */
Activity.prototype.next = function next() {
  if (!this.environment.settings.step) return;
  /** @type {import('#types').ElementBrokerMessage} */
  const stateMessage = this[_constants.K_STATE_MESSAGE];
  if (!stateMessage) return;
  if (this.status === 'executing') return false;
  if (this.status === 'formatting') return false;
  const current = stateMessage;
  stateMessage.ack();
  return current;
};

/**
 * Walk outbound flows to discover the activity graph from this point.
 */
Activity.prototype.shake = function shake() {
  this._shakeOutbound({
    content: this._createMessage()
  });
};

/**
 * Evaluate outbound sequence flows for the given source message.
 * @param {import('#types').ElementBrokerMessage} fromMessage Source run message
 * @param {boolean} discardRestAtTake When true, take only the first matching flow and discard the rest
 * @param {(err: Error, evaluationResult: any) => void} callback
 * @returns {void}
 */
Activity.prototype.evaluateOutbound = function evaluateOutbound(fromMessage, discardRestAtTake, callback) {
  return this[K_FLOWS].outboundEvaluator.evaluate(fromMessage, discardRestAtTake, callback);
};

/**
 * Resolve an Api wrapper for the activity, preferring the running execution if any.
 * @param {import('#types').ElementBrokerMessage} [message]
 * @returns {import('#types').IApi<import('./Activity.js').Activity>}
 */
Activity.prototype.getApi = function getApi(message) {
  const execution = this[K_EXEC].get('execution');
  if (execution && !execution.completed) return execution.getApi(message);
  return (0, _Api.ActivityApi)(this.broker, message || this[_constants.K_STATE_MESSAGE]);
};

/**
 * Look up another activity in the same context.
 * @param {string} elementId
 */
Activity.prototype.getActivityById = function getActivityById(elementId) {
  return this.context.getActivityById(elementId);
};

/** @internal */
Activity.prototype._runDiscard = function runDiscard(discardContent) {
  const exec = this[K_EXEC];
  const executionId = exec.get('initExecutionId') || (0, _shared.getUniqueId)(this.id);
  exec.set('executionId', executionId);
  exec.delete('initExecutionId');
  this._consumeApi();
  const content = this._createMessage({
    ...discardContent,
    executionId
  });
  this.broker.publish('run', 'run.discard', content);
  this[_constants.K_CONSUMING] = true;
  this._consumeRunQ();
};

/** @internal */
Activity.prototype._discardRun = function discardRun() {
  const status = this.status;
  if (!status) return;
  const execution = this[K_EXEC].get('execution');
  if (execution && !execution.completed) return;
  let discardRoutingKey = 'run.discard';
  switch (status) {
    case 'executed':
      {
        discardRoutingKey = 'run.discarded';
        break;
      }
    case 'end':
    case 'executing':
    case 'error':
    case 'discarded':
      return;
  }
  this._deactivateRunConsumers();
  const stateMessage = this[_constants.K_STATE_MESSAGE];
  if (this.extensions) this.extensions.deactivate((0, _messageHelper.cloneMessage)(stateMessage));
  const broker = this.broker;
  broker.getQueue('run-q').purge();
  broker.publish('run', discardRoutingKey, (0, _messageHelper.cloneContent)(stateMessage.content), {
    correlationId: stateMessage.properties.correlationId
  });
  this[_constants.K_CONSUMING] = true;
  this._consumeRunQ();
};

/** @internal */
Activity.prototype._onShakeMessage = function _onShakeMessage(sourceMessage) {
  if (this[K_FLAGS].isParallelGateway) {
    const message = (0, _messageHelper.cloneMessage)(sourceMessage, {
      join: this.id
    });
    message.content.sequence.push({
      id: this.id,
      type: this.type
    });
    return this.broker.publish('event', 'activity.shake.join', message.content, {
      persistent: false,
      type: 'shake'
    });
  }
  this._shakeOutbound(sourceMessage);
};

/** @internal */
Activity.prototype._shakeOutbound = function shakeOutbound(sourceMessage) {
  const message = (0, _messageHelper.cloneMessage)(sourceMessage);
  const sequence = message.content.sequence = message.content.sequence || [];
  const count = 1;
  const looped = sequence?.find(f => f.id === this.id);
  sequence.push({
    id: this.id,
    type: this.type,
    count: looped ? looped.count + 1 : count
  });
  this.broker.publish('api', 'activity.shake.start', message.content, {
    persistent: false,
    type: 'shake'
  });
  if (this[K_FLAGS].isEnd) {
    return this.broker.publish('event', 'activity.shake.end', (0, _messageHelper.cloneContent)(message.content), {
      persistent: false,
      type: 'shake'
    });
  }
  const targets = new Map();
  for (const outboundFlow of this[K_FLOWS].outboundSequenceFlows) {
    const prevTarget = targets.get(outboundFlow.targetId);
    if (!prevTarget) {
      targets.set(outboundFlow.targetId, outboundFlow);
    }
  }
  for (const t of targets.values()) t.shake(message);
};

/** @internal */
Activity.prototype._consumeInbound = function consumeInbound() {
  if (!this[_constants.K_ACTIVATED]) return;
  if (this.status || !this[K_FLOWS].inboundTriggers.length) return;
  const inboundQ = this.broker.getQueue('inbound-q');
  const onInbound = this[_constants.K_MESSAGE_HANDLERS].onInbound;
  return inboundQ.assertConsumer(onInbound, {
    consumerTag: '_run-on-inbound'
  });
};

/** @internal */
Activity.prototype._onInbound = function onInbound(routingKey, message) {
  message.ack();
  const broker = this.broker;
  broker.cancel('_run-on-inbound');
  const content = message.content;
  const inbound = [(0, _messageHelper.cloneContent)(content)];
  switch (routingKey) {
    case 'association.take':
    case 'flow.take':
    case 'activity.restart':
    case 'activity.enter':
      return this.run({
        message: content.message,
        inbound
      });
    case 'flow.discard':
    case 'activity.discard':
      {
        let discardSequence;
        if (content.discardSequence) discardSequence = content.discardSequence.slice();
        const context = {
          inbound,
          discardSequence
        };
        return this[K_FLAGS].isParallelGateway ? this.run(context) : this._runDiscard(context);
      }
  }
};

/** @internal */
Activity.prototype._onInboundEvent = function onInboundEvent(routingKey, message) {
  const {
    fields,
    content,
    properties
  } = message;
  const inboundQ = this.broker.getQueue('inbound-q');
  switch (routingKey) {
    case 'activity.enter':
    case 'activity.discard':
      {
        if (content.id === this[K_FLAGS].attachedTo) {
          inboundQ.queueMessage(fields, (0, _messageHelper.cloneContent)(content), properties);
        }
        break;
      }
    case 'flow.shake':
    case 'activity.shake.start':
      return this._onShakeMessage(message);
    case 'association.take':
    case 'flow.take':
    case 'flow.discard':
      return inboundQ.queueMessage(fields, (0, _messageHelper.cloneContent)(content), properties);
  }
};

/** @internal */
Activity.prototype._consumeRunQ = function consumeRunQ() {
  this[K_CONSUMING_RUN_Q] = true;
  this.broker.getQueue('run-q').assertConsumer(this[_constants.K_MESSAGE_HANDLERS].onRunMessage, {
    exclusive: true,
    consumerTag: '_activity-run'
  });
};

/** @internal */
Activity.prototype._pauseRunQ = function pauseRunQ() {
  if (!this[K_CONSUMING_RUN_Q]) return;
  this[K_CONSUMING_RUN_Q] = false;
  this.broker.cancel('_activity-run');
};

/** @internal */
Activity.prototype._onRunMessage = function onRunMessage(routingKey, message, messageProperties) {
  switch (routingKey) {
    case 'run.execute.passthrough':
    case 'run.outbound.discard':
    case 'run.outbound.take':
    case 'run.next':
      return this._continueRunMessage(routingKey, message, messageProperties);
    case 'run.resume':
      {
        return this._onResumeMessage(message);
      }
  }
  const preStatus = this.status;
  this.status = 'formatting';
  return this.formatter.format(message, (err, formattedContent, formatted) => {
    this.status = preStatus;
    if (err) {
      return this.emitFatal(err, message.content);
    }
    if (formatted) message.content = formattedContent;
    this._continueRunMessage(routingKey, message, messageProperties);
  });
};

/** @internal */
Activity.prototype._continueRunMessage = function continueRunMessage(routingKey, message) {
  const isRedelivered = message.fields.redelivered;
  const content = (0, _messageHelper.cloneContent)(message.content);
  const correlationId = message.properties.correlationId;
  const id = this.id;
  const step = this.environment.settings.step;
  this[_constants.K_STATE_MESSAGE] = message;
  switch (routingKey) {
    case 'run.enter':
      {
        this.logger.debug(`<${id}> enter`, isRedelivered ? 'redelivered' : '');
        this.status = 'entered';
        if (!isRedelivered) {
          this[K_EXEC].delete('execution');
          if (this.extensions) this.extensions.activate((0, _messageHelper.cloneMessage)(message));
          this._publishEvent('enter', content, {
            correlationId
          });
        }
        break;
      }
    case 'run.discard':
      {
        this.logger.debug(`<${id}> discard`, isRedelivered ? 'redelivered' : '');
        this.status = 'discard';
        this[K_EXEC].delete('execution');
        if (this.extensions) this.extensions.activate((0, _messageHelper.cloneMessage)(message));
        if (!isRedelivered) {
          this.broker.publish('run', 'run.discarded', content, {
            correlationId
          });
          this._publishEvent('discard', content);
        }
        break;
      }
    case 'run.start':
      {
        this.logger.debug(`<${id}> start`, isRedelivered ? 'redelivered' : '');
        this.status = 'started';
        if (!isRedelivered) {
          this.broker.publish('run', 'run.execute', content, {
            correlationId
          });
          this._publishEvent('start', content, {
            correlationId
          });
        }
        break;
      }
    case 'run.execute.passthrough':
      {
        const execution = this[K_EXEC].get('execution');
        if (!isRedelivered && execution) {
          if (execution.completed) return message.ack();
          this[_constants.K_EXECUTE_MESSAGE] = message;
          return execution.passthrough(message);
        }
      }
    case 'run.execute':
      {
        this.status = 'executing';
        this[_constants.K_EXECUTE_MESSAGE] = message;
        if (isRedelivered && this.extensions) this.extensions.activate((0, _messageHelper.cloneMessage)(message));
        const exec = this[K_EXEC];
        let execution = exec.get('execution');
        if (!execution) {
          execution = new _ActivityExecution.ActivityExecution(this, this.context);
          exec.set('execution', execution);
        }
        this.broker.getQueue('execution-q').assertConsumer(this[_constants.K_MESSAGE_HANDLERS].onExecutionMessage, {
          exclusive: true,
          consumerTag: '_activity-execution'
        });
        return execution.execute(message);
      }
    case 'run.end':
      {
        this.logger.debug(`<${id}> end`, isRedelivered ? 'redelivered' : '');
        if (isRedelivered) break;
        this[_constants.K_COUNTERS].taken++;
        this.status = 'end';
        return this._doRunLeave(message, false, () => {
          this._publishEvent('end', content, {
            correlationId
          });
          if (!step) message.ack();
        });
      }
    case 'run.error':
      {
        this._publishEvent('error', {
          ...content,
          error: isRedelivered ? (0, _Errors.makeErrorFromMessage)(message) : content.error
        }, {
          correlationId
        });
        break;
      }
    case 'run.discarded':
      {
        this.logger.debug(`<${content.executionId} (${id})> discarded`);
        this[_constants.K_COUNTERS].discarded++;
        this.status = 'discarded';
        content.outbound = undefined;
        if (!isRedelivered) {
          return this._doRunLeave(message, true, () => {
            if (!step) message.ack();
          });
        }
        break;
      }
    case 'run.outbound.take':
      {
        const flow = this._getOutboundSequenceFlowById(content.flow.id);
        message.ack();
        return flow.take(content.flow);
      }
    case 'run.outbound.discard':
      {
        const flow = this._getOutboundSequenceFlowById(content.flow.id);
        message.ack();
        return flow.discard(content.flow);
      }
    case 'run.leave':
      {
        this.status = undefined;
        if (this.extensions) this.extensions.deactivate((0, _messageHelper.cloneMessage)(message));
        if (!isRedelivered) {
          this.broker.publish('run', 'run.next', content, {
            persistent: false
          });
          this._publishEvent('leave', content, {
            correlationId
          });
        }
        break;
      }
    case 'run.next':
      message.ack();
      this._pauseRunQ();
      return this._consumeInbound();
  }
  if (!step) message.ack();
};

/** @internal */
Activity.prototype._onExecutionMessage = function onExecutionMessage(routingKey, message) {
  const executeMessage = this[_constants.K_EXECUTE_MESSAGE];
  const content = (0, _messageHelper.cloneContent)({
    ...executeMessage.content,
    ...message.content,
    executionId: executeMessage.content.executionId,
    parent: {
      ...this.parent
    }
  });
  const {
    correlationId
  } = message.properties;
  this._publishEvent(routingKey, content, message.properties);
  const broker = this.broker;
  switch (routingKey) {
    case 'execution.outbound.take':
      {
        return this._doOutbound(message, false, (err, outbound) => {
          message.ack();
          if (err) return this.emitFatal(err, content);
          broker.publish('run', 'run.execute.passthrough', (0, _messageHelper.cloneContent)(content, {
            outbound
          }));
          return this._ackRunExecuteMessage();
        });
      }
    case 'execution.error':
      {
        this.status = 'error';
        broker.publish('run', 'run.error', content, {
          correlationId
        });
        broker.publish('run', 'run.discarded', content, {
          correlationId
        });
        break;
      }
    case 'execution.cancel':
    case 'execution.discard':
      {
        this.status = 'discarded';
        broker.publish('run', 'run.discarded', content, {
          correlationId
        });
        break;
      }
    default:
      {
        this.status = 'executed';
        broker.publish('run', 'run.end', content, {
          correlationId
        });
      }
  }
  message.ack();
  this._ackRunExecuteMessage();
};

/** @internal */
Activity.prototype._ackRunExecuteMessage = function ackRunExecuteMessage() {
  if (this.environment.settings.step) return;
  const executeMessage = this[_constants.K_EXECUTE_MESSAGE];
  executeMessage.ack();
};

/** @internal */
Activity.prototype._doRunLeave = function doRunLeave(message, isDiscarded, onOutbound) {
  const {
    content,
    properties
  } = message;
  const correlationId = properties.correlationId;
  if (content.ignoreOutbound) {
    this.broker.publish('run', 'run.leave', (0, _messageHelper.cloneContent)(content), {
      correlationId
    });
    return onOutbound();
  }
  return this._doOutbound((0, _messageHelper.cloneMessage)(message), isDiscarded, (err, outbound) => {
    if (err) {
      return this._publishEvent('error', {
        ...content,
        error: err
      }, {
        correlationId
      });
    }
    this.broker.publish('run', 'run.leave', (0, _messageHelper.cloneContent)(content, {
      ...(outbound.length && {
        outbound
      })
    }), {
      correlationId
    });
    onOutbound();
  });
};

/** @internal */
Activity.prototype._doOutbound = function doOutbound(fromMessage, isDiscarded, callback) {
  const outboundSequenceFlows = this[K_FLOWS].outboundSequenceFlows;
  if (!outboundSequenceFlows.length) return callback(null, []);
  const fromContent = fromMessage.content;
  let discardSequence = fromContent.discardSequence;
  if (isDiscarded && !discardSequence && this[K_FLAGS].attachedTo && fromContent.inbound?.[0]) {
    discardSequence = [fromContent.inbound[0].id];
  }
  let outboundFlows;
  if (isDiscarded) {
    outboundFlows = outboundSequenceFlows.map(flow => (0, _outboundEvaluator.formatFlowAction)(flow, {
      action: 'discard'
    }));
  } else if (fromContent.outbound?.length) {
    outboundFlows = outboundSequenceFlows.map(flow => (0, _outboundEvaluator.formatFlowAction)(flow, fromContent.outbound.filter(f => f.id === flow.id).pop()));
  }
  if (outboundFlows) {
    this._doRunOutbound(outboundFlows, fromContent, discardSequence);
    return callback(null, outboundFlows);
  }
  return this.evaluateOutbound(fromMessage, fromContent.outboundTakeOne, (err, evaluatedOutbound) => {
    if (err) return callback(new _Errors.ActivityError(err.message, fromMessage, err));
    const outbound = this._doRunOutbound(evaluatedOutbound, fromContent, discardSequence);
    return callback(null, outbound);
  });
};

/** @internal */
Activity.prototype._doRunOutbound = function doRunOutbound(outboundList, content, discardSequence) {
  if (outboundList.length === 1) {
    this._publishRunOutbound(outboundList[0], content, discardSequence);
  } else {
    const targets = new Map();
    for (const outboundFlow of outboundList) {
      const prevTarget = targets.get(outboundFlow.targetId);
      if (!prevTarget) {
        targets.set(outboundFlow.targetId, outboundFlow);
      } else if (outboundFlow.action === 'take' && outboundFlow.action !== prevTarget.action) {
        targets.set(outboundFlow.targetId, outboundFlow);
      }
    }
    for (const outboundFlow of targets.values()) {
      this._publishRunOutbound(outboundFlow, content, discardSequence);
    }
  }
  return outboundList;
};

/** @internal */
Activity.prototype._publishRunOutbound = function publishRunOutbound(outboundFlow, content, discardSequence) {
  const {
    id: flowId,
    action,
    result
  } = outboundFlow;
  if (action === 'discard' && this.environment.settings.skipDiscard) {
    return;
  }
  this.broker.publish('run', 'run.outbound.' + action, (0, _messageHelper.cloneContent)(content, {
    flow: {
      ...(result && typeof result === 'object' && result),
      ...outboundFlow,
      sequenceId: (0, _shared.getUniqueId)(`${flowId}_${action}`),
      ...(discardSequence && {
        discardSequence: discardSequence.slice()
      })
    }
  }));
};

/** @internal */
Activity.prototype._onResumeMessage = function onResumeMessage(message) {
  message.ack();
  const stateMessage = this[_constants.K_STATE_MESSAGE];
  const fields = stateMessage.fields;
  if (!fields.redelivered) return;
  switch (fields.routingKey) {
    case 'run.enter':
    case 'run.start':
    case 'run.discarded':
    case 'run.end':
    case 'run.leave':
      break;
    default:
      return;
  }
  if (this.extensions) this.extensions.activate((0, _messageHelper.cloneMessage)(stateMessage));
  this.logger.debug(`<${this.id}> resume from ${message.content.status}`);
  return this.broker.publish('run', fields.routingKey, (0, _messageHelper.cloneContent)(stateMessage.content), stateMessage.properties);
};

/** @internal */
Activity.prototype._publishEvent = function publishEvent(state, content, properties) {
  this.broker.publish('event', `activity.${state}`, (0, _messageHelper.cloneContent)(content, {
    state
  }), {
    ...properties,
    type: state,
    mandatory: state === 'error'
  });
};

/** @internal */
Activity.prototype._onStop = function onStop(message) {
  const running = this[_constants.K_CONSUMING];
  this.stopped = true;
  this[_constants.K_CONSUMING] = false;
  const broker = this.broker;
  this._pauseRunQ();
  broker.cancel('_activity-api');
  broker.cancel('_activity-execution');
  broker.cancel('_run-on-inbound');
  broker.cancel('_format-consumer');
  if (this.extensions) this.extensions.deactivate((0, _messageHelper.cloneMessage)(message));
  if (running) {
    this._publishEvent('stop', this._createMessage(), {
      persistent: false
    });
  }
};

/** @internal */
Activity.prototype._consumeApi = function consumeApi() {
  const executionId = this[K_EXEC].get('executionId');
  if (!executionId) return;
  const broker = this.broker;
  broker.cancel('_activity-api');
  broker.subscribeTmp('api', `activity.*.${executionId}`, this[_constants.K_MESSAGE_HANDLERS].onApiMessage, {
    noAck: true,
    consumerTag: '_activity-api',
    priority: 100
  });
};

/** @internal */
Activity.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  switch (message.properties.type) {
    case 'discard':
      {
        return this._discardRun(message);
      }
    case 'stop':
      {
        return this._onStop(message);
      }
    case 'shake':
      {
        return this._shakeOutbound(message);
      }
  }
};

/** @internal */
Activity.prototype._createMessage = function createMessage(override) {
  const {
    name,
    status,
    parent
  } = this;
  const result = {
    ...override,
    id: this.id,
    type: this.type,
    ...(name && {
      name
    }),
    ...(status && {
      status
    }),
    ...(parent && {
      parent: (0, _messageHelper.cloneParent)(parent)
    })
  };
  for (const [flag, value] of Object.entries(this[K_FLAGS])) {
    if (value) result[flag] = value;
  }
  return result;
};

/** @internal */
Activity.prototype._getOutboundSequenceFlowById = function getOutboundSequenceFlowById(flowId) {
  return this[K_FLOWS].outboundSequenceFlows.find(flow => flow.id === flowId);
};

/** @internal */
Activity.prototype._deactivateRunConsumers = function _deactivateRunConsumers() {
  const broker = this.broker;
  broker.cancel('_activity-api');
  this._pauseRunQ();
  broker.cancel('_activity-execution');
  this[_constants.K_CONSUMING] = false;
};