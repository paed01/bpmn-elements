import DefinitionExecution from './DefinitionExecution';
import {DefinitionApi} from '../Api';
import {DefinitionBroker} from '../EventBroker';
import {getUniqueId} from '../shared';
import {makeErrorFromMessage} from '../error/Errors';

export default Definition;

export function Definition(context, options) {
  if (!context) throw new Error('No context');

  const {id, name, type = 'definition'} = context;
  let environment = context.environment;

  if (options) {
    environment = environment.clone(options);
    context = context.clone(environment);
  }

  const logger = environment.Logger(type.toLowerCase());

  let execution, executionId, processes, executableProcesses, postponedMessage, returnListener, stopped;
  let status = 'pending';
  const runCallbacks = [];

  let counters = {
    completed: 0,
  };

  const definitionApi = {
    id,
    name,
    type,
    logger,
    context,
    get counters() {
      return {...counters};
    },
    get executionId() {
      return executionId;
    },
    get status() {
      return status;
    },
    get execution() {
      return execution;
    },
    environment,
    run,
    getApi,
    getState,
    getActivityById,
    getPostponed,
    getProcesses,
    getExecutableProcesses,
    getProcessById,
    recover,
    resume,
    stop,
  };

  const {broker, on, once, waitFor, emit, emitFatal} = DefinitionBroker(definitionApi);

  definitionApi.on = on;
  definitionApi.once = once;
  definitionApi.waitFor = waitFor;
  definitionApi.emit = emit;
  definitionApi.emitFatal = emitFatal;

  const runQ = broker.getQueue('run-q');
  const executionQ = broker.getQueue('execution-q');

  Object.defineProperty(definitionApi, 'broker', {
    enumerable: true,
    get: () => broker,
  });

  Object.defineProperty(definitionApi, 'stopped', {
    enumerable: true,
    get: () => execution && execution.stopped,
  });

  return definitionApi;

  function run(callback) {
    addConsumerCallbacks();

    executionId = getUniqueId(id);

    broker.publish('run', 'run.enter', createMessage({executionId, state: 'enter'}));
    broker.publish('run', 'run.start', createMessage({executionId, state: 'start'}));
    broker.publish('run', 'run.execute', createMessage({executionId, state: 'execute'}));

    runQ.assertConsumer(onRunMessage, {exclusive: true, consumerTag: '_definition-run'});
    executionQ.assertConsumer(onExecutionMessage, {exclusive: true, consumerTag: '_definition-execution'});

    function addConsumerCallbacks() {
      if (returnListener) returnListener.cancel();
      if (!callback) {
        returnListener = broker.on('return', onBrokerReturn);
        return;
      }

      const leaveConsumer = broker.subscribeOnce('event', 'definition.leave', cbLeave, {consumerTag: 'ctag-cb-leave'});
      const errorConsumer = broker.subscribeOnce('event', 'definition.error', cbError, {consumerTag: 'ctag-cb-error'});

      function cbLeave(_, message) {
        errorConsumer.cancel();
        return callback(null, getApi(message));
      }
      function cbError(_, message) {
        leaveConsumer.cancel();
        const err = makeErrorFromMessage(message);
        return callback(err);
      }
    }
  }

  function stop() {
    if (!status || status === 'pending') return;

    stopped = true;

    deactivate();
    broker.cancel('_definition-run');
    broker.cancel('_definition-execution');

    if (execution) execution.stop();

    if (status) publishEvent('stop');
  }

  function createMessage(override = {}) {
    return {
      id,
      type,
      ...override,
    };
  }

  function resume() {
    if (runQ.peek()) {
      publishEvent('resume');
    }

    runQ.assertConsumer(onRunMessage, {exclusive: true, consumerTag: '_definition-run'});
    executionQ.assertConsumer(onExecutionMessage, {exclusive: true, consumerTag: '_definition-execution'});
  }

  function onBrokerReturn(message) {
    const routingKey = message.fields.routingKey;

    if (routingKey === 'definition.error') {
      const err = makeErrorFromMessage(message);
      throw err;
    }
  }

  function onRunMessage(routingKey, message) {
    const {content, ack} = message;

    switch (routingKey) {
      case 'run.enter': {
        logger.debug(`<${id}> enter`);

        status = 'entered';
        execution = undefined;

        publishEvent('enter', content);
        break;
      }
      case 'run.discard': {
        logger.debug(`<${id}> discarded`);
        status = 'discard';
        execution.discard();
        publishEvent('discard', content);
        break;
      }
      case 'run.start': {
        logger.debug(`<${id}> start`);
        status = 'start';
        publishEvent('start', content);
        break;
      }
      case 'run.execute': {
        status = 'executing';
        postponedMessage = message;
        execution = execution || DefinitionExecution(definitionApi, context);
        return execution.execute(message);
      }
      case 'run.error': {
        publishEvent('error', content);
        break;
      }
      case 'run.end': {
        if (status === 'end') break;

        counters.completed++;

        logger.debug(`<${id}>`, 'completed');
        status = 'end';
        broker.publish('run', 'run.leave', content);
        publishEvent('end', content);
        break;
      }
      case 'run.discarded': {
        if (status === 'discarded') break;

        counters.discarded++;

        status = 'discarded';
        broker.publish('run', 'run.leave', content);
        break;
      }
      case 'run.leave': {
        status = undefined;
        ack();
        publishEvent('leave');
        break;
      }
    }

    ack();
  }

  function onExecutionMessage(routingKey, message) {
    const content = message.content;
    const messageType = message.properties.type;

    message.ack();

    switch (messageType) {
      case 'error': {
        broker.publish('run', 'run.error', content);
        broker.publish('run', 'run.discarded', content);
        break;
      }
      case 'discard':
        broker.publish('run', 'run.discarded', content);
        break;
      default: {
        broker.publish('run', 'run.end', content);
      }
    }

    if (postponedMessage) {
      const ackMessage = postponedMessage;
      postponedMessage = null;
      ackMessage.ack();
    }
  }

  function publishEvent(action, content = {}) {
    if (!action) return;
    const msgOpts = { type: action, mandatory: action === 'error' };

    broker.publish('event', `definition.${action}`, execution ? execution.createMessage(content) : content, msgOpts);
  }

  function getState() {
    return {
      id,
      type,
      status,
      stopped,
      counters: {...counters},
      environment: environment.getState(),
      execution: execution && execution.getState(),
      broker: broker.getState(),
    };
  }

  function recover(state) {
    if (!state) return definitionApi;

    stopped = state.stopped;
    status = state.status;
    if (state.counters) {
      counters = {...counters, ...state.counters};
    }

    if (state.execution) {
      execution = DefinitionExecution(definitionApi, context).recover(state.execution);
    }

    broker.recover(state.broker);

    return definitionApi;
  }

  function deactivate() {
    if (execution) execution.deactivate();
    const cbs = runCallbacks.splice(0);
    cbs.forEach((cbConsumer) => cbConsumer.cancel());
  }

  function getProcesses() {
    if (!processes) loadProcesses();
    return processes;
  }

  function getExecutableProcesses() {
    if (!processes) loadProcesses();
    return executableProcesses;
  }

  function getProcessById(processId) {
    return getProcesses().find((p) => p.id === processId);
  }

  function loadProcesses() {
    if (processes) return processes;
    executableProcesses = context.getExecutableProcesses() || [];
    processes = context.getProcesses() || [];
    logger.debug(`<${id}> found ${processes.length} processes`);
  }

  function getActivityById(childId) {
    let child;
    const siblings = getProcesses();
    for (let i = 0; i < siblings.length; i++) {
      child = siblings[i].getActivityById(childId);
      if (child) return child;
    }
    return child;
  }

  function getPostponed() {
    if (!execution) return [];
    return execution.getPostponed();
  }

  function getApi(message) {
    if (execution) return execution.getApi(message);
    return DefinitionApi(broker, message);
  }
}
