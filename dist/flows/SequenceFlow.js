"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _ExecutionScope = _interopRequireDefault(require("../activity/ExecutionScope.js"));
var _messageHelper = require("../messageHelper.js");
var _shared = require("../shared.js");
var _EventBroker = require("../EventBroker.js");
var _Api = require("../Api.js");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const kCounters = Symbol.for('counters');
var _default = SequenceFlow;
exports.default = _default;
function SequenceFlow(flowDef, {
  environment
}) {
  const {
    id,
    type = 'sequenceflow',
    name,
    parent,
    targetId,
    sourceId,
    isDefault,
    behaviour = {}
  } = flowDef;
  this.id = id;
  this.type = type;
  this.name = name;
  this.parent = (0, _messageHelper.cloneParent)(parent);
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
    discard: 0
  };
  environment.registerScript(this);
  const {
    broker,
    on,
    once,
    waitFor,
    emitFatal
  } = new _EventBroker.EventBroker(this, {
    prefix: 'flow',
    durable: true,
    autoDelete: false
  });
  this.broker = broker;
  this.on = on;
  this.once = once;
  this.waitFor = waitFor;
  this.emitFatal = emitFatal;
  logger.debug(`<${id}> init, <${sourceId}> -> <${targetId}>`);
}
Object.defineProperty(SequenceFlow.prototype, 'counters', {
  enumerable: true,
  get() {
    return {
      ...this[kCounters]
    };
  }
});
SequenceFlow.prototype.take = function take(content = {}) {
  const {
    sequenceId
  } = content;
  this.logger.debug(`<${sequenceId} (${this.id})> take, target <${this.targetId}>`);
  ++this[kCounters].take;
  this._publishEvent('take', content);
  return true;
};
SequenceFlow.prototype.discard = function discard(content = {}) {
  const {
    sequenceId = (0, _shared.getUniqueId)(this.id)
  } = content;
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
SequenceFlow.prototype.getState = function getState() {
  return this.createMessage({
    counters: this.counters,
    broker: this.broker.getState(true)
  });
};
SequenceFlow.prototype.recover = function recover(state) {
  Object.assign(this[kCounters], state.counters);
  this.broker.recover(state.broker);
};
SequenceFlow.prototype.getApi = function getApi(message) {
  return (0, _Api.FlowApi)(this.broker, message || {
    content: this.createMessage()
  });
};
SequenceFlow.prototype.stop = function stop() {
  this.broker.stop();
};
SequenceFlow.prototype.shake = function shake(message) {
  const content = (0, _messageHelper.cloneContent)(message.content);
  content.sequence = content.sequence || [];
  content.sequence.push({
    id: this.id,
    type: this.type,
    isSequenceFlow: true,
    targetId: this.targetId
  });
  if (content.id === this.targetId) return this.broker.publish('event', 'flow.shake.loop', content, {
    persistent: false,
    type: 'shake'
  });
  for (const s of message.content.sequence) {
    if (s.id === this.id) return this.broker.publish('event', 'flow.shake.loop', content, {
      persistent: false,
      type: 'shake'
    });
  }
  this.broker.publish('event', 'flow.shake', content, {
    persistent: false,
    type: 'shake'
  });
};
SequenceFlow.prototype.getCondition = function getCondition() {
  const conditionExpression = this.behaviour.conditionExpression;
  if (!conditionExpression) return null;
  const {
    language
  } = conditionExpression;
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
    parent: (0, _messageHelper.cloneParent)(this.parent)
  };
};
SequenceFlow.prototype._publishEvent = function publishEvent(action, content) {
  const eventContent = this.createMessage({
    action,
    ...content
  });
  this.broker.publish('event', `flow.${action}`, eventContent, {
    type: action
  });
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
    return this._script.execute((0, _ExecutionScope.default)(owner, message), callback);
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