"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ActivityApi = ActivityApi;
exports.Api = Api;
exports.DefinitionApi = DefinitionApi;
exports.FlowApi = FlowApi;
exports.ProcessApi = ProcessApi;

var _messageHelper = require("./messageHelper");

var _shared = require("./shared");

function ActivityApi(broker, apiMessage, environment) {
  return new Api('activity', broker, apiMessage, environment);
}

function DefinitionApi(broker, apiMessage, environment) {
  return new Api('definition', broker, apiMessage, environment);
}

function ProcessApi(broker, apiMessage, environment) {
  return new Api('process', broker, apiMessage, environment);
}

function FlowApi(broker, apiMessage, environment) {
  return new Api('flow', broker, apiMessage, environment);
}

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

const proto = Api.prototype;

proto.cancel = function cancel(message, options) {
  this.sendApiMessage('cancel', {
    message
  }, options);
};

proto.discard = function discard() {
  this.sendApiMessage('discard');
};

proto.fail = function fail(error) {
  this.sendApiMessage('error', {
    error
  });
};

proto.signal = function signal(message, options) {
  this.sendApiMessage('signal', {
    message
  }, options);
};

proto.stop = function stop() {
  this.sendApiMessage('stop');
};

proto.resolveExpression = function resolveExpression(expression) {
  return this.environment.resolveExpression(expression, {
    fields: this.fields,
    content: this.content,
    properties: this.messageProperties
  }, this.owner);
};

proto.sendApiMessage = function sendApiMessage(action, content, options) {
  const correlationId = options && options.correlationId || (0, _shared.getUniqueId)(`${this.id || this.messagePrefix}_signal`);
  let key = `${this.messagePrefix}.${action}`;
  if (this.executionId) key += `.${this.executionId}`;
  this.broker.publish('api', key, this.createMessage(content), { ...options,
    correlationId,
    type: action
  });
};

proto.getPostponed = function getPostponed(...args) {
  if (this.owner.getPostponed) return this.owner.getPostponed(...args);
  if (this.owner.isSubProcess && this.owner.execution) return this.owner.execution.getPostponed(...args);
  return [];
};

proto.createMessage = function createMessage(content) {
  return { ...this.content,
    ...content
  };
};