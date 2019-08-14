import {ProcessApi} from '../Api';
import {cloneContent, cloneMessage, pushParent} from '../messageHelper';

export default function ProcessExecution(parentActivity, context) {
  const {id, type, broker, logger, isSubProcess} = parentActivity;
  const {environment} = context;

  const children = context.getActivities(id) || [];
  const flows = context.getSequenceFlows(id) || [];
  const outboundMessageFlows = context.getMessageFlows(id) || [];

  const startActivities = [];
  const triggeredByEventActivities = [];

  const postponed = [];
  const exchangeName = isSubProcess ? 'subprocess-execution' : 'execution';
  broker.assertExchange(exchangeName, 'topic', {autoDelete: false, durable: true});

  let activityQ, status = 'init', executionId, stopped, activated, initMessage, completed = false;

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
    stop,
  };

  return processExecution;

  function execute(executeMessage) {
    if (!executeMessage) throw new Error('Process execution requires message');
    if (!executeMessage.content || !executeMessage.content.executionId) throw new Error('Process execution requires execution id');

    const isRedelivered = executeMessage.fields.redelivered;
    executionId = executeMessage.content.executionId;

    initMessage = cloneMessage(executeMessage);
    initMessage.content = {...initMessage.content, executionId, state: 'start'};

    stopped = false;

    environment.assignVariables(executeMessage);
    activityQ = broker.assertQueue(`execute-${executionId}-q`, {durable: true, autoDelete: false});

    if (isRedelivered) {
      return resume();
    }

    logger.debug(`<${executionId} (${id})> execute`, isSubProcess ? 'sub process' : 'process');
    activate();
    start();
    return true;
  }

  function resume() {
    logger.debug(`<${executionId} (${id})> resume`, status, 'process execution');

    if (completed) return complete('completed');

    activate();
    postponed.splice(0);
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
      if (activity) activity.resume();
    });
  }

  function start() {
    if (children.length === 0) {
      return complete('completed');
    }

    status = 'start';

    const executeContent = {...initMessage.content, state: status};

    broker.publish(exchangeName, 'execute.start', cloneContent(executeContent));

    startActivities.forEach((activity) => activity.init());
    startActivities.forEach((activity) => activity.run());

    postponed.splice(0);
    activityQ.assertConsumer(onChildMessage, {prefetch: 1000, consumerTag: `_process-activity-${executionId}`});
  }

  function recover(state) {
    if (!state) return processExecution;
    executionId = state.executionId;

    stopped = state.stopped;
    completed = state.completed;
    status = state.status;

    logger.debug(`<${executionId} (${id})> recover`, status, 'process execution');

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

  function stop() {
    getApi().stop();
  }

  function activate() {
    broker.subscribeTmp('api', '#', onApiMessage, {noAck: true, consumerTag: `_process-api-consumer-${executionId}`, priority: 200});

    outboundMessageFlows.forEach((flow) => {
      flow.broker.subscribeTmp('event', '#', onMessageFlowEvent, {consumerTag: '_process-message-controller', noAck: true, priority: 200});
    });

    flows.forEach((flow) => {
      flow.broker.subscribeTmp('event', '#', onActivityEvent, {consumerTag: '_process-flight-controller', noAck: true, priority: 200});
    });

    startActivities.splice(0);
    triggeredByEventActivities.splice(0);

    children.forEach((activity) => {
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

      const isDirectChild = content.parent.id === id;
      if (isDirectChild) {
        parent.executionId = executionId;
      } else {
        content.parent = pushParent(parent, {id, type, executionId});
      }

      if (delegate) delegate = onDelegateEvent(message);

      broker.publish('event', routingKey, content, {...message.properties, delegate, mandatory: false});
      if (!isDirectChild) return;

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
      activity.broker.cancel('_process-activity-consumer');
      activity.deactivate();
    });

    flows.forEach((flow) => {
      flow.broker.cancel('_process-flight-controller');
    });

    outboundMessageFlows.forEach((flow) => {
      flow.broker.cancel('_process-message-controller');
    });

    activated = false;
  }

  function onDelegateEvent(message) {
    const eventType = message.properties.type;
    let delegate = true;

    const content = message.content;
    logger.debug(`<${executionId} (${id})> delegate`, eventType, content.message && content.message.id ? `event with id <${content.message.id}>` : 'anonymous event');

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
    const {id: childId, type: activityType} = content;

    if (isRedelivered && message.properties.persistent === false) return;

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
      case 'flow.looped':
      case 'activity.leave':
        return onChildCompleted();
      default:
        if (!message.properties.persistent) {
          return message.ack();
        }
    }

    stateChangeMessage(true);

    switch (routingKey) {
      case 'activity.discard':
      case 'activity.enter': {
        status = 'executing';
        if (content.inbound) {
          content.inbound.forEach((trigger) => {
            if (!trigger.isSequenceFlow) return;
            const msg = popPostponed(trigger);
            if (msg) msg.ack();
          });
        }
        break;
      }
      case 'flow.error':
      case 'activity.error': {
        if (isEventCaught()) {
          logger.debug(`<${executionId} (${id})> error was caught`);
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

    function popPostponed(byContent) {
      const idx = postponed.findIndex((msg) => {
        if (msg.content.isSequenceFlow) return msg.content.sequenceId === byContent.sequenceId;
        return msg.content.executionId === byContent.executionId;
      });

      if (idx > -1) {
        return postponed.splice(idx, 1)[0];
      }
    }

    function onChildCompleted() {
      stateChangeMessage(false);
      if (isRedelivered) return message.ack();

      logger.debug(`<${executionId} (${id})> left <${childId}> (${activityType}), pending runs ${postponed.length}`, postponed.map((a) => a.content.id));

      if (!postponed.length) {
        message.ack();
        complete('completed');
      }
    }

    function stopExecution() {
      if (stopped) return;
      logger.debug(`<${executionId} (${id})> stop process execution (stop child executions ${postponed.length})`);
      getPostponed().forEach((api) => {
        api.stop();
      });
      deactivate();
      stopped = true;
      return broker.publish(exchangeName, `execution.stopped.${executionId}`, {
        ...initMessage.content,
        ...content,
      }, {type: 'stopped', persistent: false});
    }

    function onDiscard() {
      deactivate();
      const running = postponed.splice(0);
      logger.debug(`<${executionId} (${id})> discard process execution (discard child executions ${running.length})`);

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
      for (const child of children) {
        child.broker.publish('api', routingKey, cloneContent(message.content), message.properties);
      }
      return;
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
    logger.debug(`<${executionId} (${id})> process execution ${completionType}`);
    completed = true;
    if (status !== 'terminated') status = completionType;
    broker.deleteQueue(activityQ.name);

    return broker.publish(exchangeName, `execution.${completionType}.${executionId}`, {
      ...initMessage.content,
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
    logger.debug(`<${executionId} (${id})> terminating process execution`);

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
      children: children.map((activity) => activity.getState()),
      flows: flows.map((f) => f.getState()),
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

  function getChildById(childId) {
    return getActivityById(childId) || getFlowById(childId);
  }

  function getSequenceFlows() {
    return flows.slice();
  }

  function getApi(message) {
    if (!message) return ProcessApi(broker, initMessage);

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
}
