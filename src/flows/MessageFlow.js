import {brokerSafeId} from '../shared';
import {cloneParent} from '../messageHelper';
import {MessageFlowBroker} from '../EventBroker';

const brokerSymbol = Symbol.for('broker');
const countersSymbol = Symbol.for('counters');
const sourceElementSymbol = Symbol.for('sourceElement');

export default function MessageFlow(flowDef, context) {
  const {id, type = 'messageflow', name, target, source, behaviour, parent} = flowDef;

  this.id = id;
  this.type = type;
  this.name = name;
  this.parent = parent && cloneParent(parent);
  this.source = source;
  this.target = target;
  this.behaviour = behaviour;
  this.environment = context.environment;
  this.context = context;

  this[countersSymbol] = {
    messages: 0,
  };

  const {broker, on, once, emit, waitFor} = MessageFlowBroker(this);
  this[brokerSymbol] = broker;
  this.on = on;
  this.once = once;
  this.emit = emit;
  this.waitFor = waitFor;

  this[sourceElementSymbol] = context.getActivityById(source.id) || context.getProcessById(source.processId);
  this.logger = context.environment.Logger(type.toLowerCase());
}

const proto = MessageFlow.prototype;

Object.defineProperty(proto, 'broker', {
  enumerable: true,
  get() {
    return this[brokerSymbol];
  },
});

Object.defineProperty(proto, 'counters', {
  enumerable: true,
  get() {
    return {...this[countersSymbol]};
  },
});

proto.createMessage = function createMessage(message) {
  return {
    id: this.id,
    type: this.type,
    name: this.name,
    source: {...this.source},
    target: {...this.target},
    parent: this.parent && cloneParent(this.parent),
    message,
  };
};

proto.getState = function getState() {
  return {
    id: this.id,
    type: this.type,
    counters: this.counters,
  };
};

proto.recover = function recover(state) {
  this[countersSymbol] = {...this[countersSymbol], ...state.counters};
};

proto.getApi = function getApi() {
  return this;
};

proto.activate = function activate() {
  const sourceElement = this[sourceElementSymbol];
  const safeId = brokerSafeId(this.id);
  sourceElement.on('message', this.deactivate.bind(this), {consumerTag: `_message-on-message-${safeId}`});
  sourceElement.on('end', this.onSourceEnd.bind(this), {consumerTag: `_message-on-end-${safeId}`});
};

proto.onSourceEnd = function onSourceEnd({content}) {
  ++this[countersSymbol].messages;
  const source = this.source;
  const target = this.target;
  this.logger.debug(`<${this.id}> sending message from <${source.processId}.${source.id}> to <${target.id ? `${target.processId}.${target.id}` : target.processId}>`);
  this.broker.publish('event', 'message.outbound', this.createMessage(content.message));
};

proto.deactivate = function deactivate() {
  const sourceElement = this[sourceElementSymbol];
  const safeId = brokerSafeId(this.id);
  sourceElement.broker.cancel(`_message-on-end-${safeId}`);
  sourceElement.broker.cancel(`_message-on-message-${safeId}`);
};
