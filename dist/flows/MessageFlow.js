"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = MessageFlow;
var _shared = require("../shared.js");
var _messageHelper = require("../messageHelper.js");
var _EventBroker = require("../EventBroker.js");
const kCounters = Symbol.for('counters');
const kSourceElement = Symbol.for('sourceElement');
function MessageFlow(flowDef, context) {
  const {
    id,
    type = 'messageflow',
    name,
    target,
    source,
    behaviour,
    parent
  } = flowDef;
  this.id = id;
  this.type = type;
  this.name = name;
  this.parent = (0, _messageHelper.cloneParent)(parent);
  this.source = source;
  this.target = target;
  this.behaviour = behaviour;
  this.environment = context.environment;
  this.context = context;
  this[kCounters] = {
    messages: 0
  };
  const {
    broker,
    on,
    once,
    emit,
    waitFor
  } = (0, _EventBroker.MessageFlowBroker)(this);
  this.broker = broker;
  this.on = on;
  this.once = once;
  this.emit = emit;
  this.waitFor = waitFor;
  this[kSourceElement] = context.getActivityById(source.id) || context.getProcessById(source.processId);
  this.logger = context.environment.Logger(type.toLowerCase());
}
const proto = MessageFlow.prototype;
Object.defineProperty(proto, 'counters', {
  enumerable: true,
  get() {
    return {
      ...this[kCounters]
    };
  }
});
proto.getState = function getState() {
  return {
    id: this.id,
    type: this.type,
    counters: this.counters
  };
};
proto.recover = function recover(state) {
  Object.assign(this[kCounters], state.counters);
};
proto.getApi = function getApi() {
  return this;
};
proto.activate = function activate() {
  const sourceElement = this[kSourceElement];
  const safeId = (0, _shared.brokerSafeId)(this.id);
  sourceElement.on('message', this.deactivate.bind(this), {
    consumerTag: `_message-on-message-${safeId}`
  });
  sourceElement.on('end', this._onSourceEnd.bind(this), {
    consumerTag: `_message-on-end-${safeId}`
  });
};
proto.deactivate = function deactivate() {
  const sourceElement = this[kSourceElement];
  const safeId = (0, _shared.brokerSafeId)(this.id);
  sourceElement.broker.cancel(`_message-on-end-${safeId}`);
  sourceElement.broker.cancel(`_message-on-message-${safeId}`);
};
proto._onSourceEnd = function onSourceEnd({
  content
}) {
  ++this[kCounters].messages;
  const source = this.source;
  const target = this.target;
  this.logger.debug(`<${this.id}> sending message from <${source.processId}.${source.id}> to <${target.id ? `${target.processId}.${target.id}` : target.processId}>`);
  this.broker.publish('event', 'message.outbound', this._createMessage(content.message));
};
proto._createMessage = function createMessage(message) {
  return {
    id: this.id,
    type: this.type,
    name: this.name,
    source: {
      ...this.source
    },
    target: {
      ...this.target
    },
    parent: (0, _messageHelper.cloneParent)(this.parent),
    message
  };
};