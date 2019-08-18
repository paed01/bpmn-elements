"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Association;

var _messageHelper = require("../messageHelper");

var _EventBroker = require("../EventBroker");

var _Api = require("../Api");

var _shared = require("../shared");

function Association(associationDef, {
  environment
}) {
  const {
    id,
    type = 'association',
    name,
    parent: originalParent,
    targetId,
    sourceId,
    behaviour = {}
  } = associationDef;
  const parent = (0, _messageHelper.cloneParent)(originalParent);
  const logger = environment.Logger(type.toLowerCase());
  const counters = {
    complete: 0,
    take: 0,
    discard: 0
  };
  const associationApi = {
    id,
    type,
    name,
    parent,
    behaviour,
    sourceId,
    targetId,
    isAssociation: true,
    environment,

    get counters() {
      return { ...counters
      };
    },

    complete,
    discard,
    getApi,
    getState,
    recover,
    stop,
    take
  };
  const {
    broker,
    on,
    once,
    waitFor
  } = (0, _EventBroker.EventBroker)(associationApi, {
    prefix: 'association',
    durable: true,
    autoDelete: false
  });
  associationApi.on = on;
  associationApi.once = once;
  associationApi.waitFor = waitFor;
  Object.defineProperty(associationApi, 'broker', {
    enumerable: true,
    get: () => broker
  });
  logger.debug(`<${id}> init, <${sourceId}> -> <${targetId}>`);
  return associationApi;

  function take(content = {}) {
    logger.debug(`<${id}> take target <${targetId}>`);
    ++counters.discard;
    publishEvent('take', content);
    return true;
  }

  function discard(content = {}) {
    logger.debug(`<${id}> discard target <${targetId}>`);
    ++counters.take;
    publishEvent('discard', content);
    return true;
  }

  function complete(content = {}) {
    logger.debug(`<${id}> completed target <${targetId}>`);
    ++counters.complete;
    publishEvent('complete', content);
    return true;
  }

  function publishEvent(action, content) {
    const eventContent = createMessageContent({
      action,
      message: content,
      sequenceId: (0, _shared.getUniqueId)(id)
    });
    broker.publish('event', `association.${action}`, eventContent, {
      type: action
    });
  }

  function createMessageContent(override = {}) {
    return { ...override,
      id,
      type,
      name,
      sourceId,
      targetId,
      isAssociation: true,
      parent: (0, _messageHelper.cloneParent)(parent)
    };
  }

  function getState() {
    const result = {
      id,
      type,
      name,
      sourceId,
      targetId,
      counters: { ...counters
      }
    };
    result.broker = broker.getState();
    return result;
  }

  function recover(state) {
    Object.assign(counters, state.counters);
    broker.recover(state.broker);
  }

  function getApi(message) {
    return (0, _Api.FlowApi)(broker, message || {
      content: createMessageContent()
    });
  }

  function stop() {
    broker.stop();
  }
}