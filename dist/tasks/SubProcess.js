"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SubProcessBehaviour = SubProcessBehaviour;
exports.default = SubProcess;
var _Activity = _interopRequireDefault(require("../activity/Activity.js"));
var _ProcessExecution = _interopRequireDefault(require("../process/ProcessExecution.js"));
var _messageHelper = require("../messageHelper.js");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const kExecutions = Symbol.for('executions');
const kMessageHandlers = Symbol.for('messageHandlers');
function SubProcess(activityDef, context) {
  const triggeredByEvent = activityDef.behaviour && activityDef.behaviour.triggeredByEvent;
  const subProcess = new _Activity.default(SubProcessBehaviour, {
    ...activityDef,
    isSubProcess: true,
    triggeredByEvent
  }, context);
  subProcess.getStartActivities = function getStartActivities(filterOptions) {
    return context.getStartActivities(filterOptions, activityDef.id);
  };
  subProcess.broker.cancel('_api-shake');
  subProcess.broker.subscribeTmp('api', 'activity.shake.*', onShake, {
    noAck: true,
    consumerTag: '_api-shake'
  });
  return subProcess;
  function onShake(_, message) {
    const {
      startId
    } = message.content;
    const last = message.content.sequence.pop();
    const sequence = new _ProcessExecution.default(subProcess, context).shake(startId);
    message.content.sequence.push({
      ...last,
      isSubProcess: true,
      sequence
    });
  }
}
function SubProcessBehaviour(activity, context) {
  const {
    id,
    type,
    behaviour
  } = activity;
  this.id = id;
  this.type = type;
  this.loopCharacteristics = behaviour.loopCharacteristics && new behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  this.activity = activity;
  this.context = context;
  this.environment = activity.environment;
  this.broker = activity.broker;
  this.executionId = undefined;
  this[kExecutions] = [];
  this[kMessageHandlers] = {
    onApiRootMessage: this._onApiRootMessage.bind(this),
    onExecutionCompleted: this._onExecutionCompleted.bind(this)
  };
}
Object.defineProperty(SubProcessBehaviour.prototype, 'execution', {
  get() {
    return this[kExecutions][0];
  }
});
Object.defineProperty(SubProcessBehaviour.prototype, 'executions', {
  get() {
    return this[kExecutions].slice();
  }
});
SubProcessBehaviour.prototype.execute = function execute(executeMessage) {
  const content = executeMessage.content;
  let executionId = this.executionId;
  if (content.isRootScope) {
    executionId = this.executionId = content.executionId;
  }
  const loopCharacteristics = this.loopCharacteristics;
  if (loopCharacteristics && content.isRootScope) {
    this.broker.subscribeTmp('api', `activity.#.${executionId}`, this[kMessageHandlers].onApiRootMessage, {
      noAck: true,
      consumerTag: `_api-${executionId}`,
      priority: 200
    });
    return loopCharacteristics.execute(executeMessage);
  }
  const processExecution = this._upsertExecution(executeMessage);
  if (!processExecution) return;
  return processExecution.execute(executeMessage);
};
SubProcessBehaviour.prototype.stop = function stop() {
  for (const execution of this[kExecutions]) {
    this.broker.cancel(`_sub-process-execution-${execution.executionId}`);
    this.broker.cancel(`_sub-process-api-${execution.executionId}`);
    execution.stop();
  }
};
SubProcessBehaviour.prototype.discard = function discard() {
  for (const execution of this[kExecutions]) {
    this.broker.cancel(`_sub-process-execution-${execution.executionId}`);
    this.broker.cancel(`_sub-process-api-${execution.executionId}`);
    execution.discard();
  }
};
SubProcessBehaviour.prototype.getState = function getState() {
  if (this.loopCharacteristics) {
    return {
      executions: this[kExecutions].map(pe => {
        const state = pe.getState();
        state.environment = pe.environment.getState();
        return state;
      })
    };
  }
  const execution = this.execution;
  if (execution) {
    const state = execution.getState();
    state.environment = execution.environment.getState();
    return state;
  }
};
SubProcessBehaviour.prototype.recover = function recover(state) {
  if (!state) return;
  const executions = this[kExecutions];
  const loopCharacteristics = this.loopCharacteristics;
  if (loopCharacteristics && state.executions) {
    executions.splice(0);
    for (const se of state.executions) {
      this.recover(se);
    }
    return;
  }
  if (!loopCharacteristics) {
    executions.splice(0);
  }
  const subEnvironment = this.environment.clone().recover(state.environment);
  const subContext = this.context.clone(subEnvironment);
  const execution = new _ProcessExecution.default(this.activity, subContext).recover(state);
  executions.push(execution);
  return execution;
};
SubProcessBehaviour.prototype.getPostponed = function getPostponed() {
  return this[kExecutions].reduce((result, pe) => {
    result = result.concat(pe.getPostponed());
    return result;
  }, []);
};
SubProcessBehaviour.prototype._onApiRootMessage = function onApiRootMessage(_, message) {
  const messageType = message.properties.type;
  switch (messageType) {
    case 'stop':
      this.broker.cancel(message.fields.consumerTag);
      this.stop();
      break;
    case 'discard':
      this.broker.cancel(message.fields.consumerTag);
      this.discard();
      break;
  }
};
SubProcessBehaviour.prototype._upsertExecution = function upsertExecution(executeMessage) {
  const content = executeMessage.content;
  const executionId = content.executionId;
  let execution = this._getExecutionById(executionId);
  if (execution) {
    if (executeMessage.fields.redelivered) this._addListeners(execution, executionId);
    return execution;
  }
  const subEnvironment = this.environment.clone();
  const subContext = this.context.clone(subEnvironment);
  execution = new _ProcessExecution.default(this.activity, subContext);
  this[kExecutions].push(execution);
  this._addListeners(execution, executionId);
  return execution;
};
SubProcessBehaviour.prototype._addListeners = function addListeners(processExecution, executionId) {
  this.broker.subscribeTmp('subprocess-execution', `execution.#.${executionId}`, this[kMessageHandlers].onExecutionCompleted, {
    noAck: true,
    consumerTag: `_sub-process-execution-${executionId}`
  });
};
SubProcessBehaviour.prototype._onExecutionCompleted = function onExecutionCompleted(_, message) {
  if (message.fields.redelivered && message.properties.persistent === false) return;
  const content = message.content;
  const messageType = message.properties.type;
  const broker = this.broker;
  switch (messageType) {
    case 'stopped':
      {
        broker.cancel(message.fields.consumerTag);
        break;
      }
    case 'cancel':
    case 'discard':
      {
        broker.cancel(message.fields.consumerTag);
        broker.publish('execution', 'execute.' + messageType, (0, _messageHelper.cloneContent)(content));
        break;
      }
    case 'completed':
      {
        broker.cancel(message.fields.consumerTag);
        broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content));
        break;
      }
    case 'error':
      {
        broker.cancel(message.fields.consumerTag);
        const {
          error
        } = content;
        this.activity.logger.error(`<${this.id}>`, error);
        broker.publish('execution', 'execute.error', (0, _messageHelper.cloneContent)(content));
        break;
      }
  }
};
SubProcessBehaviour.prototype.getApi = function getApi(apiMessage) {
  const content = apiMessage.content;
  if (content.id === this.id) return;
  let execution;
  if (execution = this._getExecutionById(content.parent.executionId)) {
    return execution.getApi(apiMessage);
  }
  for (const pp of content.parent.path) {
    if (execution = this._getExecutionById(pp.executionId)) return execution.getApi(apiMessage);
  }
};
SubProcessBehaviour.prototype._getExecutionById = function getExecutionById(executionId) {
  return this[kExecutions].find(pe => pe.executionId === executionId);
};