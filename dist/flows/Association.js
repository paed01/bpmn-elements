"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Association;
var _messageHelper = require("../messageHelper.js");
var _EventBroker = require("../EventBroker.js");
var _Api = require("../Api.js");
var _shared = require("../shared.js");
const kCounters = Symbol.for('counters');
function Association(associationDef, {
  environment
}) {
  const {
    id,
    type = 'association',
    name,
    parent,
    targetId,
    sourceId,
    behaviour = {}
  } = associationDef;
  this.id = id;
  this.type = type;
  this.name = name;
  this.parent = (0, _messageHelper.cloneParent)(parent);
  this.behaviour = behaviour;
  this.sourceId = sourceId;
  this.targetId = targetId;
  this.isAssociation = true;
  this.environment = environment;
  const logger = this.logger = environment.Logger(type.toLowerCase());
  this[kCounters] = {
    complete: 0,
    take: 0,
    discard: 0
  };
  const {
    broker,
    on,
    once,
    waitFor
  } = new _EventBroker.EventBroker(this, {
    prefix: 'association',
    durable: true,
    autoDelete: false
  });
  this.broker = broker;
  this.on = on;
  this.once = once;
  this.waitFor = waitFor;
  logger.debug(`<${id}> init, <${sourceId}> -> <${targetId}>`);
}
const proto = Association.prototype;
Object.defineProperty(proto, 'counters', {
  enumerable: true,
  get() {
    return {
      ...this[kCounters]
    };
  }
});
proto.take = function take(content = {}) {
  this.logger.debug(`<${this.id}> take target <${this.targetId}>`);
  ++this[kCounters].take;
  this._publishEvent('take', content);
  return true;
};
proto.discard = function discard(content = {}) {
  this.logger.debug(`<${this.id}> discard target <${this.targetId}>`);
  ++this[kCounters].discard;
  this._publishEvent('discard', content);
  return true;
};
proto.complete = function complete(content = {}) {
  this.logger.debug(`<${this.id}> completed target <${this.targetId}>`);
  ++this[kCounters].complete;
  this._publishEvent('complete', content);
  return true;
};
proto.getState = function getState() {
  return this._createMessageContent({
    counters: this.counters,
    broker: this.broker.getState(true)
  });
};
proto.recover = function recover(state) {
  Object.assign(this[kCounters], state.counters);
  this.broker.recover(state.broker);
};
proto.getApi = function getApi(message) {
  return (0, _Api.FlowApi)(this.broker, message || {
    content: this._createMessageContent()
  });
};
proto.stop = function stop() {
  this.broker.stop();
};
proto._publishEvent = function publishEvent(action, content) {
  const eventContent = this._createMessageContent({
    action,
    message: content,
    sequenceId: (0, _shared.getUniqueId)(this.id)
  });
  this.broker.publish('event', `association.${action}`, eventContent, {
    type: action
  });
};
proto._createMessageContent = function createMessageContent(override) {
  return {
    ...override,
    id: this.id,
    type: this.type,
    name: this.name,
    sourceId: this.sourceId,
    targetId: this.targetId,
    isAssociation: true,
    parent: (0, _messageHelper.cloneParent)(this.parent)
  };
};