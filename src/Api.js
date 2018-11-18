import {cloneMessage} from './messageHelper';

export {
  ActivityApi,
  DefinitionApi,
  ProcessApi
};

function ActivityApi(broker, apiMessage, environment) {
  return Api('activity', broker, apiMessage, environment);
}

function DefinitionApi(broker, apiMessage, environment) {
  return Api('definition', broker, apiMessage, environment);
}

function ProcessApi(broker, apiMessage, environment) {
  return Api('process', broker, apiMessage, environment);
}

function Api(pfx, broker, sourceMessage, environment) {
  if (!sourceMessage) throw new Error('Api requires message');

  const apiMessage = cloneMessage(sourceMessage);
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
    signal(message) {
      sendApiMessage('signal', {message});
    },
    stop() {
      sendApiMessage('stop');
    },
    resolveExpression(expression) {
      return environment.resolveExpression(expression, apiMessage, broker.owner);
    },
    createMessage,
  };

  function sendApiMessage(action, content) {
    let key = `${pfx}.${action}`;
    if (executionId) key += `.${executionId}`;
    broker.publish('api', key, createMessage(content), {type: action});
  }

  function createMessage(content = {}) {
    return {
      ...apiContent,
      ...content,
    };
  }
}
