"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SubProcess = SubProcess;
exports.SubProcessBehaviour = SubProcessBehaviour;
var _Activity = require("../activity/Activity.js");
var _ProcessExecution = require("../process/ProcessExecution.js");
var _messageHelper = require("../messageHelper.js");
const K_EXECUTIONS = Symbol.for('executions');
const K_ON_EXECUTION_COMPLETED = Symbol.for('execution completed handler');
function SubProcess(activityDef, context) {
  const triggeredByEvent = activityDef.behaviour && activityDef.behaviour.triggeredByEvent;
  const subProcess = new _Activity.Activity(SubProcessBehaviour, {
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
    const sequence = new _ProcessExecution.ProcessExecution(subProcess, context).shake(startId);
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

  /** @private */
  this[K_EXECUTIONS] = new Set();
  /** @private */
  this[K_ON_EXECUTION_COMPLETED] = this._onExecutionCompleted.bind(this);
}
Object.defineProperties(SubProcessBehaviour.prototype, {
  execution: {
    get() {
      return [...this[K_EXECUTIONS]][0];
    }
  },
  executions: {
    get() {
      return [...this[K_EXECUTIONS]];
    }
  }
});
SubProcessBehaviour.prototype.execute = function execute(executeMessage) {
  const {
    isRootScope,
    executionId
  } = executeMessage.content;
  if (isRootScope) {
    this.executionId = executionId;
  }
  const loopCharacteristics = this.loopCharacteristics;
  if (loopCharacteristics && isRootScope) {
    return loopCharacteristics.execute(executeMessage);
  }
  const processExecution = this._upsertExecution(executeMessage);
  return processExecution.execute(executeMessage);
};
SubProcessBehaviour.prototype.getState = function getState() {
  const states = [];
  for (const pe of this[K_EXECUTIONS]) {
    const state = pe.getState();
    state.environment = pe.environment.getState();
    states.push(state);
  }
  if (this.loopCharacteristics) {
    return {
      executions: states
    };
  }
  return states[0];
};
SubProcessBehaviour.prototype.recover = function recover(state) {
  if (!state) return;
  const executions = this[K_EXECUTIONS];
  const loopCharacteristics = this.loopCharacteristics;
  if (loopCharacteristics && state.executions) {
    executions.clear();
    for (const se of state.executions) {
      this.recover(se);
    }
    return;
  }
  if (!loopCharacteristics) {
    executions.clear();
  }
  const subEnvironment = this.environment.clone().recover(state.environment);
  const subContext = this.context.clone(subEnvironment, this.activity);
  const execution = new _ProcessExecution.ProcessExecution(this.activity, subContext).recover(state);
  executions.add(execution);
  return execution;
};
SubProcessBehaviour.prototype.getPostponed = function getPostponed() {
  let postponed = [];
  for (const pe of this[K_EXECUTIONS]) {
    postponed = postponed.concat(pe.getPostponed());
  }
  return postponed;
};
SubProcessBehaviour.prototype._upsertExecution = function upsertExecution(executeMessage) {
  const content = executeMessage.content;
  const executionId = content.executionId;
  let execution = this._getExecutionById(executionId);
  if (execution) {
    if (executeMessage.fields.redelivered) this._addListeners(executionId);
    return execution;
  }
  const subEnvironment = this.environment.clone();
  const subContext = this.context.clone(subEnvironment, this.activity);
  execution = new _ProcessExecution.ProcessExecution(this.activity, subContext);
  /** @private */
  this[K_EXECUTIONS].add(execution);
  this._addListeners(executionId);
  return execution;
};
SubProcessBehaviour.prototype._addListeners = function addListeners(executionId) {
  this.broker.subscribeTmp('subprocess-execution', `execution.#.${executionId}`, this[K_ON_EXECUTION_COMPLETED], {
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
        return broker.cancel(message.fields.consumerTag);
      }
    case 'completed':
    case 'cancel':
    case 'discard':
      {
        broker.cancel(message.fields.consumerTag);
        return this._completeExecution('execute.' + messageType, content);
      }
    case 'error':
      {
        broker.cancel(message.fields.consumerTag);
        const {
          error
        } = content;
        this.activity.logger.error(`<${this.id}>`, error);
        return this._completeExecution('execute.error', content);
      }
  }
};
SubProcessBehaviour.prototype._completeExecution = function completeExecution(completeRoutingKey, content) {
  if (this.loopCharacteristics) {
    const execution = this._getExecutionById(content.executionId);
    /** @private */
    this[K_EXECUTIONS].delete(execution);
  }
  this.broker.publish('execution', completeRoutingKey, (0, _messageHelper.cloneContent)(content));
};
SubProcessBehaviour.prototype.getApi = function getApi(apiMessage) {
  const content = apiMessage.content;
  if (content.id === this.id) return;
  let execution;
  if (execution = this._getExecutionById(content.parent.executionId)) {
    return execution.getApi(apiMessage);
  }
  if (!content.parent.path) return;
  for (const pp of content.parent.path) {
    if (execution = this._getExecutionById(pp.executionId)) return execution.getApi(apiMessage);
  }
};
SubProcessBehaviour.prototype._getExecutionById = function getExecutionById(executionId) {
  for (const pe of this[K_EXECUTIONS]) {
    if (pe.executionId === executionId) return pe;
  }
};