"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = MessageFlow;

var _EventBroker = require("../EventBroker");

var _messageHelper = require("../messageHelper");

function MessageFlow(flowDef, context) {
  const {
    id,
    type = 'message',
    target,
    source,
    behaviour,
    parent
  } = flowDef;
  const sourceActivity = context.getActivityById(source.id);
  if (!sourceActivity) return;
  const counters = {
    messages: 0,
    discard: 0
  };
  const flowApi = {
    id,
    type,
    target,
    source,
    behaviour,

    get counters() {
      return { ...counters
      };
    },

    getApi,
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
  } = (0, _EventBroker.MessageFlowBroker)(flowApi, {
    prefix: 'messageflow',
    durable: true,
    autoDelete: false
  });
  flowApi.on = on;
  flowApi.once = once;
  flowApi.emit = emit;
  flowApi.waitFor = waitFor;
  Object.defineProperty(flowApi, 'broker', {
    enumerable: true,
    get: () => broker
  });
  sourceActivity.broker.subscribeTmp('event', 'activity.end', onSourceEnd, {
    noAck: true
  });
  return flowApi;

  function onSourceEnd(routingKey, message) {
    ++counters.messages;
    broker.publish('event', 'message.outbound', createMessage((0, _messageHelper.cloneContent)(message.content)));
  }

  function createMessage(message) {
    return {
      id,
      type,
      source: { ...source
      },
      target: { ...target
      },
      parent: parent && (0, _messageHelper.cloneParent)(parent),
      message
    };
  }

  function stop() {
    broker.stop();
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
}