import {cloneMessage} from './messageHelper';
import {getUniqueId} from './shared';

export {
  ActivityApi,
  DefinitionApi,
  ProcessApi,
  FlowApi,
  Api,
};

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

  const apiMessage = cloneMessage(sourceMessage);

  const {id, type, name, executionId} = apiMessage.content;
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

Api.prototype.cancel = function cancel(message, options) {
  this.sendApiMessage('cancel', {message}, options);
};

Api.prototype.discard = function discard() {
  this.sendApiMessage('discard');
};

Api.prototype.signal = function signal(message, options) {
  this.sendApiMessage('signal', {message}, options);
};

Api.prototype.stop = function stop() {
  this.sendApiMessage('stop');
};

Api.prototype.resolveExpression = function resolveExpression(expression) {
  return this.environment.resolveExpression(expression, {
    fields: this.fields,
    content: this.content,
    properties: this.messageProperties,
  }, this.owner);
};

Api.prototype.sendApiMessage = function sendApiMessage(action, content, options = {}) {
  if (!options.correlationId) options = {...options, correlationId: getUniqueId(`${this.id || this.messagePrefix}_signal`)};
  let key = `${this.messagePrefix}.${action}`;
  if (this.executionId) key += `.${this.executionId}`;
  this.broker.publish('api', key, this.createMessage(content), {...options, type: action});
};

Api.prototype.getPostponed = function getPostponed(...args) {
  if (this.owner.getPostponed) return this.owner.getPostponed(...args);
  if (this.owner.isSubProcess && this.owner.execution) return this.owner.execution.getPostponed(...args);
  return [];
};

Api.prototype.createMessage = function createMessage(content = {}) {
  return {
    ...this.content,
    ...content,
  };
};
