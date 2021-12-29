import ActivityExecution from './ActivityExecution';
import BpmnIO from '../io/BpmnIO';
import {brokerSafeId, getUniqueId} from '../shared';
import {ActivityApi} from '../Api';
import {ActivityBroker} from '../EventBroker';
import {Formatter} from '../MessageFormatter';
import {cloneContent, cloneParent, cloneMessage} from '../messageHelper';
import {makeErrorFromMessage, ActivityError} from '../error/Errors';

const activityDefSymbol = Symbol.for('activityDefinition');
const bpmnIoSymbol = Symbol.for('bpmnIo');
const brokerSymbol = Symbol.for('broker');
const consumingSymbol = Symbol.for('consuming');
const contextSymbol = Symbol.for('context');
const countersSymbol = Symbol.for('counters');
const eventDefinitionsSymbol = Symbol.for('eventDefinitions');
const executeMessageSymbol = Symbol.for('executeMessage');
const execSymbol = Symbol.for('exec');
const extensionsSymbol = Symbol.for('extensions');
const flagsSymbol = Symbol.for('flags');
const flowsSymbol = Symbol.for('flows');
const formatterSymbol = Symbol.for('formatter');
const stateMessageSymbol = Symbol.for('stateMessage');

export default Activity;

function Activity(Behaviour, activityDef, context) {
  const {id, type = 'activity', name, behaviour = {}} = activityDef;
  const {attachedTo: attachedToRef, eventDefinitions} = behaviour;

  this.Behaviour = Behaviour;
  this[activityDefSymbol] = activityDef;
  this[contextSymbol] = context;
  this.id = id;
  this.type = type;
  this.name = name;
  this.behaviour = {...behaviour, eventDefinitions};
  this.Behaviour = Behaviour;
  this.parent = activityDef.parent ? cloneParent(activityDef.parent) : {};
  this.logger = context.environment.Logger(type.toLowerCase());
  this[countersSymbol] = {
    taken: 0,
    discarded: 0,
  };

  let attachedToActivity, attachedTo;
  if (attachedToRef) {
    attachedTo = attachedToRef.id;
    attachedToActivity = context.getActivityById(attachedToRef.id);
  }

  const inboundSequenceFlows = context.getInboundSequenceFlows(id);
  const inboundAssociations = context.getInboundAssociations(id);
  const inboundTriggers = attachedToActivity ? [attachedToActivity] : inboundSequenceFlows.slice();
  const flows = this[flowsSymbol] = {
    inboundSequenceFlows,
    outboundSequenceFlows: context.getOutboundSequenceFlows(id),
    inboundAssociations,
    inboundJoinFlows: [],
    inboundTriggers,
  };

  const isForCompensation = behaviour.isForCompensation;
  const isParallelJoin = activityDef.isParallelGateway && flows.inboundSequenceFlows.length > 1;
  this[flagsSymbol] = {
    isEnd: flows.outboundSequenceFlows.length === 0,
    isStart: flows.inboundSequenceFlows.length === 0 && !attachedTo && !behaviour.triggeredByEvent && !isForCompensation,
    isSubProcess: activityDef.isSubProcess,
    isMultiInstance: !!behaviour.loopCharacteristics,
    isForCompensation,
    attachedTo,
    isTransaction: activityDef.isTransaction,
    isParallelJoin,
    isThrowing: activityDef.isThrowing,
  };
  this[execSymbol] = {};

  const {broker, on, once, waitFor, emitFatal} = ActivityBroker(this);
  this[brokerSymbol] = broker;

  this.on = on;
  this.once = once;
  this.waitFor = waitFor;
  this.emitFatal = emitFatal;

  this.onRunMessage = this.onRunMessage.bind(this);
  if (isParallelJoin) this.onJoinInbound = this.onJoinInbound.bind(this);
  else this.onInbound = this.onInbound.bind(this);
  this.onApiMessage = this.onApiMessage.bind(this);
  this.onExecutionMessage = this.onExecutionMessage.bind(this);

  const onInboundEvent = this.onInboundEvent.bind(this);
  broker.assertQueue('inbound-q', {durable: true, autoDelete: false});
  if (isForCompensation) {
    for (const trigger of inboundAssociations) {
      trigger.broker.subscribeTmp('event', '#', onInboundEvent, {noAck: true, consumerTag: `_inbound-${id}`});
    }
  } else {
    for (const trigger of inboundTriggers) {
      if (trigger.isSequenceFlow) trigger.broker.subscribeTmp('event', 'flow.#', onInboundEvent, {noAck: true, consumerTag: `_inbound-${id}`});
      else trigger.broker.subscribeTmp('event', 'activity.#', onInboundEvent, {noAck: true, consumerTag: `_inbound-${id}`});
    }
  }

  this[eventDefinitionsSymbol] = eventDefinitions && eventDefinitions.map((ed) => new ed.Behaviour(this, ed, this[contextSymbol]));
}

const proto = Activity.prototype;

Object.defineProperty(proto, 'context', {
  enumerable: true,
  get() {
    return this[contextSymbol];
  },
});

Object.defineProperty(proto, 'counters', {
  enumerable: true,
  get() {
    return {...this[countersSymbol]};
  },
});

Object.defineProperty(proto, 'environment', {
  enumerable: true,
  get() {
    return this[contextSymbol].environment;
  },
});

Object.defineProperty(proto, 'broker', {
  enumerable: true,
  get() {
    return this[brokerSymbol];
  },
});

Object.defineProperty(proto, 'execution', {
  enumerable: true,
  get() {
    return this[execSymbol].execution;
  },
});

Object.defineProperty(proto, 'executionId', {
  enumerable: true,
  get() {
    return this[execSymbol].executionId;
  },
});

Object.defineProperty(proto, 'bpmnIo', {
  enumerable: true,
  get() {
    if (bpmnIoSymbol in this) return this[bpmnIoSymbol];
    const bpmnIo = this[bpmnIoSymbol] = BpmnIO(this, this[contextSymbol]);
    return bpmnIo;
  },
});

Object.defineProperty(proto, 'extensions', {
  enumerable: true,
  get() {
    if (extensionsSymbol in this) return this[extensionsSymbol];
    const extensions = this[extensionsSymbol] = this.context.loadExtensions(this);
    return extensions;
  },
});

Object.defineProperty(proto, 'formatter', {
  enumerable: true,
  get() {
    let formatter = this[formatterSymbol];
    if (formatter) return formatter;

    const broker = this[brokerSymbol];
    formatter = this[formatterSymbol] = Formatter({
      id: this.id,
      broker,
      logger: this.logger,
    }, broker.getQueue('format-run-q'));
    return formatter;
  },
});

Object.defineProperty(proto, 'isRunning', {
  enumerable: true,
  get() {
    if (!this[consumingSymbol]) return false;
    return !!this.status;
  },
});

Object.defineProperty(proto, 'outbound', {
  enumerable: true,
  get() {
    return this[flowsSymbol].outboundSequenceFlows;
  },
});

Object.defineProperty(proto, 'inbound', {
  enumerable: true,
  get() {
    return this[flowsSymbol].inboundSequenceFlows;
  },
});

Object.defineProperty(proto, 'isEnd', {
  enumerable: true,
  get() {
    return this[flagsSymbol].isEnd;
  },
});
Object.defineProperty(proto, 'isStart', {
  enumerable: true,
  get() {
    return this[flagsSymbol].isStart;
  },
});
Object.defineProperty(proto, 'isSubProcess', {
  enumerable: true,
  get() {
    return this[flagsSymbol].isSubProcess;
  },
});

Object.defineProperty(proto, 'isMultiInstance', {
  enumerable: true,
  get() {
    return this[flagsSymbol].isMultiInstance;
  },
});

Object.defineProperty(proto, 'isThrowing', {
  enumerable: true,
  get() {
    return this[flagsSymbol].isThrowing;
  },
});
Object.defineProperty(proto, 'isForCompensation', {
  enumerable: true,
  get() {
    return this[flagsSymbol].isForCompensation;
  },
});
Object.defineProperty(proto, 'triggeredByEvent', {
  enumerable: true,
  get() {
    return this[activityDefSymbol].triggeredByEvent;
  },
});

Object.defineProperty(proto, 'attachedTo', {
  enumerable: true,
  get() {
    const attachedToId = this[flagsSymbol].attachedTo;
    if (!attachedToId) return null;
    return this.getActivityById(attachedToId);
  },
});

Object.defineProperty(proto, 'eventDefinitions', {
  enumerable: true,
  get() {
    return this[eventDefinitionsSymbol];
  },
});

proto.activate = function activate() {
  if (this[flagsSymbol].isForCompensation) return;
  return this.consumeInbound();
};

proto.deactivate = function deactivate() {
  const broker = this[brokerSymbol];
  broker.cancel('_run-on-inbound');
  broker.cancel('_format-consumer');
};

proto.init = function init(initContent) {
  const id = this.id;
  const exec = this[execSymbol];
  const executionId = exec.initExecutionId = exec.initExecutionId || getUniqueId(id);
  this.logger.debug(`<${id}> initialized with executionId <${executionId}>`);
  this.publishEvent('init', this.createMessage({...initContent, executionId}));
};

proto.run = function run(runContent) {
  const id = this.id;
  if (this.isRunning) throw new Error(`activity <${id}> is already running`);

  const exec = this[execSymbol];
  const executionId = exec.executionId = exec.initExecutionId || getUniqueId(id);
  exec.initExecutionId = null;

  this.consumeApi();

  const content = this.createMessage({...runContent, executionId});
  const broker = this[brokerSymbol];

  broker.publish('run', 'run.enter', content);
  broker.publish('run', 'run.start', cloneContent(content));

  this.consumeRunQ();
};

proto.recover = function recover(state) {
  if (this.isRunning) throw new Error(`cannot recover running activity <${this.id}>`);
  if (!state) return;

  this.stopped = state.stopped;
  this.status = state.status;
  const exec = this[execSymbol];
  exec.executionId = state.executionId;

  this[countersSymbol] = {...this[countersSymbol], ...state.counters};

  if (state.execution) {
    exec.execution = new ActivityExecution(this, this[contextSymbol]).recover(state.execution);
  }

  this[brokerSymbol].recover(state.broker);

  return this;
};

proto.resume = function resume() {
  if (this[consumingSymbol]) {
    throw new Error(`cannot resume running activity <${this.id}>`);
  }
  if (!this.status) return this.activate();

  this.stopped = false;

  this.consumeApi();

  const content = this.createMessage();
  this[brokerSymbol].publish('run', 'run.resume', content, {persistent: false});
  this.consumeRunQ();
};

proto.discard = function discard(discardContent) {
  if (!this.status) return this.runDiscard(discardContent);
  const execution = this[execSymbol].execution;
  if (execution && !execution.completed) return execution.discard();

  this.deactivateRunConsumers();
  const broker = this[brokerSymbol];
  broker.getQueue('run-q').purge();
  broker.publish('run', 'run.discard', cloneContent(this[stateMessageSymbol].content));
  this.consumeRunQ();
};

proto.runDiscard = function runDiscard(discardContent = {}) {
  const exec = this[execSymbol];
  const executionId = exec.executionId = exec.initExecutionId || getUniqueId(this.id);
  exec.initExecutionId = null;

  this.consumeApi();

  const content = this.createMessage({...discardContent, executionId});
  this[brokerSymbol].publish('run', 'run.discard', content);

  this.consumeRunQ();
};

proto.discardRun = function discardRun() {
  const status = this.status;
  if (!status) return;

  const execution = this[execSymbol].execution;
  if (execution && !execution.completed) return;
  switch (status) {
    case 'executing':
    case 'error':
    case 'discarded':
      return;
  }

  this.deactivateRunConsumers();
  if (this.extensions) this.extensions.deactivate();
  const broker = this[brokerSymbol];
  broker.getQueue('run-q').purge();
  broker.publish('run', 'run.discard', cloneContent(this[stateMessageSymbol].content));
  this.consumeRunQ();
};

proto.stop = function stop() {
  if (!this[consumingSymbol]) return;
  return this.getApi().stop();
};

proto.next = function next() {
  if (!this.environment.settings.step) return;
  const stateMessage = this[stateMessageSymbol];
  if (!stateMessage) return;
  if (this.status === 'executing') return false;
  if (this.status === 'formatting') return false;
  const current = stateMessage;
  stateMessage.ack();
  return current;
};

proto.shake = function shake() {
  this.shakeOutbound({content: this.createMessage()});
};

proto.shakeOutbound = function shakeOutbound(sourceMessage) {
  const message = cloneMessage(sourceMessage);
  message.content.sequence = message.content.sequence || [];
  message.content.sequence.push({id: this.id, type: this.type});

  const broker = this[brokerSymbol];
  this[brokerSymbol].publish('api', 'activity.shake.start', message.content, {persistent: false, type: 'shake'});

  if (this[flagsSymbol].isEnd) {
    return broker.publish('event', 'activity.shake.end', message.content, {persistent: false, type: 'shake'});
  }

  for (const flow of this[flowsSymbol].outboundSequenceFlows) flow.shake(message);
};

proto.consumeInbound = function consumeInbound() {
  if (this.status) return;
  const inboundQ = this[brokerSymbol].getQueue('inbound-q');
  if (this[flagsSymbol].isParallelJoin) {
    return inboundQ.consume(this.onJoinInbound, {consumerTag: '_run-on-inbound', prefetch: 1000});
  }

  return inboundQ.consume(this.onInbound, {consumerTag: '_run-on-inbound'});
};

proto.onInbound = function onInbound(routingKey, message) {
  message.ack();
  const id = this.id;
  const broker = this[brokerSymbol];
  broker.cancel('_run-on-inbound');

  const content = message.content;
  const inbound = [cloneContent(content)];

  switch (routingKey) {
    case 'association.take':
    case 'flow.take':
    case 'activity.enter':
      return this.run({
        message: content.message,
        inbound,
      });
    case 'flow.discard':
    case 'activity.discard': {
      let discardSequence;
      if (content.discardSequence) discardSequence = content.discardSequence.slice();
      return this.runDiscard({inbound, discardSequence});
    }
    case 'association.complete': {
      broker.cancel('_run-on-inbound');

      const compensationId = `${brokerSafeId(id)}_${brokerSafeId(content.sequenceId)}`;
      this.logger.debug(`<${id}> completed compensation with id <${compensationId}>`);

      return this.publishEvent('compensation.end', this.createMessage({
        executionId: compensationId,
      }));
    }
  }
};

proto.onJoinInbound = function onJoinInbound(routingKey, message) {
  const {content} = message;
  const {inboundSequenceFlows, inboundJoinFlows, inboundTriggers} = this[flowsSymbol];
  const idx = inboundJoinFlows.findIndex((msg) => msg.content.id === content.id);

  inboundJoinFlows.push(message);

  if (idx > -1) return;

  const allTouched = inboundJoinFlows.length >= inboundTriggers.length;
  if (!allTouched) {
    const remaining = inboundSequenceFlows.filter((inb, i, list) => list.indexOf(inb) === i).length - inboundJoinFlows.length;
    return this.logger.debug(`<${this.id}> inbound ${message.content.action} from <${message.content.id}>, ${remaining} remaining`);
  }

  const evaluatedInbound = inboundJoinFlows.splice(0);

  let taken;
  const inbound = evaluatedInbound.map((im) => {
    if (im.fields.routingKey === 'flow.take') taken = true;
    im.ack();
    return cloneContent(im.content);
  });

  const discardSequence = !taken && evaluatedInbound.reduce((result, im) => {
    if (!im.content.discardSequence) return result;
    for (const sourceId of im.content.discardSequence) {
      if (result.indexOf(sourceId) === -1) result.push(sourceId);
    }
    return result;
  }, []);

  this[brokerSymbol].cancel('_run-on-inbound');

  if (!taken) return this.runDiscard({inbound, discardSequence});
  return this.run({inbound});
};

proto.onInboundEvent = function onInboundEvent(routingKey, message) {
  const {fields, content, properties} = message;
  const id = this.id;
  const inboundQ = this[brokerSymbol].getQueue('inbound-q');

  switch (routingKey) {
    case 'activity.enter':
    case 'activity.discard': {
      if (content.id === this[flagsSymbol].attachedTo) {
        inboundQ.queueMessage(fields, cloneContent(content), properties);
      }
      break;
    }
    case 'flow.shake': {
      return this.shakeOutbound(message);
    }
    case 'association.take':
    case 'flow.take':
    case 'flow.discard':
      return inboundQ.queueMessage(fields, cloneContent(content), properties);
    case 'association.discard': {
      this.logger.debug(`<${id}> compensation discarded`);
      return inboundQ.purge();
    }
    case 'association.complete': {
      if (!this[flagsSymbol].isForCompensation) break;

      inboundQ.queueMessage(fields, cloneContent(content), properties);

      const compensationId = `${brokerSafeId(id)}_${brokerSafeId(content.sequenceId)}`;
      this.publishEvent('compensation.start', this.createMessage({
        executionId: compensationId,
        placeholder: true,
      }));

      this.logger.debug(`<${id}> start compensation with id <${compensationId}>`);

      return this.consumeInbound();
    }
  }
};

proto.consumeRunQ = function consumerRunQ() {
  if (this[consumingSymbol]) return;

  this[consumingSymbol] = true;
  this[brokerSymbol].getQueue('run-q').assertConsumer(this.onRunMessage, {exclusive: true, consumerTag: '_activity-run'});
};

proto.onRunMessage = function onRunMessage(routingKey, message, messageProperties) {
  switch (routingKey) {
    case 'run.outbound.discard':
    case 'run.outbound.take':
    case 'run.next':
      return this.continueRunMessage(routingKey, message, messageProperties);
    case 'run.resume': {
      return this.onResumeMessage(message);
    }
  }

  const preStatus = this.status;
  this.status = 'formatting';
  return this.formatter(message, (err, formattedContent, formatted) => {
    if (err) return this.emitFatal(err, message.content);
    if (formatted) message.content = formattedContent;
    this.status = preStatus;
    this.continueRunMessage(routingKey, message, messageProperties);
  });
};

proto.continueRunMessage = function continueRunMessage(routingKey, message) {
  const {fields, content: originalContent, ack} = message;
  const isRedelivered = fields.redelivered;
  const content = cloneContent(originalContent);
  const {correlationId} = message.properties;

  const id = this.id;
  const step = this.environment.settings.step;
  this[stateMessageSymbol] = message;

  switch (routingKey) {
    case 'run.enter': {
      this.logger.debug(`<${id}> enter`, isRedelivered ? 'redelivered' : '');

      this.status = 'entered';
      if (!isRedelivered) {
        this[execSymbol].execution = null;
      }

      if (this.extensions) this.extensions.activate(cloneMessage(message), this);
      if (this.bpmnIo) this.bpmnIo.activate(message);

      if (!isRedelivered) this.publishEvent('enter', content, {correlationId});
      break;
    }
    case 'run.discard': {
      this.logger.debug(`<${id}> discard`, isRedelivered ? 'redelivered' : '');

      this.status = 'discard';
      this[execSymbol].execution = null;

      if (this.extensions) this.extensions.activate(cloneMessage(message), this);
      if (this.bpmnIo) this.bpmnIo.activate(message);

      if (!isRedelivered) {
        this[brokerSymbol].publish('run', 'run.discarded', content, {correlationId});
        this.publishEvent('discard', content);
      }
      break;
    }
    case 'run.start': {
      this.logger.debug(`<${id}> start`, isRedelivered ? 'redelivered' : '');
      this.status = 'started';
      if (!isRedelivered) {
        this[brokerSymbol].publish('run', 'run.execute', content, {correlationId});
        this.publishEvent('start', content, {correlationId});
      }

      break;
    }
    case 'run.execute.passthrough': {
      const execution = this.execution;
      if (!isRedelivered && execution) {
        this[executeMessageSymbol] = message;
        return execution.passthrough(message);
      }
    }
    case 'run.execute': {
      this.status = 'executing';
      this[executeMessageSymbol] = message;

      this[brokerSymbol].getQueue('execution-q').assertConsumer(this.onExecutionMessage, {exclusive: true, consumerTag: '_activity-execution'});
      const exec = this[execSymbol];
      if (!exec.execution) exec.execution = new ActivityExecution(this, this.context);

      if (isRedelivered) {
        return this.resumeExtensions(message, (err, formattedContent) => {
          if (err) return this.emitFatal(err, message.content);
          if (formattedContent) message.content = formattedContent;
          this.status = 'executing';
          return exec.execution.execute(message);
        });
      }

      return exec.execution.execute(message);
    }
    case 'run.end': {
      if (this.status === 'end') break;

      this[countersSymbol].taken++;

      this.status = 'end';

      if (isRedelivered) break;

      return this.doRunLeave(message, false, () => {
        this.publishEvent('end', content, {correlationId});
        if (!step) ack();
      });
    }
    case 'run.error': {
      this.publishEvent('error', cloneContent(content, {
        error: fields.redelivered ? makeErrorFromMessage(message) : content.error,
      }), {correlationId});
      break;
    }
    case 'run.discarded': {
      this.logger.debug(`<${content.executionId} (${id})> discarded`);
      this[countersSymbol].discarded++;

      this.status = 'discarded';
      content.outbound = undefined;

      if (!isRedelivered) {
        return this.doRunLeave(message, true, () => {
          if (!step) ack();
        });
      }

      break;
    }
    case 'run.outbound.take': {
      const flow = this.getOutboundSequenceFlowById(content.flow.id);
      ack();
      return flow.take(content.flow);
    }
    case 'run.outbound.discard': {
      const flow = this.getOutboundSequenceFlowById(content.flow.id);
      ack();
      return flow.discard(content.flow);
    }
    case 'run.leave': {
      this.status = undefined;

      if (this.bpmnIo) this.bpmnIo.deactivate(message);
      if (this.extensions) this.extensions.deactivate(message);

      if (!isRedelivered) {
        this[brokerSymbol].publish('run', 'run.next', cloneContent(content), {persistent: false});
        this.publishEvent('leave', content, {correlationId});
      }

      break;
    }
    case 'run.next':
      this.consumeInbound();
      break;
  }

  if (!step) ack();
};

proto.onExecutionMessage = function onExecutionMessage(routingKey, message) {
  const executeMessage = this[executeMessageSymbol];
  const content = cloneContent({
    ...executeMessage.content,
    ...message.content,
    executionId: executeMessage.content.executionId,
    parent: {...this.parent},
  });

  const {correlationId} = message.properties;

  this.publishEvent(routingKey, content, message.properties);
  const broker = this[brokerSymbol];

  switch (routingKey) {
    case 'execution.outbound.take': {
      return this.doOutbound(cloneMessage(message), false, (err, outbound) => {
        message.ack();
        if (err) return this.emitFatal(err, content);
        broker.publish('run', 'run.execute.passthrough', cloneContent(content, {outbound}));
        return this.ackRunExecuteMessage();
      });
    }
    case 'execution.error': {
      this.status = 'error';
      broker.publish('run', 'run.error', content, {correlationId});
      broker.publish('run', 'run.discarded', content, {correlationId});
      break;
    }
    case 'execution.discard':
      this.status = 'discarded';
      broker.publish('run', 'run.discarded', content, {correlationId});
      break;
    default: {
      this.status = 'executed';
      broker.publish('run', 'run.end', content, {correlationId});
    }
  }

  message.ack();
  this.ackRunExecuteMessage();
};

proto.ackRunExecuteMessage = function ackRunExecuteMessage() {
  if (this.environment.settings.step) return;
  const executeMessage = this[executeMessageSymbol];
  if (!executeMessage) return;

  const ackMessage = executeMessage;
  this[executeMessageSymbol] = null;
  ackMessage.ack();
};

proto.doRunLeave = function doRunLeave(message, isDiscarded, onOutbound) {
  const {content, properties} = message;
  const correlationId = properties.correlationId;
  if (content.ignoreOutbound) {
    this[brokerSymbol].publish('run', 'run.leave', cloneContent(content), {correlationId});
    if (onOutbound) onOutbound();
    return;
  }

  return this.doOutbound(cloneMessage(message), isDiscarded, (err, outbound) => {
    if (err) {
      return this.publishEvent('error', cloneContent(content, {error: err}), {correlationId});
    }

    this[brokerSymbol].publish('run', 'run.leave', cloneContent(content, {
      ...(outbound.length ? {outbound} : undefined),
    }), {correlationId});

    if (onOutbound) onOutbound();
  });
};

proto.doOutbound = function doOutbound(fromMessage, isDiscarded, callback) {
  const outboundSequenceFlows = this[flowsSymbol].outboundSequenceFlows;
  if (!outboundSequenceFlows.length) return callback(null, []);

  const fromContent = fromMessage.content;

  let discardSequence = fromContent.discardSequence;
  if (isDiscarded && !discardSequence && this[flagsSymbol].attachedTo && fromContent.inbound && fromContent.inbound[0]) {
    discardSequence = [fromContent.inbound[0].id];
  }

  let outboundFlows;
  if (isDiscarded) {
    outboundFlows = outboundSequenceFlows.map((flow) => formatFlowAction(flow, {action: 'discard'}));
  } else if (fromContent.outbound && fromContent.outbound.length) {
    outboundFlows = outboundSequenceFlows.map((flow) => formatFlowAction(flow, fromContent.outbound.filter((f) => f.id === flow.id).pop()));
  }

  if (outboundFlows) {
    this.doRunOutbound(outboundFlows, fromContent, discardSequence);
    return callback(null, outboundFlows);
  }

  return this.evaluateOutbound(fromMessage, fromContent.outboundTakeOne, (err, evaluatedOutbound) => {
    if (err) return callback(new ActivityError(err.message, fromMessage, err));

    const outbound = this.doRunOutbound(evaluatedOutbound, fromContent, discardSequence);
    return callback(null, outbound);
  });
};

proto.doRunOutbound = function doRunOutbound(outboundList, content, discardSequence) {
  return outboundList.map((outboundFlow) => {
    const {id: flowId, action} = outboundFlow;
    this[brokerSymbol].publish('run', 'run.outbound.' + action, cloneContent(content, {
      flow: {
        ...outboundFlow,
        sequenceId: getUniqueId(`${flowId}_${action}`),
        ...(discardSequence ? {discardSequence: discardSequence.slice()} : undefined),
      },
    }));

    return outboundFlow;
  });
};

proto.evaluateOutbound = function evaluateOutbound(fromMessage, discardRestAtTake, callback) {
  let conditionMet;
  const outbound = {};
  const broker = this[brokerSymbol];
  const id = this.id;
  const consumerTag = `_flow-evaluation-${this[execSymbol].executionId}`;

  const outboundSequenceFlows = this[flowsSymbol].outboundSequenceFlows;
  if (!outboundSequenceFlows.length) return completed();

  const content = fromMessage.content;
  const message = content.message;
  const evaluateFlows = outboundSequenceFlows.slice();
  const defaultFlowIdx = outboundSequenceFlows.findIndex(({isDefault}) => isDefault);
  if (defaultFlowIdx > -1) {
    evaluateFlows.splice(defaultFlowIdx, 1);
    evaluateFlows.push(outboundSequenceFlows[defaultFlowIdx]);
  }
  let takenCount = 0;

  broker.subscribeTmp('execution', 'evaluate.flow.#', (routingKey, {content: evalContent, ack}) => {
    const {id: flowId, action} = evalContent;

    if (action === 'take') {
      takenCount++;
      conditionMet = true;
    }

    outbound[flowId] = evalContent;

    if ('result' in evalContent) {
      this.logger.debug(`<${content.executionId} (${id})> flow <${flowId}> evaluated to: ${evalContent.result}`);
    }

    let nextFlow = evaluateFlows.shift();
    if (!nextFlow) return completed();

    if (discardRestAtTake && conditionMet) {
      do {
        outbound[nextFlow.id] = formatFlowAction(nextFlow, {action: 'discard'});
      } while ((nextFlow = evaluateFlows.shift()));
      return completed();
    }

    if (conditionMet && nextFlow.isDefault) {
      outbound[nextFlow.id] = formatFlowAction(nextFlow, {action: 'discard'});
      return completed();
    }

    ack();
    evaluateSequenceFlows(nextFlow);
  }, {consumerTag});

  return evaluateSequenceFlows(evaluateFlows.shift());

  function completed(err) {
    broker.cancel(consumerTag);
    if (err) return callback(err);

    if (!takenCount) {
      const nonTakenError = new ActivityError(`<${id}> no conditional flow taken`, fromMessage);
      return callback(nonTakenError);
    }

    const outboundList = Object.keys(outbound).reduce((result, flowId) => {
      const flow = outbound[flowId];
      result.push({
        ...flow,
        ...(message !== undefined ? {message} : undefined),
      });
      return result;
    }, []);

    return callback(null, outboundList);
  }

  function evaluateSequenceFlows(flow) {
    if (!flow) return completed();

    if (flow.isDefault) {
      return broker.publish('execution', 'evaluate.flow.take', formatFlowAction(flow, {action: 'take'}), {persistent: false});
    }

    const flowCondition = flow.getCondition();
    if (!flowCondition) {
      return broker.publish('execution', 'evaluate.flow.take', formatFlowAction(flow, {action: 'take'}), {persistent: false});
    }

    flowCondition.execute(cloneMessage(fromMessage), (err, result) => {
      if (err) return completed(err);
      const action = result ? 'take' : 'discard';
      return broker.publish('execution', 'evaluate.flow.' + action, formatFlowAction(flow, {
        action,
        result,
      }), {persistent: false});
    });
  }
};

proto.onResumeMessage = function onResumeMessage(message) {
  message.ack();

  const stateMessage = this[stateMessageSymbol];
  const {fields} = stateMessage;

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

  if (!fields.redelivered) return;

  this.logger.debug(`<${this.id}> resume from ${message.content.status}`);

  return this[brokerSymbol].publish('run', fields.routingKey, cloneContent(stateMessage.content), stateMessage.properties);
};

proto.publishEvent = function publishEvent(state, content, messageProperties = {}) {
  if (!state) return;
  if (!content) content = this.createMessage();

  this[brokerSymbol].publish('event', `activity.${state}`, {...content, state}, {
    ...messageProperties,
    type: state,
    mandatory: state === 'error',
    persistent: 'persistent' in messageProperties ? messageProperties.persistent : state !== 'stop',
  });
};

proto.onStop = function onStop(message) {
  const running = this[consumingSymbol];

  this.stopped = true;

  this[consumingSymbol] = false;
  const broker = this[brokerSymbol];
  broker.cancel('_activity-run');
  broker.cancel('_activity-api');
  broker.cancel('_activity-execution');
  broker.cancel('_run-on-inbound');
  broker.cancel('_format-consumer');

  if (running) {
    if (this.extensions) this.extensions.deactivate(message || this.createMessage());
    this.publishEvent('stop');
  }
};

proto.consumeApi = function consumeApi() {
  const executionId = this[execSymbol].executionId;
  if (!executionId) return;
  const broker = this[brokerSymbol];
  broker.cancel('_activity-api');
  broker.subscribeTmp('api', `activity.*.${executionId}`, this.onApiMessage, {noAck: true, consumerTag: '_activity-api', priority: 100});
};

proto.onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;
  switch (messageType) {
    case 'discard': {
      this.discardRun(message);
      break;
    }
    case 'stop': {
      this.onStop(message);
      break;
    }
    case 'shake': {
      this.shakeOutbound(message);
      break;
    }
  }
};

proto.createMessage = function createMessage(override = {}) {
  const name = this.name, status = this.status, parent = this.parent;
  const result = {
    ...override,
    id: this.id,
    type: this.type,
    ...(name ? {name} : undefined),
    ...(status ? {status} : undefined),
    ...(parent ? {parent: cloneParent(parent)} : undefined),
  };

  for (const [flag, value] of Object.entries(this[flagsSymbol])) {
    if (value) result[flag] = value;
  }

  return result;
};

proto.getOutboundSequenceFlowById = function getOutboundSequenceFlowById(flowId) {
  return this[flowsSymbol].outboundSequenceFlows.find((flow) => flow.id === flowId);
};

proto.resumeExtensions = function resumeExtensions(message, callback) {
  const extensions = this.extensions, bpmnIo = this.bpmnIo;
  if (!extensions && !bpmnIo) return callback();

  if (extensions) extensions.activate(cloneMessage(message), this);
  if (bpmnIo) bpmnIo.activate(cloneMessage(message), this);

  this.status = 'formatting';
  return this.formatter(message, (err, formattedContent, formatted) => {
    if (err) return callback(err);
    return callback(null, formatted && formattedContent);
  });
};

proto.getState = function getState() {
  const msg = this.createMessage();

  const exec = this[execSymbol];
  return {
    ...msg,
    executionId: exec.executionId,
    stopped: this.stopped,
    behaviour: {...this.behaviour},
    counters: this.counters,
    broker: this[brokerSymbol].getState(true),
    execution: exec.execution && exec.execution.getState(),
  };
};

proto.getApi = function getApi(message) {
  const execution = this[execSymbol].execution;
  if (execution && !execution.completed) return execution.getApi(message);
  return ActivityApi(this[brokerSymbol], message || this[stateMessageSymbol]);
};

proto.getActivityById = function getActivityById(elementId) {
  return this[contextSymbol].getActivityById(elementId);
};

proto.deactivateRunConsumers = function deactivateRunConsumers() {
  const broker = this[brokerSymbol];
  broker.cancel('_activity-api');
  broker.cancel('_activity-run');
  broker.cancel('_activity-execution');
  this[consumingSymbol] = false;
};

function formatFlowAction(flow, options) {
  if (!options) options = {action: 'discard'};

  const action = options.action;
  const message = options.message;

  return {
    ...options,
    id: flow.id,
    action,
    ...(flow.isDefault ? {isDefault: true} : undefined),
    ...(message !== undefined ? {message} : undefined),
  };
}
