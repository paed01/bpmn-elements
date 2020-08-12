import ExecutionScope from '../activity/ExecutionScope';
import {cloneParent, cloneContent} from '../messageHelper';
import {getUniqueId} from '../shared';
import {EventBroker} from '../EventBroker';
import {FlowApi} from '../Api';

export default function SequenceFlow(flowDef, {environment}) {
  const {id, type = 'sequenceflow', name, parent: originalParent, targetId, sourceId, isDefault, behaviour = {}} = flowDef;
  const parent = cloneParent(originalParent);
  const logger = environment.Logger(type.toLowerCase());

  environment.registerScript({id, type, behaviour});

  let counters = {
    looped: 0,
    take: 0,
    discard: 0,
  };

  const flowApi = {
    id,
    type,
    name,
    parent,
    behaviour,
    sourceId,
    targetId,
    isDefault,
    isSequenceFlow: true,
    environment,
    get counters() {
      return {...counters};
    },
    discard,
    evaluateCondition,
    getApi,
    getCondition,
    getState,
    recover,
    shake,
    stop,
    take,
  };

  const {broker, on, once, waitFor, emitFatal} = EventBroker(flowApi, {prefix: 'flow', durable: true, autoDelete: false});

  flowApi.on = on;
  flowApi.once = once;
  flowApi.waitFor = waitFor;

  Object.defineProperty(flowApi, 'broker', {
    enumerable: true,
    get: () => broker,
  });

  logger.debug(`<${id}> init, <${sourceId}> -> <${targetId}>`);

  return flowApi;

  function take(content = {}) {
    flowApi.looped = undefined;

    const {sequenceId} = content;

    logger.debug(`<${sequenceId} (${id})> take, target <${targetId}>`);
    ++counters.take;

    publishEvent('take', content);

    return true;
  }

  function discard(content = {}) {
    const {sequenceId = getUniqueId(id)} = content;
    const discardSequence = content.discardSequence = (content.discardSequence || []).slice();
    if (discardSequence.indexOf(targetId) > -1) {
      ++counters.looped;
      logger.debug(`<${id}> discard loop detected <${sourceId}> -> <${targetId}>. Stop.`);
      return publishEvent('looped', content);
    }

    discardSequence.push(sourceId);

    logger.debug(`<${sequenceId} (${id})> discard, target <${targetId}>`);
    ++counters.discard;
    publishEvent('discard', content);
  }

  function publishEvent(action, content) {
    const eventContent = createMessage({
      action,
      ...content,
    });

    broker.publish('event', `flow.${action}`, eventContent, {type: action});
  }

  function createMessage(override) {
    return {
      ...override,
      id,
      type,
      name,
      sourceId,
      targetId,
      isSequenceFlow: true,
      isDefault,
      parent: cloneParent(parent),
    };
  }

  function getState() {
    const result = {
      id,
      type,
      name,
      sourceId,
      targetId,
      isDefault,
      counters: {...counters},
    };
    result.broker = broker.getState();
    return result;
  }

  function recover(state) {
    counters = {...counters, ...state.counters};
    broker.recover(state.broker);
  }

  function getApi(message) {
    return FlowApi(broker, message || {content: createMessage()});
  }

  function stop() {
    broker.stop();
  }

  function shake(message) {
    const content = cloneContent(message.content);
    content.sequence = content.sequence || [];
    content.sequence.push({id, type, isSequenceFlow: true, targetId});

    if (content.id === targetId) return broker.publish('event', 'flow.shake.loop', content, {persistent: false, type: 'shake'});

    for (const s of message.content.sequence) {
      if (s.id === id) return broker.publish('event', 'flow.shake.loop', content, {persistent: false, type: 'shake'});
    }

    broker.publish('event', 'flow.shake', content, {persistent: false, type: 'shake'});
  }

  function evaluateCondition(message, onEvaluateError) {
    const condition = getCondition(message);
    if (!condition) return true;

    const result = condition.execute(message, onEvaluateError);
    logger.debug(`<${id}> condition result evaluated to ${result}`);
    return result;
  }

  function getCondition() {
    const conditionExpression = behaviour.conditionExpression;
    if (!conditionExpression) return null;

    if (!('language' in conditionExpression)) {
      return ExpressionCondition(conditionExpression.body);
    }

    const script = environment.getScript(conditionExpression.language, flowApi);
    return ScriptCondition(script, conditionExpression.language);
  }

  function ScriptCondition(script, language) {
    return {
      language,
      execute: (message, onEvaluateError) => {
        if (!script) {
          const err = new Error(`Script format ${language} is unsupported or was not registered (<${id}>)`);
          logger.error(`<${id}>`, err);
          emitFatal(err, createMessage());
          return onEvaluateError && onEvaluateError(err);
        }

        try {
          return script.execute(ExecutionScope(flowApi, message));
        } catch (err) {
          if (!onEvaluateError) throw err;
          logger.error(`<${id}>`, err);
          onEvaluateError(err);
        }
      },
    };
  }

  function ExpressionCondition(expression) {
    return {
      execute: (message) => {
        return environment.resolveExpression(expression, createMessage(message));
      },
    };
  }
}
