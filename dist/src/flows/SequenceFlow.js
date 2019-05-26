"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = SequenceFlow;

var _ExecutionScope = _interopRequireDefault(require("../activity/ExecutionScope"));

var _messageHelper = require("../messageHelper");

var _shared = require("../shared");

var _EventBroker = require("../EventBroker");

var _Api = require("../Api");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function SequenceFlow(flowDef, {
  environment
}) {
  const {
    id,
    type = 'sequenceflow',
    parent: originalParent,
    targetId,
    sourceId,
    isDefault,
    behaviour = {}
  } = flowDef;
  const parent = (0, _messageHelper.cloneParent)(originalParent);
  const logger = environment.Logger(type.toLowerCase());
  environment.registerScript({
    id,
    type,
    behaviour
  });
  const counters = {
    looped: 0,
    take: 0,
    discard: 0
  };
  const flowApi = {
    id,
    type,
    parent,
    behaviour,
    sourceId,
    targetId,
    isDefault,
    environment,

    get counters() {
      return { ...counters
      };
    },

    discard,
    evaluateCondition,
    getApi,
    getCondition,
    getState,
    preFlight,
    recover,
    resume,
    stop,
    take
  };
  const {
    broker,
    on,
    once,
    waitFor,
    emitFatal
  } = (0, _EventBroker.EventBroker)(flowApi, {
    prefix: 'flow',
    durable: true,
    autoDelete: false
  });
  flowApi.on = on;
  flowApi.once = once;
  flowApi.waitFor = waitFor;
  Object.defineProperty(flowApi, 'broker', {
    enumerable: true,
    get: () => broker
  });
  logger.debug(`<${id}> init, <${sourceId}> -> <${targetId}>`);
  return flowApi;

  function take(content = {}) {
    flowApi.looped = undefined;
    const {
      sequenceId
    } = content;
    logger.debug(`<${sequenceId} (${id})> take, target <${targetId}>`);
    ++counters.take;
    publishEvent('take', content);
    return true;
  }

  function discard(content = {}) {
    const {
      sequenceId
    } = content;
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
      ...content
    });
    broker.publish('event', `flow.${action}`, eventContent, {
      type: action
    });
  }

  function preFlight(action) {
    const sequenceId = (0, _shared.getUniqueId)(id);
    broker.publish('event', 'flow.pre-flight', createMessage({
      action,
      sequenceId,
      state: 'pre-flight'
    }), {
      type: 'pre-flight'
    });
    return sequenceId;
  }

  function createMessage(override = {}) {
    return { ...override,
      id,
      type,
      sourceId,
      targetId,
      isSequenceFlow: true,
      isDefault,
      parent: (0, _messageHelper.cloneParent)(parent)
    };
  }

  function getState() {
    const result = {
      id,
      type,
      sourceId,
      targetId,
      isDefault,
      counters: { ...counters
      }
    };
    result.broker = broker.getState();
    return result;
  }

  function recover(state) {
    Object.assign(counters, state.counters);
    broker.recover(state.broker);
  }

  function getApi(message) {
    return (0, _Api.FlowApi)(broker, message || {
      content: createMessage()
    });
  }

  function stop() {
    broker.stop();
  }

  function resume() {}

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

        return script.execute((0, _ExecutionScope.default)(flowApi, message));
      }
    };
  }

  function ExpressionCondition(expression) {
    return {
      execute: message => {
        return environment.resolveExpression(expression, createMessage(message));
      }
    };
  }
}