import {ProcessApi} from '../Api';
import {cloneContent, cloneMessage, pushParent} from '../messageHelper';
import {getUniqueId} from '../shared';

export default function ProcessExecution(parentActivity, context) {
  const {id, type, broker, logger, isSubProcess} = parentActivity;
  const {environment} = context;

  const children = context.getActivities(id);
  const flows = context.getSequenceFlows(id);
  const associations = context.getAssociations(id);
  const outboundMessageFlows = context.getMessageFlows(id);

  const startActivities = [];
  const triggeredByEventActivities = [];
  const detachedActivities = [];

  const postponed = [];
  const startSequences = {};
  const exchangeName = isSubProcess ? 'subprocess-execution' : 'execution';
  broker.assertExchange(exchangeName, 'topic', {autoDelete: false, durable: true});

  let activityQ, status = 'init', executionId, stopped, activated, stateMessage, completed = false, executionName;

  const processExecution = {
    id,
    type,
    broker,
    get environment() {
      return environment;
    },
    get executionId() {
      return executionId;
    },
    get completed() {
      return completed;
    },
    get status() {
      return status;
    },
    get stopped() {
      return stopped;
    },
    get postponedCount() {
      return postponed.length;
    },
    get isRunning() {
      if (activated) return true;
      return false;
    },
    discard,
    execute,
    getApi,
    getActivityById,
    getActivities,
    getPostponed,
    getSequenceFlows,
    getState,
    recover,
    shake,
    stop,
  };

  return processExecution;

  function execute(executeMessage) {
    if (!executeMessage) throw new Error('Process execution requires message');
    if (!executeMessage.content || !executeMessage.content.executionId) throw new Error('Process execution requires execution id');

    const isRedelivered = executeMessage.fields.redelivered;
    executionId = executeMessage.content.executionId;
    prepare();

    stateMessage = cloneMessage(executeMessage);
    stateMessage.content = {...stateMessage.content, executionId, state: 'start'};

    stopped = false;

    environment.assignVariables(executeMessage);
    activityQ = broker.assertQueue(`execute-${executionId}-q`, {durable: true, autoDelete: false});

    if (isRedelivered) {
      return resume();
    }

    logger.debug(`<${executionName}> execute`, isSubProcess ? 'sub process' : 'process');
    activate();
    start();
    return true;
  }

  function resume() {
    logger.debug(`<${executionName}> resume process execution at`, status);

    if (completed) return complete('completed');

    activate();
    postponed.splice(0);
    detachedActivities.splice(0);
    activityQ.consume(onChildMessage, {prefetch: 1000, consumerTag: `_process-activity-${executionId}`});

    if (completed) return complete('completed');
    switch (status) {
      case 'init':
        return start();
      case 'executing': {
        if (!postponed.length) return complete('completed');
        break;
      }
    }

    postponed.slice().forEach(({content}) => {
      const activity = getActivityById(content.id);
      if (!activity) return;
      if (content.placeholder) return;
      activity.resume();
    });
  }

  function start() {
    if (children.length === 0) {
      return complete('completed');
    }

    status = 'start';

    const executeContent = {...stateMessage.content, state: status};

    broker.publish(exchangeName, 'execute.start', cloneContent(executeContent));

    if (startActivities.length > 1) {
      startActivities.forEach((a) => a.shake());
    }

    startActivities.forEach((activity) => activity.init());
    startActivities.forEach((activity) => activity.run());

    postponed.splice(0);
    detachedActivities.splice(0);
    activityQ.assertConsumer(onChildMessage, {prefetch: 1000, consumerTag: `_process-activity-${executionId}`});
  }

  function recover(state) {
    if (!state) return processExecution;
    executionId = state.executionId;
    prepare();

    stopped = state.stopped;
    completed = state.completed;
    status = state.status;

    logger.debug(`<${executionName}> recover process execution at`, status);

    if (state.messageFlows) {
      state.messageFlows.forEach((flowState) => {
        const flow = getMessageFlowById(flowState.id);
        if (!flow) return;
        flow.recover(flowState);
      });
    }

    if (state.associations) {
      state.associations.forEach((associationState) => {
        const association = getAssociationById(associationState.id);
        if (!association) return;
        association.recover(associationState);
      });
    }

    if (state.flows) {
      state.flows.forEach((flowState) => {
        const flow = getFlowById(flowState.id);
        if (!flow) return;
        flow.recover(flowState);
      });
    }

    if (state.children) {
      state.children.forEach((childState) => {
        const child = getActivityById(childState.id);
        if (!child) return;

        child.recover(childState);
      });
    }

    return processExecution;
  }

  function shake(startId) {
    let executing = true;
    if (!processExecution.isRunning) {
      executing = false;
      executionId = getUniqueId(id);
      prepare();
      activate();
    }
    const toShake = startId ? [getActivityById(startId)].filter(Boolean) : startActivities;

    const result = {};
    broker.subscribeTmp('event', '*.shake.*', (routingKey, {content}) => {
      let isLooped = false;
      switch (routingKey) {
        case 'flow.shake.loop':
          isLooped = true;
        case 'activity.shake.end':
          result[content.id] = result[content.id] || [];
          result[content.id].push({...content, isLooped});
          break;
      }
    }, {noAck: true, consumerTag: `_shaker-${executionId}`});

    toShake.forEach((a) => a.shake());

    if (!executing) deactivate();
    broker.cancel(`_shaker-${executionId}`);

    return result;
  }

  function stop() {
    getApi().stop();
  }

  function activate() {
    broker.subscribeTmp('api', '#', onApiMessage, {noAck: true, consumerTag: `_process-api-consumer-${executionId}`, priority: 200});

    outboundMessageFlows.forEach((flow) => {
      flow.activate();
      flow.broker.subscribeTmp('event', '#', onMessageFlowEvent, {consumerTag: '_process-message-consumer', noAck: true, priority: 200});
    });

    flows.forEach((flow) => {
      flow.broker.subscribeTmp('event', '#', onActivityEvent, {consumerTag: '_process-flight-controller', noAck: true, priority: 200});
    });

    associations.forEach((association) => {
      association.broker.subscribeTmp('event', '#', onActivityEvent, {consumerTag: '_process-association-controller', noAck: true, priority: 200});
    });

    startActivities.splice(0);
    triggeredByEventActivities.splice(0);

    children.forEach((activity) => {
      if (activity.placeholder) return;
      activity.activate(processExecution);
      activity.broker.subscribeTmp('event', '#', onActivityEvent, {noAck: true, consumerTag: '_process-activity-consumer', priority: 200});
      if (activity.isStart) startActivities.push(activity);
      if (activity.triggeredByEvent) triggeredByEventActivities.push(activity);
    });

    activated = true;

    function onActivityEvent(routingKey, activityMessage) {
      const message = cloneMessage(activityMessage);
      if (message.fields.redelivered && message.properties.persistent === false) return;

      const content = message.content;
      const parent = content.parent = content.parent || {};
      let delegate = message.properties.delegate;
      const shaking = message.properties.type === 'shake';

      const isDirectChild = content.parent.id === id;
      if (isDirectChild) {
        parent.executionId = executionId;
      } else {
        content.parent = pushParent(parent, {id, type, executionId});
      }

      if (delegate) delegate = onDelegateEvent(message);

      broker.publish('event', routingKey, content, {...message.properties, delegate, mandatory: false});
      if (shaking) return onShookEnd(message);
      if (!isDirectChild) return;
      if (content.isAssociation) return;

      switch (routingKey) {
        case 'process.terminate':
          return activityQ.queueMessage({routingKey: 'execution.terminate'}, cloneContent(content), {type: 'terminate', persistent: true});
        case 'activity.stop':
          return;
      }

      activityQ.queueMessage(message.fields, cloneContent(content), {persistent: true, ...message.properties});
    }
  }

  function deactivate() {
    broker.cancel(`_process-api-consumer-${executionId}`);
    broker.cancel(`_process-activity-${executionId}`);

    children.forEach((activity) => {
      if (activity.placeholder) return;
      activity.broker.cancel('_process-activity-consumer');
      activity.deactivate();
    });

    flows.forEach((flow) => {
      flow.broker.cancel('_process-flight-controller');
    });

    associations.forEach((association) => {
      association.broker.cancel('_process-association-controller');
    });

    outboundMessageFlows.forEach((flow) => {
      flow.deactivate();
      flow.broker.cancel('_process-message-consumer');
    });

    activated = false;
  }

  function onDelegateEvent(message) {
    const eventType = message.properties.type;
    let delegate = true;

    const content = message.content;
    logger.debug(`<${executionName}> delegate`, eventType, content.message && content.message.id ? `event with id <${content.message.id}>` : 'anonymous event');

    triggeredByEventActivities.forEach((activity) => {
      if (activity.getStartActivities({referenceId: content.message && content.message.id, referenceType: eventType}).length) {
        delegate = false;
        activity.run(content.message);
      }
    });

    getApi().sendApiMessage(eventType, content, {delegate: true});

    return delegate;
  }

  function onMessageFlowEvent(routingKey, message) {
    broker.publish('message', routingKey, cloneContent(message.content), message.properties);
  }

  function onChildMessage(routingKey, message) {
    const content = message.content;
    const isRedelivered = message.fields.redelivered;
    const {id: childId, type: activityType, isEnd} = content;
    const {persistent} = message.properties;

    if (isRedelivered && persistent === false) return message.ack();

    switch (routingKey) {
      case 'execution.stop':
        message.ack();
        return stopExecution();
      case 'execution.terminate':
        message.ack();
        return terminate(message);
      case 'execution.discard':
        message.ack();
        return onDiscard(message);
      case 'activity.compensation.end':
      case 'flow.looped':
      case 'activity.leave':
        return onChildCompleted();
    }

    stateChangeMessage(true);

    switch (routingKey) {
      case 'activity.detach': {
        detachedActivities.push(cloneMessage(message));
        break;
      }
      case 'activity.discard':
      case 'activity.compensation.start':
      case 'activity.enter': {
        status = 'executing';
        popInbound();
        break;
      }
      case 'activity.end': {
        if (isEnd) discardPostponedIfNecessary();
        break;
      }
      case 'flow.error':
      case 'activity.error': {
        if (isEventCaught()) {
          logger.debug(`<${executionName}> error was caught`);
          break;
        }
        complete('error', {error: content.error});
        break;
      }
    }

    function stateChangeMessage(postponeMessage = true) {
      const previousMsg = popPostponed(content);
      if (previousMsg) previousMsg.ack();
      if (postponeMessage) postponed.push(message);
    }

    function popInbound() {
      if (!content.inbound) return;

      content.inbound.forEach((trigger) => {
        if (!trigger.isSequenceFlow) return;
        const msg = popPostponed(trigger, postponed);
        if (msg) msg.ack();
      });
    }

    function popPostponed(byContent) {
      const postponedIdx = postponed.findIndex((msg) => {
        if (msg.content.isSequenceFlow) return msg.content.sequenceId === byContent.sequenceId;
        return msg.content.executionId === byContent.executionId;
      });

      let postponedMsg;
      if (postponedIdx > -1) {
        postponedMsg = postponed.splice(postponedIdx, 1)[0];
      }

      const detachedIdx = detachedActivities.findIndex((msg) => msg.content.executionId === byContent.executionId);
      if (detachedIdx > -1) detachedActivities.splice(detachedIdx, 1);

      return postponedMsg;
    }

    function onChildCompleted() {
      stateChangeMessage(false);
      if (isRedelivered) return message.ack();

      logger.debug(`<${executionName}> left <${childId}> (${activityType}), pending runs ${postponed.length}`, postponed.map((a) => a.content.id));

      const postponedLength = postponed.length;
      if (!postponedLength) {
        message.ack();
        return complete('completed');
      } else if (postponedLength === detachedActivities.length) {
        getPostponed().forEach((api) => api.discard());
      }
    }

    function discardPostponedIfNecessary() {
      for (const p of postponed) {
        const postponedId = p.content.id;
        const startSequence = startSequences[postponedId];
        if (startSequence) {
          if (startSequence.content.sequence.some(({id: sid}) => sid === childId)) {
            getApi(p).discard();
          }
        }
      }
    }

    function stopExecution() {
      if (stopped) return;
      logger.debug(`<${executionName}> stop process execution (stop child executions ${postponed.length})`);
      getPostponed().forEach((api) => {
        api.stop();
      });
      deactivate();
      stopped = true;
      return broker.publish(exchangeName, `execution.stopped.${executionId}`, {
        ...stateMessage.content,
        ...content,
      }, {type: 'stopped', persistent: false});
    }

    function onDiscard() {
      deactivate();
      const running = postponed.splice(0);
      logger.debug(`<${executionName}> discard process execution (discard child executions ${running.length})`);

      getSequenceFlows().forEach((flow) => {
        flow.stop();
      });

      running.forEach((msg) => {
        getApi(msg).discard();
      });

      activityQ.purge();
      return complete('discard');
    }

    function isEventCaught() {
      return postponed.find((msg) => {
        if (msg.fields.routingKey !== 'activity.catch') return;
        return msg.content.source && msg.content.source.executionId === content.executionId;
      });
    }
  }

  function onApiMessage(routingKey, message) {
    if (message.properties.delegate) {
      return delegateApiMessage();
    }

    if (id !== message.content.id) {
      const child = getActivityById(message.content.id);
      if (!child) return null;
      return child.broker.publish('api', routingKey, message.content, message.properties);
    }

    if (executionId !== message.content.executionId) return;

    switch (message.properties.type) {
      case 'discard':
        return discard(message);
      case 'stop':
        activityQ.queueMessage({routingKey: 'execution.stop'}, cloneContent(message.content), {persistent: false});
        break;
    }

    function delegateApiMessage() {
      const {correlationId} = message.properties || getUniqueId(executionId);
      logger.debug(`<${executionName}> delegate api`, routingKey, `message to children, with correlationId <${correlationId}>`);

      let consumed = false;
      broker.subscribeTmp('event', 'activity.consumed', (_, msg) => {
        if (msg.properties.correlationId === correlationId) {
          consumed = true;
          logger.debug(`<${executionName}> delegated api message was consumed by`, msg.content ? msg.content.executionId : 'unknown');
        }
      }, {consumerTag: `_ct-delegate-${correlationId}`, noAck: true});

      for (const child of children) {
        if (child.placeholder) continue;
        child.broker.publish('api', routingKey, cloneContent(message.content), message.properties);
        if (consumed) break;
      }

      broker.cancel(`_ct-delegate-${correlationId}`);
    }
  }

  function getPostponed(filterFn) {
    return postponed.slice().reduce((result, p) => {
      const api = getApi(p);
      if (api) {
        if (filterFn && !filterFn(api)) return result;
        result.push(api);
      }
      return result;
    }, []);
  }

  function complete(completionType, content = {}) {
    deactivate();
    logger.debug(`<${executionName}> process execution ${completionType}`);
    completed = true;
    if (status !== 'terminated') status = completionType;
    broker.deleteQueue(activityQ.name);

    return broker.publish(exchangeName, `execution.${completionType}.${executionId}`, {
      ...stateMessage.content,
      output: environment.output,
      ...content,
      state: completionType,
    }, {type: completionType, mandatory: completionType === 'error'});
  }

  function discard() {
    status = 'discard';
    return activityQ.queueMessage({routingKey: 'execution.discard'}, {
      id,
      type,
      executionId,
    }, {type: 'discard'});
  }

  function terminate(message) {
    status = 'terminated';
    logger.debug(`<${executionName}> terminating process execution`);

    const running = postponed.splice(0);
    getSequenceFlows().forEach((flow) => {
      flow.stop();
    });

    running.forEach((msg) => {
      const {id: postponedId, isSequenceFlow} = msg.content;
      if (postponedId === message.content.id) return;
      if (isSequenceFlow) return;
      getApi(msg).stop();
      msg.ack();
    });

    activityQ.purge();
  }

  function getState() {
    return {
      executionId,
      stopped,
      completed,
      status,
      children: children.reduce((result, activity) => {
        if (activity.placeholder) return result;
        result.push(activity.getState());
        return result;
      }, []),
      flows: flows.map((f) => f.getState()),
      messageFlows: outboundMessageFlows.map((f) => f.getState()),
      associations: associations.map((f) => f.getState()),
    };
  }

  function getActivities() {
    return children.slice();
  }

  function getActivityById(activityId) {
    return children.find((child) => child.id === activityId);
  }

  function getFlowById(flowId) {
    return flows.find((f) => f.id === flowId);
  }

  function getAssociationById(associationId) {
    return associations.find((a) => a.id === associationId);
  }

  function getMessageFlowById(flowId) {
    return outboundMessageFlows.find((f) => f.id === flowId);
  }

  function getChildById(childId) {
    return getActivityById(childId) || getFlowById(childId);
  }

  function getSequenceFlows() {
    return flows.slice();
  }

  function getApi(message) {
    if (!message) return ProcessApi(broker, stateMessage);

    const content = message.content;
    if (content.executionId !== executionId) {
      return getChildApi(message);
    }

    const api = ProcessApi(broker, message);

    api.getExecuting = function getExecuting() {
      return postponed.reduce((result, msg) => {
        if (msg.content.executionId === content.executionId) return result;
        result.push(getApi(msg));
        return result;
      }, []);
    };

    return api;
  }

  function getChildApi(message) {
    const content = message.content;

    let api = getApiByChildId(content.id);
    if (api) return api;

    if (!content.parent) return;

    api = getApiByChildId(content.parent.id);
    if (api) return api;

    if (!content.parent.path) return;

    for (let i = 0; i < content.parent.path.length; i++) {
      api = getApiByChildId(content.parent.path[i].id);
      if (api) return api;
    }

    function getApiByChildId(childId) {
      const child = getChildById(childId);
      if (!child) return;
      return child.getApi(message);
    }
  }

  function onShookEnd(message) {
    const routingKey = message.fields.routingKey;
    if (routingKey !== 'activity.shake.end') return;
    startSequences[message.content.id] = cloneMessage(message);
  }

  function prepare() {
    executionName = `${executionId} (${id})`;
  }
}
