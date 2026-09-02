import { Activity } from '../activity/Activity.js';
import { ProcessExecution } from '../process/ProcessExecution.js';
import { cloneContent, cloneMessage } from '../messageHelper.js';

const K_EXECUTIONS = Symbol.for('executions');
const K_ON_EXECUTION_COMPLETED = Symbol.for('execution completed handler');

/**
 * Sub process
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 * @param {import('#types').IActivityBehaviour} [Behaviour] behaviour class, defaults to {@link SubProcessBehaviour}
 */
export function SubProcess(activityDef, context, Behaviour = SubProcessBehaviour) {
  const triggeredByEvent = activityDef.behaviour && activityDef.behaviour.triggeredByEvent;
  const subProcess = new Activity(Behaviour, { ...activityDef, isSubProcess: true, triggeredByEvent }, context);

  // @ts-ignore
  subProcess.getStartActivities = function getStartActivities(filterOptions) {
    return context.getStartActivities(filterOptions, activityDef.id);
  };

  subProcess.broker.cancel('_api-shake');
  subProcess.broker.subscribeTmp('api', 'activity.shake.*', onShake, { noAck: true, consumerTag: '_api-shake' });

  return subProcess;

  function onShake(_, message) {
    const { startId } = message.content;
    const last = message.content.sequence.pop();
    const sequence = new ProcessExecution(subProcess, context).shake(startId);
    message.content.sequence.push({ ...last, isSubProcess: true, sequence });
  }
}

/**
 * Sub process behaviour
 * @param {import('#types').Activity} activity
 * @param {import('#types').ContextInstance} context
 */
export function SubProcessBehaviour(activity, context) {
  const { id, type, behaviour } = activity;
  this.id = id;
  this.type = type;
  /** @type {import('./LoopCharacteristics.js').LoopCharacteristics | undefined} */
  this.loopCharacteristics =
    behaviour.loopCharacteristics && new behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  this.activity = activity;
  this.context = context;
  this.environment = activity.environment;
  this.broker = activity.broker;
  this.executionId = undefined;

  /** @internal */
  this[K_EXECUTIONS] = new Set();
  /** @internal */
  this[K_ON_EXECUTION_COMPLETED] = this._onExecutionCompleted.bind(this);
}

Object.defineProperty(SubProcessBehaviour.prototype, 'execution', {
  /** @return {import('../process/ProcessExecution.js').ProcessExecution | undefined} */
  get() {
    return [...this[K_EXECUTIONS]][0];
  },
});

Object.defineProperty(SubProcessBehaviour.prototype, 'executions', {
  /** @return {import('../process/ProcessExecution.js').ProcessExecution[]} */
  get() {
    return [...this[K_EXECUTIONS]];
  },
});

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
SubProcessBehaviour.prototype.execute = function execute(executeMessage) {
  const { isRootScope, executionId } = executeMessage.content;

  if (isRootScope) {
    this.executionId = executionId;
  }

  const loopCharacteristics = this.loopCharacteristics;
  if (loopCharacteristics && isRootScope) {
    return loopCharacteristics.execute(executeMessage);
  }

  // Forward the multi-instance loop context as input to the sub process execution; any current content input takes precedence.
  let message = executeMessage;
  const content = executeMessage.content;
  if (content.isMultiInstance) {
    const input = {
      isSequential: content.isSequential,
      index: content.index,
      cardinality: content.loopCardinality,
    };
    const elementVariable = loopCharacteristics?.elementVariable;
    if (elementVariable && elementVariable in content) {
      input[elementVariable] = content[elementVariable];
    }
    message = cloneMessage(executeMessage, { input: { ...input, ...content.input } });
  }

  const processExecution = this._upsertExecution(message);
  return processExecution.execute(message);
};

/**
 * Get SubProcess state
 * @returns {import('#types').ProcessExecutionState[]}
 */
SubProcessBehaviour.prototype.getState = function getState() {
  const states = [];
  for (const pe of this[K_EXECUTIONS]) {
    const state = pe.getState();
    state.environment = pe.environment.getState();
    states.push(state);
  }

  if (this.loopCharacteristics) {
    return {
      // @ts-ignore
      executions: states,
    };
  }

  return states[0];
};

/**
 * Recover SubProcess
 * @param {import('#types').ProcessExecutionState[]} [state]
 */
SubProcessBehaviour.prototype.recover = function recover(state) {
  if (!state) return;

  const executions = this[K_EXECUTIONS];

  const loopCharacteristics = this.loopCharacteristics;
  // @ts-ignore
  if (loopCharacteristics && state.executions) {
    executions.clear();
    // @ts-ignore
    for (const se of state.executions) {
      this.recover(se);
    }
    return;
  }

  if (!loopCharacteristics) {
    executions.clear();
  }

  // @ts-ignore
  const subEnvironment = this.environment.clone().recover(state.environment);
  const subContext = this.context.clone(subEnvironment, this.activity);

  // @ts-ignore
  const execution = new ProcessExecution(this.activity, subContext).recover(state);

  executions.add(execution);
};

/**
 * @returns {ReturnType<import('../process/ProcessExecution.js').ProcessExecution['getPostponed']>}
 */
SubProcessBehaviour.prototype.getPostponed = function getPostponed() {
  let postponed = [];
  for (const pe of this[K_EXECUTIONS]) {
    postponed = postponed.concat(pe.getPostponed());
  }
  return postponed;
};

/**
 * @param {import('#types').ElementBrokerMessage} apiMessage
 * @returns {import('#types').IApi<this> | undefined}
 */
SubProcessBehaviour.prototype.getApi = function getApi(apiMessage) {
  const content = apiMessage.content;

  if (content.id === this.id) return;

  let execution;
  if ((execution = this._getExecutionById(content.parent.executionId))) {
    return execution.getApi(apiMessage);
  }

  if (!content.parent.path) return;

  for (const pp of content.parent.path) {
    if ((execution = this._getExecutionById(pp.executionId))) return execution.getApi(apiMessage);
  }
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

  execution = new ProcessExecution(this.activity, subContext);
  this[K_EXECUTIONS].add(execution);

  this._addListeners(executionId);

  return execution;
};

SubProcessBehaviour.prototype._addListeners = function addListeners(executionId) {
  this.broker.subscribeTmp('subprocess-execution', `execution.#.${executionId}`, this[K_ON_EXECUTION_COMPLETED], {
    noAck: true,
    consumerTag: `_sub-process-execution-${executionId}`,
  });
};

SubProcessBehaviour.prototype._onExecutionCompleted = function onExecutionCompleted(_, message) {
  if (message.fields.redelivered && message.properties.persistent === false) return;

  const content = message.content;
  const messageType = message.properties.type;
  const broker = this.broker;

  switch (messageType) {
    case 'stopped': {
      return broker.cancel(message.fields.consumerTag);
    }
    case 'completed':
    case 'cancel':
    case 'discard': {
      broker.cancel(message.fields.consumerTag);
      return this._completeExecution('execute.' + messageType, content);
    }
    case 'error': {
      broker.cancel(message.fields.consumerTag);

      const { error } = content;
      this.activity.logger.error(`<${this.id}>`, error);

      return this._completeExecution('execute.error', content);
    }
  }
};

SubProcessBehaviour.prototype._completeExecution = function completeExecution(completeRoutingKey, content) {
  if (this.loopCharacteristics) {
    const execution = this._getExecutionById(content.executionId);
    this[K_EXECUTIONS].delete(execution);
  }

  this.broker.publish('execution', completeRoutingKey, cloneContent(content));
};

SubProcessBehaviour.prototype._getExecutionById = function getExecutionById(executionId) {
  for (const pe of this[K_EXECUTIONS]) {
    if (pe.executionId === executionId) return pe;
  }
};
