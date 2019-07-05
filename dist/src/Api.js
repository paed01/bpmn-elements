"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ActivityApi = ActivityApi;
exports.DefinitionApi = DefinitionApi;
exports.ProcessApi = ProcessApi;
exports.FlowApi = FlowApi;

var _messageHelper = require("./messageHelper");

function ActivityApi(broker, apiMessage, environment) {
  return Api('activity', broker, apiMessage, environment);
}

function DefinitionApi(broker, apiMessage, environment) {
  return Api('definition', broker, apiMessage, environment);
}

function ProcessApi(broker, apiMessage, environment) {
  return Api('process', broker, apiMessage, environment);
}

function FlowApi(broker, apiMessage, environment) {
  return Api('flow', broker, apiMessage, environment);
}

function Api(pfx, broker, sourceMessage, environment) {
  if (!sourceMessage) throw new Error('Api requires message');
  const apiMessage = (0, _messageHelper.cloneMessage)(sourceMessage);
  const apiContent = apiMessage.content;
  const executionId = apiContent.executionId;
  environment = environment || broker.owner.environment;
  return {
    id: apiContent.id,
    type: apiContent.type,
    executionId,
    environment,
    fields: apiMessage.fields,
    content: apiContent,
    messageProperties: apiMessage.properties,

    get owner() {
      return broker.owner;
    },

    cancel() {
      sendApiMessage('cancel');
    },

    discard() {
      sendApiMessage('discard');
    },

    signal(message, options) {
      sendApiMessage('signal', {
        message
      }, options);
    },

    stop() {
      sendApiMessage('stop');
    },

    resolveExpression(expression) {
      return environment.resolveExpression(expression, apiMessage, broker.owner);
    },

    createMessage
  };

  function sendApiMessage(action, content, options = {}) {
    let key = `${pfx}.${action}`;
    if (executionId) key += `.${executionId}`;
    broker.publish('api', key, createMessage(content), { ...options,
      type: action
    });
  }

  function createMessage(content = {}) {
    return { ...apiContent,
      ...content
    };
  }
}