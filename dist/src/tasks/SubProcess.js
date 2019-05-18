"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = SubProcess;
exports.SubProcessBehaviour = SubProcessBehaviour;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _ProcessExecution = _interopRequireDefault(require("../process/ProcessExecution"));

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function SubProcess(activityDef, context) {
  return (0, _Activity.default)(SubProcessBehaviour, { ...activityDef,
    isSubProcess: true
  }, context);
}

function SubProcessBehaviour(activity, context) {
  const {
    id,
    type,
    broker,
    behaviour,
    environment,
    logger
  } = activity;
  const loopCharacteristics = behaviour.loopCharacteristics && behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  const processExecutions = [];
  let rootExecutionId;
  const source = {
    id,
    type,
    loopCharacteristics,

    get execution() {
      return processExecutions[0];
    },

    get executions() {
      return processExecutions;
    },

    execute,
    getApi,
    getState,

    getPostponed() {
      return this.executions.reduce((result, pe) => {
        result = result.concat(pe.getPostponed());
        return result;
      }, []);
    },

    recover
  };
  return source;

  function execute(executeMessage) {
    const content = executeMessage.content;

    if (content.isRootScope) {
      rootExecutionId = content.executionId;
    }

    if (loopCharacteristics && content.isRootScope) {
      if (executeMessage.fields.routingKey === 'execute.resume') {
        return;
      } else {
        broker.subscribeTmp('api', `activity.#.${rootExecutionId}`, onApiRootMessage, {
          noAck: true,
          consumerTag: `_api-${rootExecutionId}`
        });
      }

      return loopCharacteristics.execute(executeMessage);
    }

    const processExecution = upsertExecution(executeMessage);
    if (!processExecution) return;
    return processExecution.execute(executeMessage);

    function onApiRootMessage(routingKey, message) {
      const apiMessageType = message.properties.type;

      if (apiMessageType === 'stop') {
        broker.cancel(`_api-${rootExecutionId}`);
        return stop();
      } else if (message.properties.type === 'discard') {
        broker.cancel(`_api-${rootExecutionId}`);
        return discard();
      }
    }
  }

  function stop() {
    return processExecutions.forEach(pe => {
      broker.cancel(`_sub-process-execution-${pe.executionId}`);
      broker.cancel(`_sub-process-api-${pe.executionId}`);
      pe.stop();
    });
  }

  function discard() {
    return processExecutions.forEach(pe => {
      broker.cancel(`_sub-process-execution-${pe.executionId}`);
      broker.cancel(`_sub-process-api-${pe.executionId}`);
      pe.discard();
    });
  }

  function getState() {
    if (loopCharacteristics) {
      return {
        executions: processExecutions.map(getExecutionState)
      };
    }

    if (processExecutions.length) {
      return getExecutionState(processExecutions[0]);
    }

    function getExecutionState(pe) {
      const state = pe.getState();
      state.environment = pe.environment.getState();
      return state;
    }
  }

  function recover(state) {
    if (!state) return;

    if (loopCharacteristics && state.executions) {
      processExecutions.splice(0);
      return state.executions.forEach(recover);
    } else if (!loopCharacteristics) {
      processExecutions.splice(0);
    }

    const subEnvironment = environment.recover(state.environment);
    const subContext = context.clone(subEnvironment);
    const execution = (0, _ProcessExecution.default)(activity, subContext).recover(state);
    processExecutions.push(execution);
    return execution;
  }

  function upsertExecution(executeMessage) {
    const content = executeMessage.content;
    const executionId = content.executionId;
    let execution = getExecutionById(executionId);

    if (execution) {
      if (executeMessage.fields.redelivered) addListeners(execution, executionId);
      return execution;
    }

    const subEnvironment = environment.clone({
      output: {}
    });
    const subContext = context.clone(subEnvironment);
    execution = (0, _ProcessExecution.default)(activity, subContext);
    processExecutions.push(execution);
    addListeners(execution, executionId);
    return execution;
  }

  function addListeners(processExecution, executionId) {
    const executionConsumerTag = `_sub-process-execution-${executionId}`;
    const apiConsumerTag = `_sub-process-api-${executionId}`;
    broker.subscribeTmp('subprocess-execution', `execution.#.${executionId}`, onExecutionCompleted, {
      noAck: true,
      consumerTag: executionConsumerTag
    });
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: apiConsumerTag
    });

    function onExecutionCompleted(_, message) {
      const content = message.content;
      const messageType = message.properties.type;

      switch (messageType) {
        case 'stopped':
          {
            broker.cancel(executionConsumerTag);
            broker.publish('execution', 'execute.stopped', (0, _messageHelper.cloneContent)(content));
            break;
          }

        case 'completed':
          {
            broker.cancel(executionConsumerTag);
            broker.cancel(apiConsumerTag);
            broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content));
            break;
          }

        case 'error':
          {
            broker.cancel(executionConsumerTag);
            broker.cancel(apiConsumerTag);
            const {
              error
            } = content;
            logger.error(`<${id}>`, error);
            broker.publish('execution', 'execute.error', (0, _messageHelper.cloneContent)(content));
            break;
          }
      }
    }

    function onApiMessage(routingKey, message) {
      const apiMessageType = message.properties.type;
      const content = message.content;

      if (apiMessageType === 'stop') {
        broker.cancel(apiConsumerTag);
        return processExecution.stop();
      } else if (message.properties.type === 'discard') {
        broker.cancel(apiConsumerTag);
        broker.cancel(executionConsumerTag);
        processExecution.discard();
        return broker.publish('execution', 'execute.discard', { ...content,
          state: 'discard'
        });
      }
    }
  }

  function getApi(apiMessage) {
    const content = apiMessage.content;
    if (content.id === id) return;
    let execution;

    if (execution = getExecutionById(content.parent.executionId)) {
      return execution.getApi(apiMessage);
    }

    const parentPath = content.parent.path;

    for (let i = 0; i < parentPath.length; i++) {
      if (execution = getExecutionById(parentPath[i].executionId)) return execution.getApi(apiMessage);
    }
  }

  function getExecutionById(executionId) {
    return processExecutions.find(pe => pe.executionId === executionId);
  }
}