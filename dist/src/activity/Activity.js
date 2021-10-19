"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Activity;

var _ActivityExecution = _interopRequireDefault(require("./ActivityExecution"));

var _BpmnIO = _interopRequireDefault(require("../io/BpmnIO"));

var _shared = require("../shared");

var _Api = require("../Api");

var _EventBroker = require("../EventBroker");

var _MessageFormatter = require("../MessageFormatter");

var _messageHelper = require("../messageHelper");

var _Errors = require("../error/Errors");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function Activity(Behaviour, activityDef, context) {
  const {
    id,
    type = 'activity',
    name,
    parent: originalParent = {},
    behaviour = {},
    isParallelGateway,
    isSubProcess,
    triggeredByEvent,
    isThrowing,
    isTransaction
  } = activityDef;
  const isForCompensation = behaviour.isForCompensation;
  const parent = (0, _messageHelper.cloneParent)(originalParent);
  const {
    environment,
    getInboundSequenceFlows,
    getOutboundSequenceFlows,
    getInboundAssociations
  } = context;
  const logger = environment.Logger(type.toLowerCase());
  const {
    step
  } = environment.settings;
  const {
    attachedTo: attachedToRef,
    eventDefinitions
  } = behaviour;
  let attachedToActivity, attachedTo;

  if (attachedToRef) {
    attachedTo = attachedToRef.id;
    attachedToActivity = context.getActivityById(attachedToRef.id);
  }

  const inboundSequenceFlows = getInboundSequenceFlows(id) || [];
  const outboundSequenceFlows = getOutboundSequenceFlows(id) || [];
  const inboundAssociations = getInboundAssociations(id) || [];
  const isStart = inboundSequenceFlows.length === 0 && !attachedTo && !triggeredByEvent && !isForCompensation;
  const isEnd = outboundSequenceFlows.length === 0;
  const isParallelJoin = inboundSequenceFlows.length > 1 && isParallelGateway;
  const isMultiInstance = !!behaviour.loopCharacteristics;
  let execution,
      initExecutionId,
      executionId,
      stateMessage,
      status,
      stopped = false,
      executeMessage,
      consumingRunQ;
  const inboundTriggers = attachedToActivity ? [attachedToActivity] : inboundSequenceFlows.slice();
  const inboundJoinFlows = [];
  let counters = {
    taken: 0,
    discarded: 0
  };
  const activityApi = {
    id,
    type,
    name,
    isEnd,
    isStart,
    isSubProcess,
    isThrowing,
    isForCompensation,
    triggeredByEvent,
    parent: (0, _messageHelper.cloneParent)(parent),
    behaviour: { ...behaviour,
      eventDefinitions
    },
    attachedTo: attachedToActivity,
    environment,
    inbound: inboundSequenceFlows,
    outbound: outboundSequenceFlows,

    get counters() {
      return { ...counters
      };
    },

    get executionId() {
      return executionId;
    },

    get status() {
      return status;
    },

    get stopped() {
      return stopped;
    },

    get isRunning() {
      if (!consumingRunQ) return false;
      return !!status;
    },

    Behaviour,
    activate,
    deactivate,
    evaluateOutbound,
    logger,
    discard,
    getApi,
    getActivityById,
    getState,
    init,
    recover,
    resume,
    run,
    shake,
    stop,
    next: step && next
  };
  const {
    broker,
    on,
    once,
    waitFor,
    emitFatal
  } = (0, _EventBroker.ActivityBroker)(activityApi);
  activityApi.on = on;
  activityApi.once = once;
  activityApi.waitFor = waitFor;
  activityApi.emitFatal = emitFatal;
  const runQ = broker.getQueue('run-q');
  const executionQ = broker.getQueue('execution-q');
  const inboundQ = broker.assertQueue('inbound-q', {
    durable: true,
    autoDelete: false
  });
  const formatRunQ = broker.getQueue('format-run-q');
  const formatter = (0, _MessageFormatter.Formatter)({
    id,
    broker,
    logger
  }, formatRunQ);

  if (isForCompensation) {
    inboundAssociations.forEach(trigger => {
      trigger.broker.subscribeTmp('event', '#', onInboundEvent, {
        noAck: true,
        consumerTag: `_inbound-${id}`
      });
    });
  } else {
    inboundTriggers.forEach(trigger => {
      if (trigger.isSequenceFlow) trigger.broker.subscribeTmp('event', 'flow.#', onInboundEvent, {
        noAck: true,
        consumerTag: `_inbound-${id}`
      });else trigger.broker.subscribeTmp('event', 'activity.#', onInboundEvent, {
        noAck: true,
        consumerTag: `_inbound-${id}`
      });
    });
  }

  Object.defineProperty(activityApi, 'broker', {
    enumerable: true,
    get: () => broker
  });
  Object.defineProperty(activityApi, 'execution', {
    enumerable: true,
    get: () => execution
  });
  const bpmnIo = (0, _BpmnIO.default)(activityApi, context);
  const loaedEventDefinitions = eventDefinitions && eventDefinitions.map(ed => ed.Behaviour(activityApi, ed, context));
  Object.defineProperty(activityApi, 'eventDefinitions', {
    enumerable: true,
    get: () => loaedEventDefinitions
  });
  const extensions = context.loadExtensions(activityApi);
  Object.defineProperty(activityApi, 'extensions', {
    enumerable: true,
    get: () => extensions
  });
  return activityApi;

  function init(initContent) {
    initExecutionId = initExecutionId || (0, _shared.getUniqueId)(id);
    logger.debug(`<${id}> initialized with executionId <${initExecutionId}>`);
    publishEvent('init', createMessage({ ...initContent,
      executionId: initExecutionId
    }));
  }

  function run(runContent) {
    if (activityApi.isRunning) throw new Error(`activity <${id}> is already running`);
    executionId = initExecutionId || (0, _shared.getUniqueId)(id);
    initExecutionId = undefined;
    consumeApi();
    const content = createMessage({ ...runContent,
      executionId
    });
    broker.publish('run', 'run.enter', content);
    broker.publish('run', 'run.start', (0, _messageHelper.cloneContent)(content));
    consumeRunQ();
  }

  function createMessage(override = {}) {
    const result = { ...override,
      id,
      type,
      ...(name ? {
        name
      } : undefined),
      ...(status ? {
        status
      } : undefined),
      parent: (0, _messageHelper.cloneParent)(parent)
    };
    const flags = {
      isEnd,
      isStart,
      isSubProcess,
      isMultiInstance,
      isForCompensation,
      attachedTo,
      isTransaction
    };

    for (const flag in flags) {
      if (flags[flag]) result[flag] = flags[flag];
    }

    return result;
  }

  function recover(state) {
    if (activityApi.isRunning) throw new Error(`cannot recover running activity <${id}>`);
    if (!state) return;
    stopped = state.stopped;
    status = state.status;
    executionId = state.executionId;
    counters = { ...counters,
      ...state.counters
    };

    if (state.execution) {
      execution = new _ActivityExecution.default(activityApi, context).recover(state.execution);
    }

    broker.recover(state.broker);
    return activityApi;
  }

  function resume() {
    if (consumingRunQ) {
      throw new Error(`cannot resume running activity <${id}>`);
    }

    if (!status) return activate();
    stopped = false;
    consumeApi();
    const content = createMessage({
      executionId
    });
    broker.publish('run', 'run.resume', content, {
      persistent: false
    });
    consumeRunQ();
  }

  function discard(discardContent) {
    if (!status) return runDiscard(discardContent);
    if (execution && !execution.completed) return execution.discard();
    deactivateRunConsumers();
    runQ.purge();
    broker.publish('run', 'run.discard', (0, _messageHelper.cloneContent)(stateMessage.content));
    consumeRunQ();
  }

  function discardRun() {
    if (!status) return;
    if (execution && !execution.completed) return;

    switch (status) {
      case 'executing':
      case 'error':
      case 'discarded':
        return;
    }

    deactivateRunConsumers();
    if (extensions) extensions.deactivate();
    runQ.purge();
    broker.publish('run', 'run.discard', (0, _messageHelper.cloneContent)(stateMessage.content));
    consumeRunQ();
  }

  function runDiscard(discardContent = {}) {
    executionId = initExecutionId || (0, _shared.getUniqueId)(id);
    consumeApi();
    initExecutionId = undefined;
    const content = createMessage({ ...discardContent,
      executionId
    });
    broker.publish('run', 'run.discard', content);
    consumeRunQ();
  }

  function stop() {
    if (!consumingRunQ) return;
    return getApi().stop();
  }

  function onStop(message) {
    const running = consumingRunQ;
    stopped = true;
    consumingRunQ = false;
    broker.cancel('_activity-run');
    broker.cancel('_activity-api');
    broker.cancel('_activity-execution');
    broker.cancel('_run-on-inbound');
    broker.cancel('_format-consumer');

    if (running) {
      if (extensions) extensions.deactivate(message || createMessage());
      publishEvent('stop');
    }
  }

  function activate() {
    if (isForCompensation) return;
    return consumeInbound();
  }

  function deactivate() {
    broker.cancel('_run-on-inbound');
    broker.cancel('_format-consumer');
  }

  function consumeRunQ() {
    if (consumingRunQ) return;
    consumingRunQ = true;
    runQ.assertConsumer(onRunMessage, {
      exclusive: true,
      consumerTag: '_activity-run'
    });
  }

  function consumeApi() {
    if (!executionId) return;
    broker.cancel('_activity-api');
    broker.subscribeTmp('api', `activity.*.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: '_activity-api',
      priority: 100
    });
  }

  function consumeInbound() {
    if (status) return;

    if (isParallelJoin) {
      return inboundQ.consume(onJoinInbound, {
        consumerTag: '_run-on-inbound',
        prefetch: 1000
      });
    }

    return inboundQ.consume(onInbound, {
      consumerTag: '_run-on-inbound'
    });
  }

  function deactivateRunConsumers() {
    broker.cancel('_activity-api');
    broker.cancel('_activity-run');
    broker.cancel('_activity-execution');
    consumingRunQ = false;
  }

  function onInboundEvent(routingKey, message) {
    const {
      fields,
      content,
      properties
    } = message;

    switch (routingKey) {
      case 'activity.enter':
      case 'activity.discard':
        {
          if (content.id === attachedToActivity.id) {
            inboundQ.queueMessage(fields, (0, _messageHelper.cloneContent)(content), properties);
          }

          break;
        }

      case 'flow.shake':
        {
          shakeOutbound(message);
          break;
        }

      case 'association.take':
      case 'flow.take':
      case 'flow.discard':
        inboundQ.queueMessage(fields, (0, _messageHelper.cloneContent)(content), properties);
        break;

      case 'association.discard':
        {
          logger.debug(`<${id}> compensation discarded`);
          inboundQ.purge();
          break;
        }

      case 'association.complete':
        {
          if (!isForCompensation) break;
          inboundQ.queueMessage(fields, (0, _messageHelper.cloneContent)(content), properties);
          const compensationId = `${(0, _shared.brokerSafeId)(id)}_${(0, _shared.brokerSafeId)(content.sequenceId)}`;
          publishEvent('compensation.start', createMessage({
            executionId: compensationId,
            placeholder: true
          }));
          logger.debug(`<${id}> start compensation with id <${compensationId}>`);
          consumeInbound();
          break;
        }
    }
  }

  function onInbound(routingKey, message) {
    message.ack();
    broker.cancel('_run-on-inbound');
    const content = message.content;
    const inbound = [(0, _messageHelper.cloneContent)(content)];

    switch (routingKey) {
      case 'association.take':
      case 'flow.take':
      case 'activity.enter':
        run({
          message: content.message,
          inbound
        });
        break;

      case 'flow.discard':
      case 'activity.discard':
        {
          let discardSequence;
          if (content.discardSequence) discardSequence = content.discardSequence.slice();
          runDiscard({
            inbound,
            discardSequence
          });
          break;
        }

      case 'association.complete':
        {
          broker.cancel('_run-on-inbound');
          const compensationId = `${(0, _shared.brokerSafeId)(id)}_${(0, _shared.brokerSafeId)(content.sequenceId)}`;
          logger.debug(`<${id}> completed compensation with id <${compensationId}>`);
          publishEvent('compensation.end', createMessage({
            executionId: compensationId
          }));
          break;
        }
    }
  }

  function onJoinInbound(routingKey, message) {
    const {
      content
    } = message;
    const idx = inboundJoinFlows.findIndex(msg => msg.content.id === content.id);
    inboundJoinFlows.push(message);
    if (idx > -1) return;
    const allTouched = inboundJoinFlows.length >= inboundTriggers.length;

    if (!allTouched) {
      const remaining = inboundSequenceFlows.filter((inb, i, list) => list.indexOf(inb) === i).length - inboundJoinFlows.length;
      return logger.debug(`<${id}> inbound ${message.content.action} from <${message.content.id}>, ${remaining} remaining`);
    }

    const evaluatedInbound = inboundJoinFlows.splice(0);
    let taken;
    const inbound = evaluatedInbound.map(im => {
      if (im.fields.routingKey === 'flow.take') taken = true;
      im.ack();
      return (0, _messageHelper.cloneContent)(im.content);
    });
    const discardSequence = !taken && evaluatedInbound.reduce((result, im) => {
      if (!im.content.discardSequence) return result;
      im.content.discardSequence.forEach(sourceId => {
        if (result.indexOf(sourceId) === -1) result.push(sourceId);
      });
      return result;
    }, []);
    broker.cancel('_run-on-inbound');
    if (!taken) return runDiscard({
      inbound,
      discardSequence
    });
    return run({
      inbound
    });
  }

  function onRunMessage(routingKey, message, messageProperties) {
    switch (routingKey) {
      case 'run.outbound.discard':
      case 'run.outbound.take':
      case 'run.next':
        return continueRunMessage(routingKey, message, messageProperties);

      case 'run.resume':
        {
          return onResumeMessage();
        }
    }

    const preStatus = status;
    status = 'formatting';
    return formatter(message, (err, formattedContent, formatted) => {
      if (err) return emitFatal(err, message.content);
      if (formatted) message.content = formattedContent;
      status = preStatus;
      continueRunMessage(routingKey, message, messageProperties);
    });

    function onResumeMessage() {
      message.ack();
      const {
        fields
      } = stateMessage;

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
      logger.debug(`<${id}> resume from ${message.content.status}`);
      return broker.publish('run', fields.routingKey, (0, _messageHelper.cloneContent)(stateMessage.content), stateMessage.properties);
    }
  }

  function continueRunMessage(routingKey, message) {
    const {
      fields,
      content: originalContent,
      ack
    } = message;
    const isRedelivered = fields.redelivered;
    const content = (0, _messageHelper.cloneContent)(originalContent);
    const {
      correlationId
    } = message.properties;
    stateMessage = message;

    switch (routingKey) {
      case 'run.enter':
        {
          logger.debug(`<${id}> enter`, isRedelivered ? 'redelivered' : '');
          status = 'entered';

          if (!isRedelivered) {
            execution = undefined;
          }

          if (extensions) extensions.activate((0, _messageHelper.cloneMessage)(message), activityApi);
          if (bpmnIo) bpmnIo.activate(message);
          if (!isRedelivered) publishEvent('enter', content, {
            correlationId
          });
          break;
        }

      case 'run.discard':
        {
          logger.debug(`<${id}> discard`, isRedelivered ? 'redelivered' : '');
          status = 'discard';
          execution = undefined;
          if (extensions) extensions.activate((0, _messageHelper.cloneMessage)(message), activityApi);
          if (bpmnIo) bpmnIo.activate(message);

          if (!isRedelivered) {
            broker.publish('run', 'run.discarded', content, {
              correlationId
            });
            publishEvent('discard', content);
          }

          break;
        }

      case 'run.start':
        {
          logger.debug(`<${id}> start`, isRedelivered ? 'redelivered' : '');
          status = 'started';

          if (!isRedelivered) {
            broker.publish('run', 'run.execute', content, {
              correlationId
            });
            publishEvent('start', content, {
              correlationId
            });
          }

          break;
        }

      case 'run.execute.passthrough':
        {
          if (!isRedelivered && execution) {
            executeMessage = message;
            return execution.passthrough(message);
          }
        }

      case 'run.execute':
        {
          status = 'executing';
          executeMessage = message;
          executionQ.assertConsumer(onExecutionMessage, {
            exclusive: true,
            consumerTag: '_activity-execution'
          });
          execution = execution || new _ActivityExecution.default(activityApi, context);

          if (isRedelivered) {
            return resumeExtensions(message, (err, formattedContent) => {
              if (err) return emitFatal(err, message.content);
              if (formattedContent) message.content = formattedContent;
              status = 'executing';
              return execution.execute(message);
            });
          }

          return execution.execute(message);
        }

      case 'run.end':
        {
          if (status === 'end') break;
          counters.taken++;
          status = 'end';
          if (isRedelivered) break;
          return doRunLeave(false, () => {
            publishEvent('end', content, {
              correlationId
            });
            if (!step) ack();
          });
        }

      case 'run.error':
        {
          publishEvent('error', (0, _messageHelper.cloneContent)(content, {
            error: fields.redelivered ? (0, _Errors.makeErrorFromMessage)(message) : content.error
          }), {
            correlationId
          });
          break;
        }

      case 'run.discarded':
        {
          logger.debug(`<${executionId} (${id})> discarded`);
          counters.discarded++;
          status = 'discarded';
          content.outbound = undefined;

          if (!isRedelivered) {
            return doRunLeave(true, () => {
              if (!step) ack();
            });
          }

          break;
        }

      case 'run.outbound.take':
        {
          const flow = getOutboundSequenceFlowById(content.flow.id);
          ack();
          return flow.take(content.flow);
        }

      case 'run.outbound.discard':
        {
          const flow = getOutboundSequenceFlowById(content.flow.id);
          ack();
          return flow.discard(content.flow);
        }

      case 'run.leave':
        {
          status = undefined;
          if (bpmnIo) bpmnIo.deactivate(message);
          if (extensions) extensions.deactivate(message);

          if (!isRedelivered) {
            broker.publish('run', 'run.next', (0, _messageHelper.cloneContent)(content), {
              persistent: false
            });
            publishEvent('leave', content, {
              correlationId
            });
          }

          break;
        }

      case 'run.next':
        consumeInbound();
        break;
    }

    if (!step) ack();

    function doRunLeave(isDiscarded, onOutbound) {
      if (content.ignoreOutbound) {
        broker.publish('run', 'run.leave', (0, _messageHelper.cloneContent)(content), {
          correlationId
        });
        if (onOutbound) onOutbound();
        return;
      }

      return doOutbound((0, _messageHelper.cloneMessage)(message), isDiscarded, (err, outbound) => {
        if (err) {
          return publishEvent('error', (0, _messageHelper.cloneContent)(content, {
            error: err
          }), {
            correlationId
          });
        }

        broker.publish('run', 'run.leave', (0, _messageHelper.cloneContent)(content, { ...(outbound.length ? {
            outbound
          } : undefined)
        }), {
          correlationId
        });
        if (onOutbound) onOutbound();
      });
    }
  }

  function resumeExtensions(message, callback) {
    if (!extensions && !bpmnIo) return callback();
    if (extensions) extensions.activate((0, _messageHelper.cloneMessage)(message), activityApi);
    if (bpmnIo) bpmnIo.activate((0, _messageHelper.cloneMessage)(message));
    status = 'formatting';
    return formatter(message, (err, formattedContent, formatted) => {
      if (err) return callback(err);
      return callback(null, formatted && formattedContent);
    });
  }

  function getOutboundSequenceFlowById(flowId) {
    return outboundSequenceFlows.find(flow => flow.id === flowId);
  }

  function onExecutionMessage(routingKey, message) {
    const content = (0, _messageHelper.cloneContent)({ ...executeMessage.content,
      ...message.content,
      executionId: executeMessage.content.executionId,
      parent: { ...parent
      }
    });
    const {
      correlationId
    } = message.properties;
    publishEvent(routingKey, content, message.properties);

    switch (routingKey) {
      case 'execution.outbound.take':
        {
          return doOutbound((0, _messageHelper.cloneMessage)(message), false, (err, outbound) => {
            message.ack();
            if (err) return emitFatal(err, content);
            broker.publish('run', 'run.execute.passthrough', (0, _messageHelper.cloneContent)(content, {
              outbound
            }));
            return ackRunExecuteMessage();
          });
        }

      case 'execution.error':
        {
          status = 'error';
          broker.publish('run', 'run.error', content, {
            correlationId
          });
          broker.publish('run', 'run.discarded', content, {
            correlationId
          });
          break;
        }

      case 'execution.discard':
        status = 'discarded';
        broker.publish('run', 'run.discarded', content, {
          correlationId
        });
        break;

      default:
        {
          status = 'executed';
          broker.publish('run', 'run.end', content, {
            correlationId
          });
        }
    }

    message.ack();
    ackRunExecuteMessage();

    function ackRunExecuteMessage() {
      if (step) return;
      if (!executeMessage) return;
      const ackMessage = executeMessage;
      executeMessage = null;
      ackMessage.ack();
    }
  }

  function onApiMessage(routingKey, message) {
    const messageType = message.properties.type;

    switch (messageType) {
      case 'discard':
        {
          discardRun(message);
          break;
        }

      case 'stop':
        {
          onStop(message);
          break;
        }

      case 'shake':
        {
          shakeOutbound(message);
          break;
        }
    }
  }

  function shake() {
    shakeOutbound({
      content: createMessage()
    });
  }

  function shakeOutbound(sourceMessage) {
    const message = (0, _messageHelper.cloneMessage)(sourceMessage);
    message.content.sequence = message.content.sequence || [];
    message.content.sequence.push({
      id,
      type
    });
    broker.publish('api', 'activity.shake.start', message.content, {
      persistent: false,
      type: 'shake'
    });

    if (isEnd) {
      return broker.publish('event', 'activity.shake.end', message.content, {
        persistent: false,
        type: 'shake'
      });
    }

    outboundSequenceFlows.forEach(f => f.shake(message));
  }

  function publishEvent(state, content, messageProperties = {}) {
    if (!state) return;
    if (!content) content = createMessage();
    broker.publish('event', `activity.${state}`, { ...content,
      state
    }, { ...messageProperties,
      type: state,
      mandatory: state === 'error',
      persistent: 'persistent' in messageProperties ? messageProperties.persistent : state !== 'stop'
    });
  }

  function doOutbound(fromMessage, isDiscarded, callback) {
    if (!outboundSequenceFlows.length) return callback(null, []);
    const fromContent = fromMessage.content;
    let discardSequence = fromContent.discardSequence;

    if (isDiscarded && !discardSequence && attachedTo && fromContent.inbound && fromContent.inbound[0]) {
      discardSequence = [fromContent.inbound[0].id];
    }

    let outboundFlows;

    if (isDiscarded) {
      outboundFlows = outboundSequenceFlows.map(flow => formatFlowAction(flow, {
        action: 'discard'
      }));
    } else if (fromContent.outbound && fromContent.outbound.length) {
      outboundFlows = outboundSequenceFlows.map(flow => formatFlowAction(flow, fromContent.outbound.filter(f => f.id === flow.id).pop()));
    }

    if (outboundFlows) {
      doRunOutbound(outboundFlows);
      return callback(null, outboundFlows);
    }

    return evaluateOutbound(fromMessage, fromContent.outboundTakeOne, (err, evaluatedOutbound) => {
      if (err) return callback(new _Errors.ActivityError(err.message, fromMessage, err));
      const outbound = doRunOutbound(evaluatedOutbound);
      return callback(null, outbound);
    });

    function doRunOutbound(outboundList) {
      return outboundList.map(outboundFlow => {
        const {
          id: flowId,
          action
        } = outboundFlow;
        broker.publish('run', 'run.outbound.' + action, (0, _messageHelper.cloneContent)(fromContent, {
          flow: { ...outboundFlow,
            sequenceId: (0, _shared.getUniqueId)(`${flowId}_${action}`),
            ...(discardSequence ? {
              discardSequence: discardSequence.slice()
            } : undefined)
          }
        }));
        return outboundFlow;
      });
    }
  }

  function formatFlowAction(flow, options) {
    if (!options) options = {
      action: 'discard'
    };
    const action = options.action;
    const message = options.message;
    return { ...options,
      id: flow.id,
      action,
      ...(flow.isDefault ? {
        isDefault: true
      } : undefined),
      ...(message !== undefined ? {
        message
      } : undefined)
    };
  }

  function evaluateOutbound(fromMessage, discardRestAtTake, callback) {
    let conditionMet;
    const outbound = {};
    if (!outboundSequenceFlows.length) return completed();
    const content = fromMessage.content;
    const message = content.message;
    const evaluateFlows = outboundSequenceFlows.slice();
    const defaultFlowIdx = outboundSequenceFlows.findIndex(({
      isDefault
    }) => isDefault);

    if (defaultFlowIdx > -1) {
      evaluateFlows.splice(defaultFlowIdx, 1);
      evaluateFlows.push(outboundSequenceFlows[defaultFlowIdx]);
    }

    let takenCount = 0;
    broker.subscribeTmp('execution', 'evaluate.flow.#', (routingKey, {
      content: evalContent,
      ack
    }) => {
      const {
        id: flowId,
        action
      } = evalContent;

      if (action === 'take') {
        takenCount++;
        conditionMet = true;
      }

      outbound[flowId] = evalContent;

      if ('result' in evalContent) {
        logger.debug(`<${content.executionId} (${id})> flow <${flowId}> evaluated to: ${evalContent.result}`);
      }

      let nextFlow = evaluateFlows.shift();
      if (!nextFlow) return completed();

      if (discardRestAtTake && conditionMet) {
        do {
          outbound[nextFlow.id] = formatFlowAction(nextFlow, {
            action: 'discard'
          });
        } while (nextFlow = evaluateFlows.shift());

        return completed();
      }

      if (conditionMet && nextFlow.isDefault) {
        outbound[nextFlow.id] = formatFlowAction(nextFlow, {
          action: 'discard'
        });
        return completed();
      }

      ack();
      evaluateSequenceFlows(nextFlow);
    }, {
      consumerTag: `_flow-evaluation-${executionId}`
    });
    return evaluateSequenceFlows(evaluateFlows.shift());

    function completed(err) {
      broker.cancel(`_flow-evaluation-${executionId}`);
      if (err) return callback(err);

      if (!takenCount) {
        const nonTakenError = new _Errors.ActivityError(`<${id}> no conditional flow taken`, fromMessage);
        logger.error(`<${id}>`, nonTakenError);
        return callback(nonTakenError);
      }

      const outboundList = Object.keys(outbound).reduce((result, flowId) => {
        const flow = outbound[flowId];
        result.push({ ...flow,
          ...(message !== undefined ? {
            message
          } : undefined)
        });
        return result;
      }, []);
      return callback(null, outboundList);
    }

    function evaluateSequenceFlows(flow) {
      if (!flow) return completed();

      if (flow.isDefault) {
        return broker.publish('execution', 'evaluate.flow.take', formatFlowAction(flow, {
          action: 'take'
        }), {
          persistent: false
        });
      }

      const flowCondition = flow.getCondition();

      if (!flowCondition) {
        return broker.publish('execution', 'evaluate.flow.take', formatFlowAction(flow, {
          action: 'take'
        }), {
          persistent: false
        });
      }

      flowCondition.execute((0, _messageHelper.cloneMessage)(fromMessage), (err, result) => {
        if (err) return completed(err);
        const action = result ? 'take' : 'discard';
        return broker.publish('execution', 'evaluate.flow.' + action, formatFlowAction(flow, {
          action,
          result
        }), {
          persistent: false
        });
      });
    }
  }

  function getActivityById(elementId) {
    return context.getActivityById(elementId);
  }

  function getState() {
    const msg = createMessage();
    return { ...msg,
      status,
      executionId,
      stopped,
      behaviour: { ...behaviour
      },
      counters: { ...counters
      },
      broker: broker.getState(true),
      execution: execution && execution.getState()
    };
  }

  function next() {
    if (!step) return;
    if (!stateMessage) return;
    if (status === 'executing') return false;
    if (status === 'formatting') return false;
    const current = stateMessage;
    stateMessage.ack();
    return current;
  }

  function getApi(message) {
    if (execution && !execution.completed) return execution.getApi(message);
    return (0, _Api.ActivityApi)(broker, message || stateMessage);
  }
}