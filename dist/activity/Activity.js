"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _ActivityExecution = _interopRequireDefault(require("./ActivityExecution.js"));
var _shared = require("../shared.js");
var _Api = require("../Api.js");
var _EventBroker = require("../EventBroker.js");
var _MessageFormatter = require("../MessageFormatter.js");
var _messageHelper = require("../messageHelper.js");
var _Errors = require("../error/Errors.js");
var _outboundEvaluator = require("./outbound-evaluator.js");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const kActivityDef = Symbol.for('activityDefinition');
const kConsuming = Symbol.for('consuming');
const kConsumingRunQ = Symbol.for('run queue consumer');
const kCounters = Symbol.for('counters');
const kEventDefinitions = Symbol.for('eventDefinitions');
const kExec = Symbol.for('exec');
const kExecuteMessage = Symbol.for('executeMessage');
const kExtensions = Symbol.for('extensions');
const kFlags = Symbol.for('flags');
const kFlows = Symbol.for('flows');
const kFormatter = Symbol.for('formatter');
const kMessageHandlers = Symbol.for('messageHandlers');
const kStateMessage = Symbol.for('stateMessage');
const kActivated = Symbol.for('activated');
var _default = exports.default = Activity;
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
  this[kActivityDef] = activityDef;
  this.id = id;
  this.type = type;
  this.name = name;
  this.behaviour = {
    ...behaviour,
    eventDefinitions
  };
  this.Behaviour = Behaviour;
  this.parent = activityDef.parent ? (0, _messageHelper.cloneParent)(activityDef.parent) : {};
  this.logger = context.environment.Logger(type.toLowerCase());
  this.environment = context.environment;
  this.context = context;
  this[kCounters] = {
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
  const isParallelJoin = activityDef.isParallelGateway && inboundSequenceFlows.length > 1;
  const flows = this[kFlows] = {
    inboundSequenceFlows,
    inboundAssociations,
    inboundTriggers,
    outboundSequenceFlows,
    outboundEvaluator: new _outboundEvaluator.OutboundEvaluator(this, outboundSequenceFlows),
    ...(isParallelJoin && {
      inboundJoinFlows: new Set(),
      inboundSourceIds: new Set(inboundSequenceFlows.map(({
        sourceId
      }) => sourceId))
    })
  };
  this[kFlags] = {
    isEnd: flows.outboundSequenceFlows.length === 0,
    isStart: flows.inboundSequenceFlows.length === 0 && !attachedTo && !behaviour.triggeredByEvent && !isForCompensation,
    isSubProcess: activityDef.isSubProcess,
    isMultiInstance: !!behaviour.loopCharacteristics,
    isForCompensation,
    attachedTo,
    isTransaction: activityDef.isTransaction,
    isParallelJoin,
    isThrowing: activityDef.isThrowing,
    lane: activityDef.lane?.id
  };
  this[kExec] = new Map();
  this[kMessageHandlers] = {
    onInbound: isParallelJoin ? this._onJoinInbound.bind(this) : this._onInbound.bind(this),
    onRunMessage: this._onRunMessage.bind(this),
    onApiMessage: this._onApiMessage.bind(this),
    onExecutionMessage: this._onExecutionMessage.bind(this)
  };
  this[kEventDefinitions] = eventDefinitions?.map((ed, idx) => new ed.Behaviour(this, ed, context, idx));
  this[kExtensions] = context.loadExtensions(this);
  this[kConsuming] = false;
  this[kConsumingRunQ] = undefined;
}
Object.defineProperties(Activity.prototype, {
  counters: {
    get() {
      return {
        ...this[kCounters]
      };
    }
  },
  execution: {
    get() {
      return this[kExec].get('execution');
    }
  },
  executionId: {
    get() {
      return this[kExec].get('executionId');
    }
  },
  extensions: {
    get() {
      return this[kExtensions];
    }
  },
  bpmnIo: {
    get() {
      const extensions = this[kExtensions];
      return extensions?.extensions.find(e => e.type === 'bpmnio');
    }
  },
  formatter: {
    get() {
      let formatter = this[kFormatter];
      if (formatter) return formatter;
      formatter = this[kFormatter] = new _MessageFormatter.Formatter(this);
      return formatter;
    }
  },
  isRunning: {
    get() {
      if (!this[kConsuming]) return false;
      return !!this.status;
    }
  },
  outbound: {
    get() {
      return this[kFlows].outboundSequenceFlows;
    }
  },
  inbound: {
    get() {
      return this[kFlows].inboundSequenceFlows;
    }
  },
  isEnd: {
    get() {
      return this[kFlags].isEnd;
    }
  },
  isStart: {
    get() {
      return this[kFlags].isStart;
    }
  },
  isSubProcess: {
    get() {
      return this[kFlags].isSubProcess;
    }
  },
  isTransaction: {
    get() {
      return this[kFlags].isTransaction;
    }
  },
  isMultiInstance: {
    get() {
      return this[kFlags].isMultiInstance;
    }
  },
  isThrowing: {
    get() {
      return this[kFlags].isThrowing;
    }
  },
  isForCompensation: {
    get() {
      return this[kFlags].isForCompensation;
    }
  },
  triggeredByEvent: {
    get() {
      return this[kActivityDef].triggeredByEvent;
    }
  },
  attachedTo: {
    get() {
      const attachedToId = this[kFlags].attachedTo;
      if (!attachedToId) return null;
      return this.getActivityById(attachedToId);
    }
  },
  lane: {
    get() {
      const laneId = this[kFlags].lane;
      if (!laneId) return undefined;
      const parent = this.parentElement;
      return parent.getLaneById && parent.getLaneById(laneId);
    }
  },
  eventDefinitions: {
    get() {
      return this[kEventDefinitions];
    }
  },
  parentElement: {
    get() {
      return this.context.getActivityParentById(this.id);
    }
  }
});
Activity.prototype.activate = function activate() {
  if (this[kActivated]) return;
  this[kActivated] = true;
  this.addInboundListeners();
  return this._consumeInbound();
};
Activity.prototype.deactivate = function deactivate() {
  this[kActivated] = false;
  const broker = this.broker;
  this.removeInboundListeners();
  broker.cancel('_run-on-inbound');
  broker.cancel('_format-consumer');
};
Activity.prototype.init = function init(initContent) {
  const id = this.id;
  const exec = this[kExec];
  const executionId = exec.has('initExecutionId') ? exec.get('initExecutionId') : (0, _shared.getUniqueId)(id);
  exec.set('initExecutionId', executionId);
  this.logger.debug(`<${id}> initialized with executionId <${executionId}>`);
  this._publishEvent('init', this._createMessage({
    ...initContent,
    executionId
  }));
};
Activity.prototype.run = function run(runContent) {
  const id = this.id;
  if (this.isRunning) throw new Error(`activity <${id}> is already running`);
  const exec = this[kExec];
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
  this[kConsuming] = true;
  this._consumeRunQ();
};
Activity.prototype.getState = function getState() {
  const status = this.status;
  const exec = this[kExec];
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
Activity.prototype.recover = function recover(state) {
  if (this.isRunning) throw new Error(`cannot recover running activity <${this.id}>`);
  if (!state) return;
  this.stopped = state.stopped;
  this.status = state.status;
  const exec = this[kExec];
  exec.set('executionId', state.executionId);
  this[kCounters] = {
    ...this[kCounters],
    ...state.counters
  };
  if (state.execution) {
    exec.set('execution', new _ActivityExecution.default(this, this.context).recover(state.execution));
  }
  this.broker.recover(state.broker);
  return this;
};
Activity.prototype.resume = function resume() {
  if (this[kConsuming]) {
    throw new Error(`cannot resume running activity <${this.id}>`);
  }
  if (!this.status) return this.activate();
  this.stopped = false;
  this._consumeApi();
  const content = this._createMessage();
  this.broker.publish('run', 'run.resume', content, {
    persistent: false
  });
  this[kConsuming] = true;
  this._consumeRunQ();
};
Activity.prototype.discard = function discard(discardContent) {
  if (!this.status) return this._runDiscard(discardContent);
  const execution = this[kExec].get('execution');
  if (execution && !execution.completed) return execution.discard();
  this._deactivateRunConsumers();
  const broker = this.broker;
  broker.getQueue('run-q').purge();
  broker.publish('run', 'run.discard', (0, _messageHelper.cloneContent)(this[kStateMessage].content));
  this[kConsuming] = true;
  this._consumeRunQ();
};
Activity.prototype.addInboundListeners = function addInboundListeners() {
  const onInboundEvent = this._onInboundEvent.bind(this);
  const triggerConsumerTag = `_inbound-${this.id}`;
  for (const trigger of this[kFlows].inboundTriggers) {
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
};
Activity.prototype.removeInboundListeners = function removeInboundListeners() {
  const triggerConsumerTag = `_inbound-${this.id}`;
  for (const trigger of this[kFlows].inboundTriggers) {
    trigger.broker.cancel(triggerConsumerTag);
  }
};
Activity.prototype.stop = function stop() {
  if (!this[kConsuming]) return this.broker.cancel('_run-on-inbound');
  return this.getApi(this[kStateMessage]).stop();
};
Activity.prototype.next = function next() {
  if (!this.environment.settings.step) return;
  const stateMessage = this[kStateMessage];
  if (!stateMessage) return;
  if (this.status === 'executing') return false;
  if (this.status === 'formatting') return false;
  const current = stateMessage;
  stateMessage.ack();
  return current;
};
Activity.prototype.shake = function shake() {
  this._shakeOutbound({
    content: this._createMessage()
  });
};
Activity.prototype.evaluateOutbound = function evaluateOutbound(fromMessage, discardRestAtTake, callback) {
  return this[kFlows].outboundEvaluator.evaluate(fromMessage, discardRestAtTake, callback);
};
Activity.prototype.getApi = function getApi(message) {
  const execution = this[kExec].get('execution');
  if (execution && !execution.completed) return execution.getApi(message);
  return (0, _Api.ActivityApi)(this.broker, message || this[kStateMessage]);
};
Activity.prototype.getActivityById = function getActivityById(elementId) {
  return this.context.getActivityById(elementId);
};
Activity.prototype._runDiscard = function runDiscard(discardContent) {
  const exec = this[kExec];
  const executionId = exec.get('initExecutionId') || (0, _shared.getUniqueId)(this.id);
  exec.set('executionId', executionId);
  exec.delete('initExecutionId');
  this._consumeApi();
  const content = this._createMessage({
    ...discardContent,
    executionId
  });
  this.broker.publish('run', 'run.discard', content);
  this[kConsuming] = true;
  this._consumeRunQ();
};
Activity.prototype._discardRun = function discardRun() {
  const status = this.status;
  if (!status) return;
  const execution = this[kExec].get('execution');
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
  const stateMessage = this[kStateMessage];
  if (this.extensions) this.extensions.deactivate((0, _messageHelper.cloneMessage)(stateMessage));
  const broker = this.broker;
  broker.getQueue('run-q').purge();
  broker.publish('run', discardRoutingKey, (0, _messageHelper.cloneContent)(stateMessage.content), {
    correlationId: stateMessage.properties.correlationId
  });
  this[kConsuming] = true;
  this._consumeRunQ();
};
Activity.prototype._shakeOutbound = function shakeOutbound(sourceMessage) {
  const message = (0, _messageHelper.cloneMessage)(sourceMessage);
  message.content.sequence = message.content.sequence || [];
  message.content.sequence.push({
    id: this.id,
    type: this.type
  });
  const broker = this.broker;
  this.broker.publish('api', 'activity.shake.start', message.content, {
    persistent: false,
    type: 'shake'
  });
  if (this[kFlags].isEnd) {
    return broker.publish('event', 'activity.shake.end', message.content, {
      persistent: false,
      type: 'shake'
    });
  }
  for (const flow of this[kFlows].outboundSequenceFlows) flow.shake(message);
};
Activity.prototype._consumeInbound = function consumeInbound() {
  if (!this[kActivated]) return;
  if (this.status) return;
  const inboundQ = this.broker.getQueue('inbound-q');
  const onInbound = this[kMessageHandlers].onInbound;
  if (this[kFlags].isParallelJoin) {
    return inboundQ.consume(onInbound, {
      consumerTag: '_run-on-inbound',
      prefetch: 1000
    });
  }
  return inboundQ.consume(onInbound, {
    consumerTag: '_run-on-inbound'
  });
};
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
        return this._runDiscard({
          inbound,
          discardSequence
        });
      }
  }
};
Activity.prototype._onJoinInbound = function onJoinInbound(routingKey, message) {
  const {
    content
  } = message;
  const {
    inboundJoinFlows,
    inboundSourceIds
  } = this[kFlows];
  let alreadyTouched = false;
  const touched = new Set();
  let taken;
  for (const msg of inboundJoinFlows) {
    const sourceId = msg.content.sourceId;
    touched.add(sourceId);
    if (sourceId === content.sourceId) {
      alreadyTouched = true;
    }
  }
  inboundJoinFlows.add(message);
  if (alreadyTouched) return;
  const remaining = inboundSourceIds.size - touched.size - 1;
  if (remaining) {
    return this.logger.debug(`<${this.id}> inbound ${message.content.action} from <${message.content.id}>, ${remaining} remaining`);
  }
  const inbound = [];
  for (const im of inboundJoinFlows) {
    if (im.fields.routingKey === 'flow.take') taken = true;
    im.ack();
    inbound.push((0, _messageHelper.cloneContent)(im.content));
  }
  const discardSequence = new Set();
  if (!taken) {
    for (const im of inboundJoinFlows) {
      if (!im.content.discardSequence) continue;
      for (const sourceId of im.content.discardSequence) {
        discardSequence.add(sourceId);
      }
    }
  }
  inboundJoinFlows.clear();
  this.broker.cancel('_run-on-inbound');
  if (!taken) return this._runDiscard({
    inbound,
    discardSequence: [...discardSequence]
  });
  return this.run({
    inbound
  });
};
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
        if (content.id === this[kFlags].attachedTo) {
          inboundQ.queueMessage(fields, (0, _messageHelper.cloneContent)(content), properties);
        }
        break;
      }
    case 'flow.shake':
      {
        return this._shakeOutbound(message);
      }
    case 'association.take':
    case 'flow.take':
    case 'flow.discard':
      return inboundQ.queueMessage(fields, (0, _messageHelper.cloneContent)(content), properties);
  }
};
Activity.prototype._consumeRunQ = function consumeRunQ() {
  this[kConsumingRunQ] = true;
  this.broker.getQueue('run-q').assertConsumer(this[kMessageHandlers].onRunMessage, {
    exclusive: true,
    consumerTag: '_activity-run'
  });
};
Activity.prototype._pauseRunQ = function pauseRunQ() {
  if (!this[kConsumingRunQ]) return;
  this[kConsumingRunQ] = false;
  this.broker.cancel('_activity-run');
};
Activity.prototype._onRunMessage = function onRunMessage(routingKey, message, messageProperties) {
  switch (routingKey) {
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
Activity.prototype._continueRunMessage = function continueRunMessage(routingKey, message) {
  const isRedelivered = message.fields.redelivered;
  const content = (0, _messageHelper.cloneContent)(message.content);
  const correlationId = message.properties.correlationId;
  const id = this.id;
  const step = this.environment.settings.step;
  this[kStateMessage] = message;
  switch (routingKey) {
    case 'run.enter':
      {
        this.logger.debug(`<${id}> enter`, isRedelivered ? 'redelivered' : '');
        this.status = 'entered';
        if (!isRedelivered) {
          this[kExec].delete('execution');
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
        this[kExec].delete('execution');
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
        const execution = this[kExec].get('execution');
        if (!isRedelivered && execution) {
          if (execution.completed) return message.ack();
          this[kExecuteMessage] = message;
          return execution.passthrough(message);
        }
      }
    case 'run.execute':
      {
        this.status = 'executing';
        this[kExecuteMessage] = message;
        if (isRedelivered && this.extensions) this.extensions.activate((0, _messageHelper.cloneMessage)(message));
        const exec = this[kExec];
        let execution = exec.get('execution');
        if (!execution) {
          execution = new _ActivityExecution.default(this, this.context);
          exec.set('execution', execution);
        }
        this.broker.getQueue('execution-q').assertConsumer(this[kMessageHandlers].onExecutionMessage, {
          exclusive: true,
          consumerTag: '_activity-execution'
        });
        return execution.execute(message);
      }
    case 'run.end':
      {
        this.logger.debug(`<${id}> end`, isRedelivered ? 'redelivered' : '');
        if (isRedelivered) break;
        this[kCounters].taken++;
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
        this[kCounters].discarded++;
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
Activity.prototype._onExecutionMessage = function onExecutionMessage(routingKey, message) {
  const executeMessage = this[kExecuteMessage];
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
      this.status = 'discarded';
      broker.publish('run', 'run.discarded', content, {
        correlationId
      });
      break;
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
Activity.prototype._ackRunExecuteMessage = function ackRunExecuteMessage() {
  if (this.environment.settings.step) return;
  const executeMessage = this[kExecuteMessage];
  executeMessage.ack();
};
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
Activity.prototype._doOutbound = function doOutbound(fromMessage, isDiscarded, callback) {
  const outboundSequenceFlows = this[kFlows].outboundSequenceFlows;
  if (!outboundSequenceFlows.length) return callback(null, []);
  const fromContent = fromMessage.content;
  let discardSequence = fromContent.discardSequence;
  if (isDiscarded && !discardSequence && this[kFlags].attachedTo && fromContent.inbound?.[0]) {
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
Activity.prototype._publishRunOutbound = function publishRunOutbound(outboundFlow, content, discardSequence) {
  const {
    id: flowId,
    action,
    result
  } = outboundFlow;
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
Activity.prototype._onResumeMessage = function onResumeMessage(message) {
  message.ack();
  const stateMessage = this[kStateMessage];
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
Activity.prototype._publishEvent = function publishEvent(state, content, properties) {
  this.broker.publish('event', `activity.${state}`, (0, _messageHelper.cloneContent)(content, {
    state
  }), {
    ...properties,
    type: state,
    mandatory: state === 'error'
  });
};
Activity.prototype._onStop = function onStop(message) {
  const running = this[kConsuming];
  this.stopped = true;
  this[kConsuming] = false;
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
Activity.prototype._consumeApi = function consumeApi() {
  const executionId = this[kExec].get('executionId');
  if (!executionId) return;
  const broker = this.broker;
  broker.cancel('_activity-api');
  broker.subscribeTmp('api', `activity.*.${executionId}`, this[kMessageHandlers].onApiMessage, {
    noAck: true,
    consumerTag: '_activity-api',
    priority: 100
  });
};
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
  for (const [flag, value] of Object.entries(this[kFlags])) {
    if (value) result[flag] = value;
  }
  return result;
};
Activity.prototype._getOutboundSequenceFlowById = function getOutboundSequenceFlowById(flowId) {
  return this[kFlows].outboundSequenceFlows.find(flow => flow.id === flowId);
};
Activity.prototype._deactivateRunConsumers = function _deactivateRunConsumers() {
  const broker = this.broker;
  broker.cancel('_activity-api');
  this._pauseRunQ();
  broker.cancel('_activity-execution');
  this[kConsuming] = false;
};