"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ActivityApi = ActivityApi;
exports.Api = Api;
exports.DefinitionApi = DefinitionApi;
exports.FlowApi = FlowApi;
exports.ProcessApi = ProcessApi;
var _messageHelper = require("./messageHelper.js");
var _shared = require("./shared.js");
/**
 * Build an activity-scoped Api wrapper. Routing keys are published under `activity.*`.
 * @param {any} broker
 * @param {import('types').ElementBrokerMessage} apiMessage
 * @param {import('types').Environment} [environment]
 */
function ActivityApi(broker, apiMessage, environment) {
  return new Api('activity', broker, apiMessage, environment);
}

/**
 * Build a definition-scoped Api wrapper. Routing keys are published under `definition.*`.
 * @param {any} broker
 * @param {import('types').ElementBrokerMessage} apiMessage
 * @param {import('types').Environment} [environment]
 */
function DefinitionApi(broker, apiMessage, environment) {
  return new Api('definition', broker, apiMessage, environment);
}

/**
 * Build a process-scoped Api wrapper. Routing keys are published under `process.*`.
 * @param {any} broker
 * @param {import('types').ElementBrokerMessage} apiMessage
 * @param {import('types').Environment} [environment]
 */
function ProcessApi(broker, apiMessage, environment) {
  return new Api('process', broker, apiMessage, environment);
}

/**
 * Build a flow-scoped Api wrapper. Routing keys are published under `flow.*`.
 * @param {any} broker
 * @param {import('types').ElementBrokerMessage} apiMessage
 * @param {import('types').Environment} [environment]
 */
function FlowApi(broker, apiMessage, environment) {
  return new Api('flow', broker, apiMessage, environment);
}

/**
 * Lightweight wrapper over the broker that exposes signal/cancel/fail/stop and other api actions.
 * @param {string} pfx Message prefix, e.g. `activity`, `process`, `definition`, `flow`
 * @param {any} broker
 * @param {import('types').ElementBrokerMessage} sourceMessage Cloned to back the api
 * @param {import('types').Environment} [environment] Defaults to `broker.owner.environment`
 * @throws {Error} when sourceMessage is missing
 */
function Api(pfx, broker, sourceMessage, environment) {
  if (!sourceMessage) throw new Error('Api requires message');
  const apiMessage = (0, _messageHelper.cloneMessage)(sourceMessage);
  const {
    id,
    type,
    name,
    executionId
  } = apiMessage.content;
  this.id = id;
  this.type = type;
  this.name = name;
  this.executionId = executionId;
  this.environment = environment || broker.owner.environment;
  this.content = apiMessage.content;
  this.fields = apiMessage.fields;
  this.messageProperties = apiMessage.properties;
  this.broker = broker;
  this.owner = broker.owner;
  this.messagePrefix = pfx;
}

/**
 * Send a cancel api message.
 * @param {import('types').signalMessage} [message]
 * @param {any} [options]
 */
Api.prototype.cancel = function cancel(message, options) {
  this.sendApiMessage('cancel', {
    message
  }, options);
};

/**
 * Send a discard api message.
 */
Api.prototype.discard = function discard() {
  this.sendApiMessage('discard');
};

/**
 * Send an error api message that fails the activity.
 * @param {Error} error
 */
Api.prototype.fail = function fail(error) {
  this.sendApiMessage('error', {
    error
  });
};

/**
 * Send a signal api message.
 * @param {import('types').signalMessage} [message]
 * @param {any} [options]
 */
Api.prototype.signal = function signal(message, options) {
  this.sendApiMessage('signal', {
    message
  }, options);
};

/**
 * Send a stop api message.
 */
Api.prototype.stop = function stop() {
  this.sendApiMessage('stop');
};

/**
 * Resolve an expression with the api message as scope and the broker owner as context.
 * @param {string} expression
 */
Api.prototype.resolveExpression = function resolveExpression(expression) {
  return this.environment.resolveExpression(expression, {
    fields: this.fields,
    content: this.content,
    properties: this.messageProperties
  }, this.owner);
};

/**
 * Publish a custom api message to the broker.
 * @param {string} action Routing key suffix, e.g. `signal`, `cancel`
 * @param {import('types').signalMessage} [content] Merged into the message content
 * @param {any} [options]
 */
Api.prototype.sendApiMessage = function sendApiMessage(action, content, options) {
  const correlationId = options?.correlationId || (0, _shared.getUniqueId)(`${this.id || this.messagePrefix}_signal`);
  let key = `${this.messagePrefix}.${action}`;
  if (this.executionId) key += `.${this.executionId}`;
  this.broker.publish('api', key, this.createMessage(content), {
    ...options,
    correlationId,
    type: action
  });
};

/**
 * List currently postponed activities, falling back to a sub-process execution when applicable.
 * @param {import('types').filterPostponed} [filterFn]
 */
Api.prototype.getPostponed = function getPostponed(...args) {
  if (this.owner.getPostponed) return this.owner.getPostponed(...args);
  if (this.owner.isSubProcess && this.owner.execution) return this.owner.execution.getPostponed(...args);
  return [];
};

/**
 * Build a message body by merging the given content onto the source content.
 * @param {Record<string, any>} [content]
 */
Api.prototype.createMessage = function createMessage(content) {
  return {
    ...this.content,
    ...content
  };
};