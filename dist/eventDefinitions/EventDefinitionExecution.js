"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventDefinitionExecution = EventDefinitionExecution;
var _messageHelper = require("../messageHelper.js");
var _constants = require("../constants.js");
const K_PARALLEL = Symbol.for('parallel multiple');
const K_COMPLETED_DEFS = Symbol.for('completed definitions');

/**
 * Event definition execution orchestrator. Drives a sequence of event definitions for the
 * activity and publishes the completed routing key when the last definition completes.
 * @param {import('#types').Activity} activity
 * @param {import('#types').EventDefinition[]} eventDefinitions
 * @param {string} [completedRoutingKey] Routing key to publish on completion, defaults to `execute.completed`
 */
function EventDefinitionExecution(activity, eventDefinitions, completedRoutingKey = 'execute.completed') {
  this.id = activity.id;
  this.activity = activity;
  this.broker = activity.broker;
  this.eventDefinitions = eventDefinitions;
  this.completedRoutingKey = completedRoutingKey;
  /** @internal */
  this[_constants.K_COMPLETED] = false;
  /** @internal */
  this[_constants.K_STOPPED] = false;
  /** @internal */
  this[_constants.K_EXECUTE_MESSAGE] = null;
  // ParallelMultiple event: complete only once every event definition has fired.
  /** @internal */
  this[K_PARALLEL] = eventDefinitions.length > 1 && !!activity.behaviour?.parallelMultiple;
  /** @internal */
  this[K_COMPLETED_DEFS] = new Set();
}
Object.defineProperty(EventDefinitionExecution.prototype, 'completed', {
  get() {
    return this[_constants.K_COMPLETED];
  }
});
Object.defineProperty(EventDefinitionExecution.prototype, 'stopped', {
  get() {
    return this[_constants.K_STOPPED];
  }
});

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
EventDefinitionExecution.prototype.execute = function execute(executeMessage) {
  const content = executeMessage.content;
  if (content.isDefinitionScope) return this._executeDefinition(executeMessage);
  if (!content.isRootScope) return;
  const broker = this.broker;
  this[_constants.K_EXECUTE_MESSAGE] = executeMessage;
  const executionId = content.executionId;

  // On resume the redelivered root carries the definitions that completed before the stop.
  if (this[K_PARALLEL] && Array.isArray(content.completedDefinitions)) {
    for (const completedIndex of content.completedDefinitions) this[K_COMPLETED_DEFS].add(completedIndex);
  }
  broker.subscribeTmp('execution', 'execute.#', this._onExecuteMessage.bind(this), {
    noAck: true,
    consumerTag: '_eventdefinition-execution-execute-tag',
    priority: 300
  });
  broker.subscribeTmp('api', `activity.*.${executionId}`, this._onApiMessage.bind(this), {
    noAck: true,
    consumerTag: '_eventdefinition-execution-api-tag',
    priority: 300
  });
  broker.publish('execution', 'execute.update', (0, _messageHelper.cloneContent)(content, {
    preventComplete: true
  }));
  if (executeMessage.fields.redelivered) return;
  const parent = (0, _messageHelper.unshiftParent)(content.parent, content);
  const eventDefinitions = this.eventDefinitions;
  for (let index = 0; index < eventDefinitions.length; ++index) {
    if (this[_constants.K_COMPLETED]) break;
    if (this[_constants.K_STOPPED]) break;
    const ed = eventDefinitions[index];
    const edExecutionId = `${executionId}_${index}`;
    this._debug(executionId, `start event definition ${ed.type}, index ${index}`);
    const edContent = (0, _messageHelper.cloneContent)(content, {
      isRootScope: undefined,
      type: ed.type,
      executionId: edExecutionId,
      isDefinitionScope: true,
      index
    });
    edContent.parent = (0, _messageHelper.cloneParent)(parent);
    broker.publish('execution', 'execute.start', edContent);
  }
};
EventDefinitionExecution.prototype._onApiMessage = function onApiMessage(_, message) {
  const messageType = message.properties.type;
  switch (messageType) {
    case 'stop':
    case 'discard':
      return this._stop();
  }
};
EventDefinitionExecution.prototype._onExecuteMessage = function onExecuteMessage(routingKey, message) {
  switch (routingKey) {
    case 'execute.completed':
      {
        if (message.content.isDefinitionScope && this[K_PARALLEL]) return this._onDefinitionCompleted(message);
        this._stop();
        if (message.content.isDefinitionScope) return this._complete(message);
        break;
      }
    case 'execute.discard':
      {
        const {
          executionId,
          isDefinitionScope
        } = message.content;
        if (isDefinitionScope) {
          this._debug(executionId, `event definition ${message.content.type} discarded, index ${message.content.index}`);
          break;
        }
        this._stop();
        this._debug(executionId, 'event definition parent execution discarded');
        break;
      }
  }
};

/**
 * ParallelMultiple: track fired definitions and complete only once all have fired.
 * @param {import('#types').ElementBrokerMessage} message
 */
EventDefinitionExecution.prototype._onDefinitionCompleted = function onDefinitionCompleted(message) {
  const completed = this[K_COMPLETED_DEFS];
  const index = message.content.index;
  if (completed.has(index)) return;
  completed.add(index);
  if (completed.size < this.eventDefinitions.length) {
    // Persist progress onto the still-postponed root scope so a stop/resume resumes the wait.
    return this.broker.publish('execution', 'execute.update', (0, _messageHelper.cloneContent)(this[_constants.K_EXECUTE_MESSAGE].content, {
      preventComplete: true,
      completedDefinitions: [...completed]
    }));
  }
  this._stop();
  return this._complete(message);
};
EventDefinitionExecution.prototype._complete = function complete(message) {
  const {
    executionId,
    type,
    index,
    parent
  } = message.content;
  this[_constants.K_COMPLETED] = true;
  this._debug(executionId, `event definition ${type} completed, index ${index}`);
  const completeContent = (0, _messageHelper.cloneContent)(message.content, {
    executionId: this[_constants.K_EXECUTE_MESSAGE].content.executionId,
    isRootScope: true,
    isDefinitionScope: undefined
  });
  completeContent.parent = (0, _messageHelper.shiftParent)(parent);
  this.broker.publish('execution', this.completedRoutingKey, completeContent, {
    correlationId: message.properties.correlationId
  });
};
EventDefinitionExecution.prototype._executeDefinition = function executeDefinition(message) {
  const {
    executionId,
    index
  } = message.content;
  const ed = this.eventDefinitions[index];
  if (!ed) return this.activity.logger.warn(`<${executionId} (${this.id})> found no event definition on index ${index}`);
  this._debug(executionId, `execute event definition ${ed.type}, index ${index}`);
  ed.execute(message);
};
EventDefinitionExecution.prototype._stop = function stop() {
  this[_constants.K_STOPPED] = true;
  this.broker.cancel('_eventdefinition-execution-execute-tag');
  this.broker.cancel('_eventdefinition-execution-api-tag');
};
EventDefinitionExecution.prototype._debug = function debug(executionId, msg) {
  this.activity.logger.debug(`<${executionId} (${this.id})> ${msg}`);
};