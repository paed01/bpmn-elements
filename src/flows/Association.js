import { cloneParent } from '../messageHelper.js';
import { EventBroker } from '../EventBroker.js';
import { Api } from '../Api.js';
import { getUniqueId } from '../shared.js';
import { K_COUNTERS } from '../constants.js';

/**
 * Association connecting a source and target activity. Used to drive compensation —
 * activities marked `isForCompensation` subscribe to inbound association events.
 * @param {import('moddle-context-serializer').Association} associationDef
 * @param {import('#types').ContextInstance} context
 */
export function Association(associationDef, { environment }) {
  const { id, type = 'association', name, parent, targetId, sourceId, behaviour = {} } = associationDef;

  this.id = id;
  this.type = type;
  this.name = name;
  this.parent = cloneParent(parent);
  /** @type {Record<string, any>} */
  this.behaviour = behaviour;
  this.sourceId = sourceId;
  this.targetId = targetId;
  this.isAssociation = true;
  this.environment = environment;
  const logger = (this.logger = environment.Logger(type.toLowerCase()));

  this[K_COUNTERS] = {
    take: 0,
    discard: 0,
  };

  const { broker, on, once, waitFor } = new EventBroker(this, { prefix: 'association', durable: true, autoDelete: false });
  this.broker = broker;
  this.on = on;
  this.once = once;
  this.waitFor = waitFor;

  logger.debug(`<${id}> init, <${sourceId}> -> <${targetId}>`);
}

Object.defineProperty(Association.prototype, 'counters', {
  /** @returns {{ take: number, discard: number }} */
  get() {
    return { ...this[K_COUNTERS] };
  },
});

/**
 * Take the association and publish association.take.
 * @param {Record<string, any>} [content]
 */
Association.prototype.take = function take(content) {
  this.logger.debug(`<${this.id}> take target <${this.targetId}>`);
  ++this[K_COUNTERS].take;

  this._publishEvent('take', content);

  return true;
};

/**
 * Discard the association and publish association.discard.
 * @param {Record<string, any>} [content]
 */
Association.prototype.discard = function discard(content) {
  this.logger.debug(`<${this.id}> discard target <${this.targetId}>`);
  ++this[K_COUNTERS].discard;

  this._publishEvent('discard', content);

  return true;
};

/**
 * Snapshot association state. Returns undefined when broker has no state and
 * `disableTrackState` is set.
 * @returns {import('#types').AssociationState | undefined}
 */
Association.prototype.getState = function getState() {
  const brokerState = this.broker.getState(true);
  if (!brokerState && this.environment.settings.disableTrackState) return;

  return {
    id: this.id,
    type: this.type,
    counters: this.counters,
    broker: brokerState,
  };
};

/**
 * Restore association state captured by getState.
 * @param {import('#types').AssociationState} state
 */
Association.prototype.recover = function recover(state) {
  Object.assign(this[K_COUNTERS], state.counters);
  this.broker.recover(state.broker);
};

/**
 * Resolve an association-scoped Api wrapper.
 * @param {import('#types').ElementBrokerMessage} [message]
 * @returns {import('#types').IApi<this>}
 */
Association.prototype.getApi = function getApi(message) {
  return new Api('association', this.broker, message || { content: this._createMessageContent() });
};

/**
 * Stop the association's broker.
 */
Association.prototype.stop = function stop() {
  this.broker.stop();
};

/** @internal */
Association.prototype._publishEvent = function publishEvent(action, content) {
  const eventContent = this._createMessageContent({
    action,
    message: content,
    sequenceId: getUniqueId(this.id),
  });

  this.broker.publish('event', `association.${action}`, eventContent, { type: action });
};

/** @internal */
Association.prototype._createMessageContent = function createMessageContent(override) {
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
