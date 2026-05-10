"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MessageFlow = MessageFlow;
var _shared = require("../shared.js");
var _messageHelper = require("../messageHelper.js");
var _EventBroker = require("../EventBroker.js");
var _Api = require("../Api.js");
var _constants = require("../constants.js");
const K_SOURCE_ELEMENT = Symbol.for('sourceElement');

/**
 * Message flow connecting a source activity (or process) to a target. Subscribes to the
 * source's `end` event and publishes `message.outbound` whenever the source completes,
 * carrying any message payload through to the target.
 * @param {import('moddle-context-serializer').SerializableElement} flowDef
 * @param {import('types').ContextInstance} context
 */
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

  /** @private */
  this[_constants.K_COUNTERS] = {
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

  /** @private */
  this[K_SOURCE_ELEMENT] = context.getActivityById(source.id) || context.getProcessById(source.processId);
  this.logger = context.environment.Logger(type.toLowerCase());
}
Object.defineProperty(MessageFlow.prototype, 'counters', {
  /** @returns {{ messages: number }} */
  get() {
    return {
      ...this[_constants.K_COUNTERS]
    };
  }
});

/**
 * Snapshot message-flow state. Returns undefined when broker has no state and
 * `disableTrackState` is set.
 * @returns {import('types').MessageFlowState | undefined}
 */
MessageFlow.prototype.getState = function getState() {
  const brokerState = this.broker.getState(true);
  if (!brokerState && this.environment.settings.disableTrackState) return;
  return {
    id: this.id,
    type: this.type,
    counters: this.counters,
    broker: brokerState
  };
};

/**
 * Restore message-flow state captured by getState.
 * @param {import('types').MessageFlowState} state
 */
MessageFlow.prototype.recover = function recover(state) {
  Object.assign(this[_constants.K_COUNTERS], state.counters);
  this.broker.recover(state.broker);
};

/**
 * Resolve a message-scoped Api wrapper.
 * @param {import('types').ElementBrokerMessage} [message]
 */
MessageFlow.prototype.getApi = function getApi(message) {
  return new _Api.Api('message', this.broker, message || {
    content: this._createMessageContent()
  });
};

/**
 * Subscribe to the source element's message and end events to bridge the message across.
 */
MessageFlow.prototype.activate = function activate() {
  const sourceElement = this[K_SOURCE_ELEMENT];
  const safeId = (0, _shared.brokerSafeId)(this.id);
  sourceElement.on('message', this.deactivate.bind(this), {
    consumerTag: `_message-on-message-${safeId}`
  });
  sourceElement.on('end', this._onSourceEnd.bind(this), {
    consumerTag: `_message-on-end-${safeId}`
  });
};

/**
 * Cancel the source element subscriptions added by activate.
 */
MessageFlow.prototype.deactivate = function deactivate() {
  const sourceElement = this[K_SOURCE_ELEMENT];
  const safeId = (0, _shared.brokerSafeId)(this.id);
  sourceElement.broker.cancel(`_message-on-end-${safeId}`);
  sourceElement.broker.cancel(`_message-on-message-${safeId}`);
};

/** @internal */
MessageFlow.prototype._onSourceEnd = function onSourceEnd({
  content
}) {
  ++this[_constants.K_COUNTERS].messages;
  const source = this.source;
  const target = this.target;
  this.logger.debug(`<${this.id}> sending message from <${source.processId}.${source.id}> to <${target.id ? `${target.processId}.${target.id}` : target.processId}>`);
  this.broker.publish('event', 'message.outbound', this._createMessageContent(content.message));
};

/** @internal */
MessageFlow.prototype._createMessageContent = function createMessage(message) {
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