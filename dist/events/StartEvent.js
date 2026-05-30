"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.StartEvent = StartEvent;
exports.StartEventBehaviour = StartEventBehaviour;
var _Activity = require("../activity/Activity.js");
var _EventDefinitionExecution = require("../eventDefinitions/EventDefinitionExecution.js");
var _messageHelper = require("../messageHelper.js");
var _constants = require("../constants.js");
/**
 * Start event
 * @param {import('moddle-context-serializer').Activity} activityDef
 * @param {import('#types').ContextInstance} context
 */
function StartEvent(activityDef, context) {
  return new _Activity.Activity(StartEventBehaviour, activityDef, context);
}

/**
 * Start event behaviour
 * @param {import('#types').Activity} activity
 */
function StartEventBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.activity = activity;
  this.broker = activity.broker;
  this[_constants.K_EXECUTION] = activity.eventDefinitions && new _EventDefinitionExecution.EventDefinitionExecution(activity, activity.eventDefinitions);
}
Object.defineProperty(StartEventBehaviour.prototype, 'executionId', {
  get() {
    return this[_constants.K_EXECUTE_MESSAGE]?.content.executionId;
  }
});

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
StartEventBehaviour.prototype.execute = function execute(executeMessage) {
  const execution = this[_constants.K_EXECUTION];
  if (execution) {
    return execution.execute(executeMessage);
  }
  const content = (0, _messageHelper.cloneContent)(executeMessage.content);
  const broker = this.broker;
  if (!content.form) {
    return broker.publish('execution', 'execute.completed', content);
  }
  const executionId = content.executionId;
  this[_constants.K_EXECUTE_MESSAGE] = executeMessage;
  broker.subscribeTmp('api', `activity.#.${executionId}`, (...args) => this._onApiMessage(...args), {
    noAck: true,
    consumerTag: `_api-${executionId}`,
    priority: 300
  });
  broker.subscribeTmp('api', '#.signal.*', (...args) => this._onDelegatedApiMessage(...args), {
    noAck: true,
    consumerTag: `_api-delegated-${executionId}`
  });
  broker.publish('event', 'activity.wait', {
    ...content,
    executionId,
    state: 'wait'
  });
};
StartEventBehaviour.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  const {
    type: messageType,
    correlationId
  } = message.properties;
  switch (messageType) {
    case 'stop':
      return this._stop();
    case 'signal':
      {
        this._stop();
        const content = this[_constants.K_EXECUTE_MESSAGE].content;
        return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content, {
          output: message.content.message,
          state: 'signal'
        }), {
          correlationId
        });
      }
    case 'discard':
      {
        this._stop();
        const content = this[_constants.K_EXECUTE_MESSAGE].content;
        return this.broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(content), {
          correlationId
        });
      }
  }
};
StartEventBehaviour.prototype._onDelegatedApiMessage = function onDelegatedApiMessage(routingKey, message) {
  if (!message.properties.delegate) return;
  const content = message.content;
  if (!content.message) return;
  const {
    id: signalId,
    executionId: signalExecutionId
  } = content.message;
  if (signalId !== this.id && signalExecutionId !== this.executionId) return;
  const {
    type,
    correlationId
  } = message.properties;
  const executeContent = this[_constants.K_EXECUTE_MESSAGE].content;
  this.broker.publish('event', 'activity.consumed', (0, _messageHelper.cloneContent)(executeContent, {
    message: {
      ...content.message
    }
  }), {
    correlationId,
    type
  });
  return this._onApiMessage(routingKey, message);
};
StartEventBehaviour.prototype._stop = function stop() {
  const broker = this.broker,
    executionId = this.executionId;
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_api-delegated-${executionId}`);
};