import ExecutionScope from '../activity/ExecutionScope';
import {cloneParent, cloneContent} from '../messageHelper';
import {getUniqueId} from '../shared';
import {EventBroker} from '../EventBroker';
import {FlowApi} from '../Api';

const kCounters = Symbol.for('counters');

export default SequenceFlow;

function SequenceFlow(flowDef, {environment}) {
  const {id, type = 'sequenceflow', name, parent, targetId, sourceId, isDefault, behaviour = {}} = flowDef;

  this.id = id;
  this.type = type;
  this.name = name;
  this.parent = cloneParent(parent);
  this.behaviour = behaviour;
  this.sourceId = sourceId;
  this.targetId = targetId;
  this.isDefault = isDefault;
  this.isSequenceFlow = true;
  this.environment = environment;
  const logger = this.logger = environment.Logger(type.toLowerCase());

  this[kCounters] = {
    looped: 0,
    take: 0,
    discard: 0,
  };

  environment.registerScript(this);
  const {broker, on, once, waitFor, emitFatal} = new EventBroker(this, {prefix: 'flow', durable: true, autoDelete: false});
  this.broker = broker;
  this.on = on;
  this.once = once;
  this.waitFor = waitFor;
  this.emitFatal = emitFatal;

  logger.debug(`<${id}> init, <${sourceId}> -> <${targetId}>`);
}

const proto = SequenceFlow.prototype;

Object.defineProperty(proto, 'counters', {
  enumerable: true,
  get() {
    return {...this[kCounters]};
  },
});

proto.take = function take(content = {}) {
  this.looped = undefined;

  const {sequenceId} = content;

  this.logger.debug(`<${sequenceId} (${this.id})> take, target <${this.targetId}>`);
  ++this[kCounters].take;

  this._publishEvent('take', content);

  return true;
};

proto.discard = function discard(content = {}) {
  const {sequenceId = getUniqueId(this.id)} = content;
  const discardSequence = content.discardSequence = (content.discardSequence || []).slice();
  if (discardSequence.indexOf(this.targetId) > -1) {
    ++this[kCounters].looped;
    this.logger.debug(`<${this.id}> discard loop detected <${this.sourceId}> -> <${this.targetId}>. Stop.`);
    return this._publishEvent('looped', content);
  }

  discardSequence.push(this.sourceId);

  this.logger.debug(`<${sequenceId} (${this.id})> discard, target <${this.targetId}>`);
  ++this[kCounters].discard;
  this._publishEvent('discard', content);
};

proto.getState = function getState() {
  return this.createMessage({
    counters: this.counters,
    broker: this.broker.getState(true),
  });
};

proto.recover = function recover(state) {
  Object.assign(this[kCounters], state.counters);
  this.broker.recover(state.broker);
};

proto.getApi = function getApi(message) {
  return FlowApi(this.broker, message || {content: this.createMessage()});
};

proto.stop = function stop() {
  this.broker.stop();
};

proto.shake = function shake(message) {
  const content = cloneContent(message.content);
  content.sequence = content.sequence || [];
  content.sequence.push({id: this.id, type: this.type, isSequenceFlow: true, targetId: this.targetId});

  if (content.id === this.targetId) return this.broker.publish('event', 'flow.shake.loop', content, {persistent: false, type: 'shake'});

  for (const s of message.content.sequence) {
    if (s.id === this.id) return this.broker.publish('event', 'flow.shake.loop', content, {persistent: false, type: 'shake'});
  }

  this.broker.publish('event', 'flow.shake', content, {persistent: false, type: 'shake'});
};

proto.getCondition = function getCondition() {
  const conditionExpression = this.behaviour.conditionExpression;
  if (!conditionExpression) return null;

  const {language} = conditionExpression;
  const script = this.environment.getScript(language, this);
  if (script) {
    return new ScriptCondition(this, script, language);
  }

  if (!conditionExpression.body) {
    const msg = language ? `Condition expression script ${language} is unsupported or was not registered` : 'Condition expression without body is unsupported';
    return this.emitFatal(new Error(msg), this.createMessage());
  }

  return new ExpressionCondition(this, conditionExpression.body);
};

proto.createMessage = function createMessage(override) {
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

proto._publishEvent = function publishEvent(action, content) {
  const eventContent = this.createMessage({
    action,
    ...content,
  });

  this.broker.publish('event', `flow.${action}`, eventContent, {type: action});
};

function ScriptCondition(owner, script, language) {
  this.type = 'script';
  this.language = language;
  this._owner = owner;
  this._script = script;
}

ScriptCondition.prototype.execute = function execute(message, callback) {
  const owner = this._owner;
  try {
    return this._script.execute(ExecutionScope(owner, message), callback);
  } catch (err) {
    if (!callback) throw err;
    owner.logger.error(`<${owner.id}>`, err);
    callback(err);
  }
};

function ExpressionCondition(owner, expression) {
  this.type = 'expression';
  this.expression = expression;
  this._owner = owner;
}

ExpressionCondition.prototype.execute = function execute(message, callback) {
  const owner = this._owner;
  try {
    const result = owner.environment.resolveExpression(this.expression, owner.createMessage(message));
    if (callback) return callback(null, result);
    return result;
  } catch (err) {
    if (callback) return callback(err);
    throw err;
  }
};
