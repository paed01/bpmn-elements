"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Activity;

var _ActivityExecution = _interopRequireDefault(require("./ActivityExecution"));

var _shared = require("../shared");

var _Api = require("../Api");

var _EventBroker = require("../EventBroker");

var _smqp = require("smqp");

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function Activity(Behaviour, activityDef, context) {
  const {
    id,
    type = 'activity',
    name,
    parent,
    behaviour = {},
    isParallelGateway,
    isSubProcess
  } = activityDef;
  const {
    environment,
    getInboundSequenceFlows,
    getOutboundSequenceFlows
  } = context;
  const logger = environment.Logger(type.toLowerCase());
  const {
    step
  } = environment.settings;
  const {
    attachedTo: attachedToRef,
    ioSpecification: ioSpecificationDef
  } = behaviour;
  let attachedToActivity, attachedTo;

  if (attachedToRef) {
    attachedTo = attachedToRef.id;
    attachedToActivity = context.getActivityById(attachedToRef.id);
  }

  const inboundSequenceFlows = getInboundSequenceFlows(id) || [];
  const outboundSequenceFlows = getOutboundSequenceFlows(id) || [];
  const isStart = inboundSequenceFlows.length === 0 && !attachedTo;
  const isParallelJoin = inboundSequenceFlows.length > 1 && isParallelGateway;
  const isMultiInstance = !!behaviour.loopCharacteristics;
  let execution,
      executionId,
      stateMessage,
      status,
      stopped = false,
      executeMessage;
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
    isStart,
    isSubProcess,
    parent,
    behaviour: { ...behaviour
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

    Behaviour,
    activate,
    deactivate,
    logger,
    discard,
    getApi,
    getErrorById,
    getState,
    message: inboundMessage,
    recover,
    resume,
    run,
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
  const formatRunQ = broker.getQueue('format-run-q');
  const inboundQ = broker.assertQueue('inbound-q', {
    durable: true,
    autoDelete: false
  });
  inboundTriggers.forEach(trigger => trigger.broker.subscribeTmp('event', '#', onInboundEvent, {
    noAck: true,
    consumerTag: `_inbound-${id}`
  }));
  Object.defineProperty(activityApi, 'broker', {
    enumerable: true,
    get: () => broker
  });
  Object.defineProperty(activityApi, 'execution', {
    enumerable: true,
    get: () => execution
  });
  const extensions = context.loadExtensions(activityApi);
  Object.defineProperty(activityApi, 'extensions', {
    enumerable: true,
    get: () => extensions
  });
  const ioSpecification = ioSpecificationDef && ioSpecificationDef.Behaviour(activityApi, ioSpecificationDef, context);
  return activityApi;

  function run(runContent) {
    executionId = (0, _shared.getUniqueId)(id);
    broker.cancel('_activity-run');
    broker.cancel('_activity-api');
    const content = createMessage({ ...runContent,
      executionId
    });
    broker.publish('run', 'run.enter', content);
    broker.publish('run', 'run.start', (0, _messageHelper.cloneContent)(content));
    broker.subscribeTmp('api', `activity.*.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: '_activity-api'
    });
    runQ.assertConsumer(onRunMessage, {
      exclusive: true,
      consumerTag: '_activity-run'
    });
  }

  function createMessage(override = {}) {
    return { ...override,
      id,
      type,
      attachedTo,
      parent: (0, _messageHelper.cloneParent)(parent),
      isSubProcess,
      isMultiInstance
    };
  }

  function resume() {
    if (!status) return activate();
    stopped = false;
    broker.subscribeTmp('api', `activity.*.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: '_activity-api'
    });
    runQ.assertConsumer(onRunMessage, {
      exclusive: true,
      consumerTag: '_activity-run'
    });
  }

  function discard(discardContent) {
    if (!status) return runDiscard(discardContent);
    if (execution && !execution.completed) return execution.discard();
    broker.cancel('_activity-run');
    runQ.purge();
    broker.publish('run', 'run.discard', (0, _messageHelper.cloneContent)(stateMessage.content));
    runQ.assertConsumer(onRunMessage, {
      exclusive: true,
      consumerTag: '_activity-run'
    });
  }

  function discardRun() {
    if (!status) return;
    if (execution && !execution.completed) return;
    broker.cancel('_activity-run');
    runQ.purge();
    broker.publish('run', 'run.discard', (0, _messageHelper.cloneContent)(stateMessage.content));
    runQ.assertConsumer(onRunMessage, {
      exclusive: true,
      consumerTag: '_activity-run'
    });
  }

  function runDiscard(discardContent = {}) {
    executionId = (0, _shared.getUniqueId)(id);
    const content = createMessage({ ...discardContent,
      executionId
    });
    broker.publish('run', 'run.discard', content);
    broker.subscribeTmp('api', 'activity.#', onApiMessage, {
      noAck: true,
      consumerTag: '_activity-api'
    });
    runQ.assertConsumer(onRunMessage, {
      exclusive: true,
      consumerTag: '_activity-run'
    });
  }

  function stop() {
    stopped = true;
    deactivate();
    broker.cancel('_activity-api');
    broker.cancel('_activity-run');
    broker.cancel('_activity-execution');
    if (execution) execution.stop();
    if (status) publishEvent('stop');
  }

  function recover(state) {
    if (!state) return;
    stopped = state.stopped;
    status = state.status;
    counters = state.counters && { ...counters,
      ...state.counters
    };

    if (state.execution) {
      execution = (0, _ActivityExecution.default)(activityApi, context).recover(state.execution);
    }

    broker.recover(state.broker);
  }

  function activate() {
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

  function deactivate() {
    broker.cancel('_run-on-inbound');
    broker.cancel('_format-consumer');
  }

  function onInboundEvent(routingKey, {
    fields,
    content,
    properties
  }) {
    switch (routingKey) {
      case 'flow.take':
      case 'flow.discard':
      case 'activity.enter':
      case 'activity.discard':
        inboundQ.queueMessage(fields, content, properties);
        break;
    }
  }

  function onInbound(routingKey, message) {
    message.ack();
    const content = message.content;
    broker.cancel('_run-on-inbound');
    const inbound = [(0, _messageHelper.cloneContent)(content)];

    switch (routingKey) {
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
    }
  }

  function onJoinInbound(routingKey, message) {
    const touchedIds = inboundJoinFlows.map(msg => msg.content.id);
    const idx = touchedIds.indexOf(message.content.id);
    if (idx > -1) return;
    inboundJoinFlows.push(message);
    const allTouched = inboundJoinFlows.length === inboundTriggers.length;
    const remaining = inboundSequenceFlows.length - inboundJoinFlows.length;
    logger.debug(`<${id}> inbound ${message.content.action} from <${message.content.id}>, ${remaining} remaining`);
    if (!allTouched) return;
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
    if (routingKey === 'run.next') return continueRunMessage(routingKey, message, messageProperties);
    return formatRunMessageContent(formatRunQ, message, (err, formattedContent) => {
      if (err) return broker.publish('run', 'run.error', err);
      message.content = formattedContent;
      continueRunMessage(routingKey, message, messageProperties);
    });
  }

  function continueRunMessage(routingKey, message) {
    broker.cancel('_format-consumer');
    const {
      fields,
      content: originalContent,
      ack
    } = message;
    const content = (0, _messageHelper.cloneContent)(originalContent);
    console.log('---->', fields);
    stateMessage = message;

    switch (routingKey) {
      case 'run.enter':
        {
          logger.debug(`<${id}> enter`);
          status = 'entered';
          execution = undefined;
          if (extensions) extensions.activate(message);
          if (ioSpecification) ioSpecification.activate(message);
          publishEvent('enter', content);
          break;
        }

      case 'run.discard':
        {
          logger.debug(`<${id}> discarded`);
          status = 'discard';
          execution = undefined;
          if (extensions) extensions.activate(message);
          if (ioSpecification) ioSpecification.activate(message);
          if (!fields.redelivered) broker.publish('run', 'run.discarded', content);
          publishEvent('discard', content);
          break;
        }

      case 'run.start':
        {
          logger.debug(`<${id}> start`);
          status = 'start';
          if (!fields.redelivered) broker.publish('run', 'run.execute', content);
          publishEvent('start', content);
          break;
        }

      case 'run.execute':
        {
          status = 'executing';
          executeMessage = message;

          if (fields.redelivered) {
            if (extensions) extensions.activate(message);
            if (ioSpecification) ioSpecification.activate(message);
          }

          executionQ.assertConsumer(onExecutionCompletedMessage, {
            exclusive: true,
            consumerTag: '_activity-execution'
          });
          execution = execution || (0, _ActivityExecution.default)(activityApi, context);
          return execution.execute(message);
        }

      case 'run.end':
        {
          if (status === 'end') break;
          counters.taken++;
          status = 'end';
          if (!fields.redelivered) broker.publish('run', 'run.leave', content);
          publishEvent('end', content);
          break;
        }

      case 'run.error':
        {
          publishEvent('error', content);
          break;
        }

      case 'run.discarded':
        {
          counters.discarded++;
          status = 'discarded';
          content.outbound = undefined;
          if (!fields.redelivered) broker.publish('run', 'run.leave', content);
          break;
        }

      case 'run.leave':
        {
          const outbound = prepareOutbound(content, status === 'discarded');
          status = undefined;
          broker.cancel('_activity-api');
          if (!fields.redelivered) broker.publish('run', 'run.next', content);
          publishEvent('leave', { ...content,
            outbound: outbound.slice()
          });
          doOutbound(content, outbound);
          break;
        }

      case 'run.next':
        activate();
        break;
    }

    if (!step) ack();
  }

  function onExecutionCompletedMessage(routingKey, message) {
    const content = { ...executeMessage.content,
      ...message.content
    };
    publishEvent(routingKey, content);

    switch (routingKey) {
      case 'execution.error':
        {
          status = 'error';
          broker.publish('run', 'run.error', content);
          broker.publish('run', 'run.discarded', content);
          break;
        }

      case 'execution.discard':
        status = 'discarded';
        broker.publish('run', 'run.discarded', content);
        break;

      default:
        {
          if (content.outbound && content.outbound.discarded === outboundSequenceFlows.length) {
            status = 'discarded';
            broker.publish('run', 'run.discarded', content);
          } else {
            status = 'executed';
            broker.publish('run', 'run.end', content);
          }
        }
    }

    message.ack();

    if (!step && executeMessage) {
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
          discardRun();
          break;
        }

      case 'stop':
        {
          stop();
          break;
        }
    }
  }

  function publishEvent(state, content) {
    if (!state) return;
    if (!content) content = createMessage();
    broker.publish('event', `activity.${state}`, { ...content,
      state
    }, {
      type: state,
      mandatory: state === 'error'
    });
  }

  function prepareOutbound({
    message,
    outbound: evaluatedOutbound = [],
    discardSequence
  }, isDiscarded) {
    if (!outboundSequenceFlows.length) return [];
    return outboundSequenceFlows.map(flow => {
      const preparedFlow = getPrepared(flow.id);
      flow.preFlight(preparedFlow.action);
      return preparedFlow;
    });

    function getPrepared(flowId) {
      let evaluatedFlow = evaluatedOutbound.filter(flow => flow.id === flowId).pop();

      if (!evaluatedFlow) {
        evaluatedFlow = {
          id: flowId,
          action: isDiscarded ? 'discard' : 'take'
        };
        if (message !== undefined) evaluatedFlow.message = message;
      }

      evaluatedFlow.discardSequence = discardSequence;
      if (message !== undefined && !('message' in evaluatedFlow)) evaluatedFlow.message = message;
      return evaluatedFlow;
    }
  }

  function doOutbound(content, preparedOutbound) {
    if (!preparedOutbound) return;
    outboundSequenceFlows.forEach((flow, idx) => {
      const preparedFlow = preparedOutbound[idx];
      flow[preparedFlow.action](preparedFlow);
    });
  }

  function getErrorById(errorId) {
    return context.getErrorById(errorId);
  }

  function getState() {
    return createMessage({
      status,
      stopped,
      behaviour: { ...behaviour
      },
      counters: { ...counters
      },
      broker: broker.getState(),
      execution: execution && execution.getState()
    });
  }

  function inboundMessage(messageContent) {
    const messagesQ = broker.assertQueue('messages', {
      autoDelete: false,
      durable: true
    });
    messagesQ.queueMessage({
      routingKey: 'message'
    }, messageContent);
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

  function formatRunMessageContent(formatQ, runMessage, callback) {
    const startFormatMsg = formatQ.get();
    if (!startFormatMsg) return callback(null, runMessage.content);
    const pendingFormats = [];
    const {
      fields,
      content
    } = runMessage;
    const fundamentals = {
      id: content.id,
      type: content.type,
      parent: content.parent,
      attachedTo: content.attachedTo,
      executionId: content.executionId,
      isSubProcess: content.isSubProcess,
      isMultiInstance: content.isMultiInstance,
      inbound: content.inbound,
      outbound: content.outbound
    };
    let formattedContent = (0, _messageHelper.cloneContent)(content);
    const depleted = formatQ.on('depleted', () => {
      if (pendingFormats.length) return;
      depleted.cancel();
      logger.debug(`<${id}> completed formatting ${fields.routingKey}`);
      broker.cancel('_format-consumer');
      callback(null, (0, _shared.filterUndefined)(formattedContent));
    });
    status = 'formatting';
    onFormatMessage(startFormatMsg.fields.routingKey, startFormatMsg);
    formatQ.assertConsumer(onFormatMessage, {
      consumerTag: '_format-consumer',
      prefetch: 100
    });

    function onFormatMessage(routingKey, message) {
      const isStartFormat = message.content.endRoutingKey;

      if (isStartFormat) {
        pendingFormats.push(message);
        return logger.debug(`<${id}> start formatting ${fields.routingKey} message content with formatter ${routingKey}`);
      }

      popFormattingStart(routingKey, message);
      logger.debug(`<${id}> format ${fields.routingKey} message content`);
      formattedContent = { ...formattedContent,
        ...message.content,
        ...fundamentals
      };
      message.ack();
    }

    function popFormattingStart(routingKey) {
      for (let i = 0; i < pendingFormats.length; i++) {
        const pendingFormat = pendingFormats[i];

        if ((0, _smqp.getRoutingKeyPattern)(pendingFormat.content.endRoutingKey).test(routingKey)) {
          logger.debug(`<${id}> completed formatting ${fields.routingKey} message content with formatter ${routingKey}`);
          pendingFormats.splice(i, 1);
          pendingFormat.ack();
          break;
        }
      }
    }
  }
}