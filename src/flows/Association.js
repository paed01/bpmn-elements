import {cloneParent} from '../messageHelper';
import {EventBroker} from '../EventBroker';
import {FlowApi} from '../Api';
import {getUniqueId} from '../shared';

const countersSymbol = Symbol.for('counters');

export default function Association(associationDef, {environment}) {
  const {id, type = 'association', name, parent, targetId, sourceId, behaviour = {}} = associationDef;

  this.id = id;
  this.type = type;
  this.name = name;
  this.parent = cloneParent(parent);
  this.behaviour = behaviour;
  this.sourceId = sourceId;
  this.targetId = targetId;
  this.isAssociation = true;
  this.environment = environment;
  const logger = this.logger = environment.Logger(type.toLowerCase());

  this[countersSymbol] = {
    complete: 0,
    take: 0,
    discard: 0,
  };

  const {broker, on, once, waitFor} = new EventBroker(this, {prefix: 'association', durable: true, autoDelete: false});
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
    return {...this[countersSymbol]};
  },
});

proto.take = function take(content = {}) {
  this.logger.debug(`<${this.id}> take target <${this.targetId}>`);
  ++this[countersSymbol].take;

  this._publishEvent('take', content);

  return true;
};

proto.discard = function discard(content = {}) {
  this.logger.debug(`<${this.id}> discard target <${this.targetId}>`);
  ++this[countersSymbol].discard;

  this._publishEvent('discard', content);

  return true;
};

proto.complete = function complete(content = {}) {
  this.logger.debug(`<${this.id}> completed target <${this.targetId}>`);
  ++this[countersSymbol].complete;

  this._publishEvent('complete', content);

  return true;
};

proto.getState = function getState() {
  return this._createMessageContent({
    counters: this.counters,
    broker: this.broker.getState(true),
  });
};

proto.recover = function recover(state) {
  Object.assign(this[countersSymbol], state.counters);
  this.broker.recover(state.broker);
};

proto.getApi = function getApi(message) {
  return FlowApi(this.broker, message || {content: this._createMessageContent()});
};

proto.stop = function stop() {
  this.broker.stop();
};

proto._publishEvent = function publishEvent(action, content) {
  const eventContent = this._createMessageContent({
    action,
    message: content,
    sequenceId: getUniqueId(this.id),
  });

  this.broker.publish('event', `association.${action}`, eventContent, {type: action});
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
    parent: cloneParent(this.parent),
  };
};
