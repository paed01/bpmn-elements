import { cloneParent, cloneContent } from '../messageHelper.js';
import { getUniqueId } from '../shared.js';
import { EventBroker } from '../EventBroker.js';
import { FlowApi } from '../Api.js';
import { ScriptCondition, ExpressionCondition } from '../condition.js';
import { K_COUNTERS } from '../constants.js';

/**
 * Sequence flow connecting two activities. Owns its broker and publishes take/discard/looped
 * events; activities subscribe to drive their inbound queue.
 * @param {import('moddle-context-serializer').SequenceFlow} flowDef
 * @param {import('#types').ContextInstance} context
 */
export function SequenceFlow(flowDef, { environment }) {
  const { id, type = 'sequenceflow', name, parent, targetId, sourceId, isDefault, behaviour = {} } = flowDef;

  this.id = id;
  this.type = type;
  this.name = name;
  this.parent = cloneParent(parent);
  /** @type {Record<string, any>} */
  this.behaviour = behaviour;
  this.sourceId = sourceId;
  this.targetId = targetId;
  this.isDefault = isDefault;
  this.isSequenceFlow = true;
  this.environment = environment;
  const logger = (this.logger = environment.Logger(type.toLowerCase()));

  this[K_COUNTERS] = {
    looped: 0,
    take: 0,
    discard: 0,
  };

  const { broker, on, once, waitFor, emitFatal } = new EventBroker(this, { prefix: 'flow', durable: true, autoDelete: false });
  this.broker = broker;
  this.on = on;
  this.once = once;
  this.waitFor = waitFor;
  this.emitFatal = emitFatal;

  environment.registerScript(this);

  logger.debug(`<${id}> init, <${sourceId}> -> <${targetId}>`);
}

Object.defineProperty(SequenceFlow.prototype, 'counters', {
  /** @returns {{ take: number, discard: number, looped: number }} */
  get() {
    return { ...this[K_COUNTERS] };
  },
});

/**
 * Take the flow and publish flow.take.
 * @param {Record<string, any>} [content]
 */
SequenceFlow.prototype.take = function take(content) {
  const sequenceId = content?.sequenceId;

  this.logger.debug(`<${sequenceId} (${this.id})> take, target <${this.targetId}>`);
  ++this[K_COUNTERS].take;

  this._publishEvent('take', content);

  return true;
};

/**
 * Discard the flow and publish flow.discard. Detects loops via discardSequence and emits
 * flow.looped instead when the target id is already in the sequence.
 * @param {Record<string, any>} [content]
 */
SequenceFlow.prototype.discard = function discard(content = {}) {
  const sequenceId = content?.sequenceId ?? getUniqueId(this.id);
  const discardSequence = (content.discardSequence = content.discardSequence?.slice() || []);
  if (discardSequence.indexOf(this.targetId) > -1) {
    ++this[K_COUNTERS].looped;
    this.logger.debug(`<${this.id}> discard loop detected <${this.sourceId}> -> <${this.targetId}>. Stop.`);
    return this._publishEvent('looped', content);
  }

  discardSequence.push(this.sourceId);

  this.logger.debug(`<${sequenceId} (${this.id})> discard, target <${this.targetId}>`);
  ++this[K_COUNTERS].discard;
  this._publishEvent('discard', content);
};

/**
 * Snapshot flow state. Returns undefined when the broker has no state and `disableTrackState`
 * is set.
 * @returns {import('#types').SequenceFlowState | undefined}
 */
SequenceFlow.prototype.getState = function getState() {
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
 * Restore flow state captured by getState.
 * @param {import('#types').SequenceFlowState} state
 */
SequenceFlow.prototype.recover = function recover(state) {
  Object.assign(this[K_COUNTERS], state.counters);
  this.broker.recover(state.broker);
};

/**
 * Resolve a Flow Api wrapper.
 * @param {import('#types').ElementBrokerMessage} [message]
 * @returns {import('#types').IApi<this>}
 */
SequenceFlow.prototype.getApi = function getApi(message) {
  return FlowApi(this.broker, message || { content: this.createMessage() });
};

/**
 * Stop the flow's broker.
 */
SequenceFlow.prototype.stop = function stop() {
  this.broker.stop();
};

/**
 * Walk the flow as part of a process shake. Detects loops and publishes flow.shake.loop
 * when the target was already visited, otherwise flow.shake.
 * @param {import('#types').ElementBrokerMessage} message
 */
SequenceFlow.prototype.shake = function shake(message) {
  const content = cloneContent(message.content);

  content.sequence = content.sequence || [];

  const info = {
    id: this.id,
    type: this.type,
    isSequenceFlow: true,
    sourceId: this.sourceId,
    targetId: this.targetId,
  };

  if (content.id === this.targetId) {
    content.sequence.push(info);
    return this.broker.publish('event', 'flow.shake.loop', content, { persistent: false, type: 'shake' });
  } else if (content.sequence?.find((f) => f.id === this.id)) {
    return this.broker.publish('event', 'flow.shake.loop', content, { persistent: false, type: 'shake' });
  } else {
    content.sequence.push(info);
    this.broker.publish('event', 'flow.shake', content, { persistent: false, type: 'shake' });
  }
};

/**
 * Resolve the flow's condition (script or expression). Returns null when no condition is set.
 * Emits a fatal error when the script language is missing or unsupported.
 * @returns {import('#types').ISequenceFlowCondition | null}
 */
SequenceFlow.prototype.getCondition = function getCondition() {
  const conditionExpression = this.behaviour.conditionExpression;
  if (!conditionExpression) return null;

  const { language } = conditionExpression;
  const script = this.environment.getScript(language, this);
  if (script) {
    return new ScriptCondition(this, script, language);
  }

  if (!conditionExpression.body) {
    const msg = language
      ? `Condition expression script ${language} is unsupported or was not registered`
      : 'Condition expression without body is unsupported';
    return this.emitFatal(new Error(msg), this.createMessage());
  }

  return new ExpressionCondition(this, conditionExpression.body);
};

/**
 * Build a flow event message body, optionally merging override content.
 * @param {Record<string, any>} [override]
 * @returns {import('#types').ElementMessageContent}
 */
SequenceFlow.prototype.createMessage = function createMessage(override) {
  return {
    ...override,
    id: this.id,
    type: this.type,
    name: this.name,
    sourceId: this.sourceId,
    targetId: this.targetId,
    isSequenceFlow: true,
    isDefault: this.isDefault,
    parent: cloneParent(this.parent),
  };
};

/**
 * Evaluate the flow's condition for the source activity message. Default flows are always taken.
 * @param {import('#types').ElementBrokerMessage} fromMessage Source activity message
 * @param {(err: Error | null, result?: boolean | unknown) => void} callback Callback with truthy result if flow should be taken
 */
SequenceFlow.prototype.evaluate = function evaluate(fromMessage, callback) {
  if (this.isDefault) {
    return callback(null, true);
  }

  const flowCondition = this.getCondition();
  if (!flowCondition) {
    return callback(null, true);
  }

  flowCondition.execute(fromMessage, callback);
};

/** @internal */
SequenceFlow.prototype._publishEvent = function publishEvent(action, content) {
  const eventContent = this.createMessage({
    action,
    ...content,
  });

  this.broker.publish('event', `flow.${action}`, eventContent, { type: action });
};
