import ExecutionScope from '../activity/ExecutionScope';
import {cloneParent, cloneContent} from '../messageHelper';
import {getUniqueId} from '../shared';
import {EventBroker} from '../EventBroker';
import {FlowApi} from '../Api';

const brokerSymbol = Symbol.for('broker');
const countersSymbol = Symbol.for('counters');

export default SequenceFlow;

function SequenceFlow(flowDef, {environment}) {
  const {id, type = 'sequenceflow', name, parent: originalParent, targetId, sourceId, isDefault, behaviour = {}} = flowDef;

  this.id = id;
  this.type = type;
  this.name = name;
  this.parent = originalParent;
  this.behaviour = behaviour;
  this.sourceId = sourceId;
  this.targetId = targetId;
  this.isDefault = isDefault;
  this.isSequenceFlow = true;
  this.environment = environment;
  this.logger = environment.Logger(type.toLowerCase());
  this.parent = cloneParent(originalParent);

  this[countersSymbol] = {
    looped: 0,
    take: 0,
    discard: 0,
  };

  environment.registerScript(this);
  const {broker, on, once, waitFor, emitFatal} = new EventBroker(this, {prefix: 'flow', durable: true, autoDelete: false});
  this[brokerSymbol] = broker;
  this.on = on;
  this.once = once;
  this.waitFor = waitFor;
  this.emitFatal = emitFatal;

  this.logger.debug(`<${id}> init, <${sourceId}> -> <${targetId}>`);
}

const proto = SequenceFlow.prototype;

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

proto.take = function take(content = {}) {
  this.looped = undefined;

  const {sequenceId} = content;

  this.logger.debug(`<${sequenceId} (${this.id})> take, target <${this.targetId}>`);
  ++this[countersSymbol].take;

  this.publishEvent('take', content);

  return true;
};

proto.discard = function discard(content = {}) {
  const {sequenceId = getUniqueId(this.id)} = content;
  const discardSequence = content.discardSequence = (content.discardSequence || []).slice();
  if (discardSequence.indexOf(this.targetId) > -1) {
    ++this[countersSymbol].looped;
    this.logger.debug(`<${this.id}> discard loop detected <${this.sourceId}> -> <${this.targetId}>. Stop.`);
    return this.publishEvent('looped', content);
  }

  discardSequence.push(this.sourceId);

  this.logger.debug(`<${sequenceId} (${this.id})> discard, target <${this.targetId}>`);
  ++this[countersSymbol].discard;
  this.publishEvent('discard', content);
};

proto.publishEvent = function publishEvent(action, content) {
  const eventContent = this.createMessage({
    action,
    ...content,
  });

  this.broker.publish('event', `flow.${action}`, eventContent, {type: action});
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

proto.getState = function getState() {
  return this.createMessage({
    counters: this.counters,
    broker: this.broker.getState(true),
  });
};

proto.recover = function recover(state) {
  this[countersSymbol] = {...this[countersSymbol], ...state.counters};
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

function ScriptCondition(owner, script, language) {
  return {
    language,
    execute(message, callback) {
      try {
        return script.execute(ExecutionScope(owner, message), callback);
      } catch (err) {
        if (!callback) throw err;
        owner.logger.error(`<${owner.id}>`, err);
        callback(err);
      }
    },
  };
}

function ExpressionCondition(owner, expression) {
  return {
    execute: (message, callback) => {
      try {
        const result = owner.environment.resolveExpression(expression, owner.createMessage(message));
        if (callback) return callback(null, result);
        return result;
      } catch (err) {
        if (callback) return callback(err);
        throw err;
      }
    },
  };
}
