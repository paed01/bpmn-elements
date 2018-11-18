import {ActivityApi} from '../Api';

export default function ActivityExecution(activity, context) {
  const {id, broker, logger, Behaviour} = activity;
  const postponed = [];

  let source, initMessage, completed = false, executionId;

  const executeQ = broker.assertQueue('execute-q', {durable: true, autoDelete: false});

  const executionApi = {
    get completed() {
      return completed;
    },
    get source() {
      return source;
    },
    discard,
    execute,
    getApi,
    getPostponed,
    getState,
    recover,
    stop,
  };

  return executionApi;

  function getPostponed() {
    return postponed.map((msg) => getApi(msg));
  }

  function execute(executeMessage) {
    if (!executeMessage) throw new Error('Execution requires message');
    if (!executeMessage.content || !executeMessage.content.executionId) throw new Error('Execution requires execution id');

    const isRedelivered = executeMessage.fields.redelivered;
    executionId = executeMessage.content.executionId;

    logger.debug(`<${executionId} (${id})>`, isRedelivered ? 'resume execution' : 'execute');

    const executeContent = {...executeMessage.content, executionId, state: 'start', isRootScope: true};
    initMessage = {...executeMessage, content: executeContent};

    if (isRedelivered) {
      if (!source) source = Behaviour(activity, context);
      return activate();
    }

    activate();
    source = Behaviour(activity, context);
    broker.publish('execution', 'execute.start', executeContent);
  }

  function discard() {
    if (completed) return;
    if (!initMessage) return logger.warn(`<${id}> is not executing`);
    getApi(initMessage).discard();
  }

  function stop() {
    if (!initMessage) return;
    broker.publish('execution', 'execute.stop', {...initMessage.content});
  }

  function getState() {
    if (!source || !source.getState) return;
    return source.getState();
  }

  function recover(state) {
    postponed.splice(0);

    if (!state) return executionApi;

    source = Behaviour(activity, context);
    if (source.recover) {
      source.recover(state);
    }

    return executionApi;
  }

  function activate() {
    if (completed) return;

    broker.bindQueue(executeQ.name, 'execution', 'execute.#', {priority: 100});
    executeQ.assertConsumer(onExecuteMessage, {exclusive: true, prefetch: 100, priority: 100});

    broker.subscribeTmp('api', `activity.*.${executionId}`, onParentApiMessage, {noAck: true, consumerTag: '_activity-api-execution', priority: 100});
  }

  function deactivate() {
    broker.cancel('_activity-api-execution');
    broker.unsubscribe(executeQ.name, onExecuteMessage);
    broker.unbindQueue(executeQ.name, 'execution', 'execute.#');
  }

  function onParentApiMessage(routingKey, message) {
    const messageType = message.properties.type;
    if (messageType === 'discard') {
      return broker.publish('execution', 'execute.discard', {...message.content, state: 'discard'});
    }
  }

  function onExecuteMessage(routingKey, message) {
    const {fields = {}, content = {}, properties = {}} = message;
    const isRedelivered = fields.redelivered;
    const {isRootScope, ignoreIfExecuting, keep, executionId: cexid, error} = content;

    switch (routingKey) {
      case 'execute.error':
      case 'execute.discard':
        executionDiscard();
        break;
      case 'execute.cancel':
      case 'execute.completed': {
        if (isRedelivered) {
          message.ack();
          return broker.publish('execution', routingKey, getExecuteMessage().content);
        }

        executionCompleted();
        break;
      }
      case 'execute.resume':
      case 'execute.start': {
        if (!stateChangeMessage()) return;
        return source.execute(getExecuteMessage());
      }
      case 'execute.stop': {
        message.ack();
        deactivate();
        const running = postponed.slice();
        return running.forEach((msg) => getApi(msg).stop());
      }
      default: {
        if (!stateChangeMessage()) return;
        if (isRedelivered) {
          return source.execute(getExecuteMessage());
        }
      }
    }

    function stateChangeMessage() {
      const idx = postponed.findIndex((msg) => msg.content.executionId === cexid);
      let previousMsg;
      if (idx > -1) {
        if (ignoreIfExecuting) {
          message.ack();
          return false;
        }

        previousMsg = postponed.splice(idx, 1, message)[0];
        previousMsg.ack();
        return true;
      }

      postponed.push(message);
      return true;
    }

    function getExecuteMessage() {
      return {
        fields: {...fields},
        content: {...content, ignoreIfExecuting: undefined},
        properties: {...properties},
      };
    }

    function executionCompleted() {
      const postponedMsg = ackPostponed(message);
      if (!postponedMsg) return;

      if (!isRootScope) {
        logger.debug(`<${cexid} (${id})> completed sub execution`);
        if (!keep) message.ack();
        if (postponed.length === 1 && postponed[0].content.isRootScope && !postponed[0].content.preventComplete) {
          return broker.publish('execution', 'execute.completed', {...postponed[0].content});
        }
        return;
      }

      logger.debug(`<${cexid} (${id})> completed execution`);
      completed = true;

      message.ack(true);

      deactivate();

      const subApis = getPostponed();
      postponed.splice(0);
      subApis.forEach((api) => api.discard());

      publishExecutionCompleted('completed', {...postponedMsg.content, ...message.content});
    }

    function executionDiscard() {
      const postponedMsg = ackPostponed(message);
      if (!isRootScope && !postponedMsg) return;


      if (!error && !isRootScope) {
        message.ack();
        if (postponed.length === 1 && postponed[0].content.isRootScope) {
          return broker.publish('execution', 'execute.discard', {...postponed[0].content});
        }
        return;
      }

      message.ack(true);

      const subApis = getPostponed();
      postponed.splice(0);
      subApis.forEach((api) => api.discard());
      deactivate();

      publishExecutionCompleted(error ? 'error' : 'discard', {...content});
    }

    function publishExecutionCompleted(completionType, completeContent) {
      completed = true;
      broker.publish('execution', `execution.${completionType}`, {
        ...completeContent,
        state: completionType,
      }, {type: completionType});
    }
  }

  function ackPostponed(completeMessage) {
    const {executionId: eid} = completeMessage.content;

    const idx = postponed.findIndex(({content}) => content.executionId === eid);
    if (idx === -1) return;
    const [msg] = postponed.splice(idx, 1);
    msg.ack();
    return msg;
  }

  function getApi(apiMessage) {
    if (!apiMessage) apiMessage = initMessage;

    if (source.getApi) {
      const sourceApi = source.getApi(apiMessage);
      if (sourceApi) return sourceApi;
    }

    const api = ActivityApi(broker, apiMessage);

    api.getExecuting = function getExecuting() {
      return postponed.reduce((result, msg) => {
        if (msg.content.executionId === apiMessage.content.executionId) return result;
        result.push(getApi(msg));
        return result;
      }, []);
    };

    return api;
  }
}
