"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = MessageFlow;

var _shared = require("../shared");

var _messageHelper = require("../messageHelper");

var _EventBroker = require("../EventBroker");

function MessageFlow(flowDef, context) {
  const {
    id,
    type = 'message',
    name,
    target,
    source,
    behaviour,
    parent
  } = flowDef;
  const sourceElement = context.getActivityById(source.id) || context.getProcessById(source.processId);
  const sourceEndConsumerTag = `_message-on-end-${(0, _shared.brokerSafeId)(id)}`;
  const sourceMessageConsumerTag = `_message-on-message-${(0, _shared.brokerSafeId)(id)}`;
  const {
    debug
  } = context.environment.Logger(type.toLowerCase());
  if (!sourceElement) return;
  const counters = {
    messages: 0,
    discard: 0
  };
  const flowApi = {
    id,
    type,
    name,
    target,
    source,
    behaviour,

    get counters() {
      return { ...counters
      };
    },

    activate,
    deactivate,
    getApi,
    getState,
    recover,
    resume,
    stop
  };
  const {
    broker,
    on,
    once,
    emit,
    waitFor
  } = (0, _EventBroker.MessageFlowBroker)(flowApi);
  flowApi.on = on;
  flowApi.once = once;
  flowApi.emit = emit;
  flowApi.waitFor = waitFor;
  Object.defineProperty(flowApi, 'broker', {
    enumerable: true,
    get: () => broker
  });
  return flowApi;

  function onSourceEnd({
    content
  }) {
    ++counters.messages;
    debug(`<${id}> sending message from <${source.processId}.${source.id}> to`, target.id ? `<${target.processId}.${target.id}>` : `<${target.processId}>`);
    broker.publish('event', 'message.outbound', createMessage(content.message));
  }

  function onSourceMessage() {
    deactivate();
  }

  function createMessage(message) {
    return {
      id,
      type,
      name,
      source: { ...source
      },
      target: { ...target
      },
      parent: parent && (0, _messageHelper.cloneParent)(parent),
      message
    };
  }

  function stop() {
    deactivate();
    broker.stop();
  }

  function getState() {
    return {
      id,
      type,
      counters: { ...counters
      }
    };
  }

  function recover(state) {
    Object.assign(counters, state.counters);
    broker.recover(state.broker);
  }

  function resume() {
    broker.resume();
  }

  function getApi() {
    return flowApi;
  }

  function activate() {
    sourceElement.on('message', onSourceMessage, {
      consumerTag: sourceMessageConsumerTag
    });
    sourceElement.on('end', onSourceEnd, {
      consumerTag: sourceEndConsumerTag
    });
  }

  function deactivate() {
    sourceElement.broker.cancel(sourceMessageConsumerTag);
    sourceElement.broker.cancel(sourceEndConsumerTag);
  }
}