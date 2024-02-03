import {brokerSafeId} from '../shared.js';
import {cloneParent} from '../messageHelper.js';
import {MessageFlowBroker} from '../EventBroker.js';
import {Api} from '../Api.js';

const kCounters = Symbol.for('counters');
const kSourceElement = Symbol.for('sourceElement');

export default function MessageFlow(flowDef, context) {
  const {id, type = 'messageflow', name, target, source, behaviour, parent} = flowDef;

  this.id = id;
  this.type = type;
  this.name = name;
  this.parent = cloneParent(parent);
  this.source = source;
  this.target = target;
  this.behaviour = behaviour;
  this.environment = context.environment;
  this.context = context;

  this[kCounters] = {
    messages: 0,
  };

  const {broker, on, once, emit, waitFor} = MessageFlowBroker(this);
  this.broker = broker;
  this.on = on;
  this.once = once;
  this.emit = emit;
  this.waitFor = waitFor;

  this[kSourceElement] = context.getActivityById(source.id) || context.getProcessById(source.processId);
  this.logger = context.environment.Logger(type.toLowerCase());
}

Object.defineProperty(MessageFlow.prototype, 'counters', {
  get() {
    return {...this[kCounters]};
  },
});

MessageFlow.prototype.getState = function getState() {
  return {
    id: this.id,
    type: this.type,
    counters: this.counters,
    broker: this.broker.getState(true),
  };
};

MessageFlow.prototype.recover = function recover(state) {
  Object.assign(this[kCounters], state.counters);
  this.broker.recover(state.broker);
};

MessageFlow.prototype.getApi = function getApi(message) {
  return new Api('message', this.broker, message || {content: this._createMessageContent()});
};

MessageFlow.prototype.activate = function activate() {
  const sourceElement = this[kSourceElement];
  const safeId = brokerSafeId(this.id);
  sourceElement.on('message', this.deactivate.bind(this), {consumerTag: `_message-on-message-${safeId}`});
  sourceElement.on('end', this._onSourceEnd.bind(this), {consumerTag: `_message-on-end-${safeId}`});
};

MessageFlow.prototype.deactivate = function deactivate() {
  const sourceElement = this[kSourceElement];
  const safeId = brokerSafeId(this.id);
  sourceElement.broker.cancel(`_message-on-end-${safeId}`);
  sourceElement.broker.cancel(`_message-on-message-${safeId}`);
};

MessageFlow.prototype._onSourceEnd = function onSourceEnd({content}) {
  ++this[kCounters].messages;
  const source = this.source;
  const target = this.target;
  this.logger.debug(`<${this.id}> sending message from <${source.processId}.${source.id}> to <${target.id ? `${target.processId}.${target.id}` : target.processId}>`);
  this.broker.publish('event', 'message.outbound', this._createMessageContent(content.message));
};

MessageFlow.prototype._createMessageContent = function createMessage(message) {
  return {
    id: this.id,
    type: this.type,
    name: this.name,
    source: {...this.source},
    target: {...this.target},
    parent: cloneParent(this.parent),
    message,
  };
};
