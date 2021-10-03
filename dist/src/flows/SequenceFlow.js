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
    name,
    parent: originalParent,
    targetId,
    sourceId,
    isDefault,
    behaviour = {}
  } = flowDef;
  const parent = (0, _messageHelper.cloneParent)(originalParent);
  const logger = environment.Logger(type.toLowerCase());
  const flowBase = {
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
    logger
  };
  environment.registerScript({ ...flowBase
  });
  let counters = {
    looped: 0,
    take: 0,
    discard: 0
  };
  const flowApi = { ...flowBase,

    get counters() {
      return { ...counters
      };
    },

    discard,
    getApi,
    getCondition,
    getState,
    recover,
    shake,
    stop,
    take
  };
  const {
    broker,
    on,
    once,
    waitFor,
    emitFatal
  } = new _EventBroker.EventBroker(flowApi, {
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
      sequenceId = (0, _shared.getUniqueId)(id)
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

  function createMessage(override) {
    return { ...override,
      id,
      type,
      name,
      sourceId,
      targetId,
      isSequenceFlow: true,
      isDefault,
      parent: (0, _messageHelper.cloneParent)(parent)
    };
  }

  function getState() {
    return {
      id,
      type,
      name,
      sourceId,
      targetId,
      isDefault,
      counters: { ...counters
      },
      broker: broker.getState(true)
    };
  }

  function recover(state) {
    counters = { ...counters,
      ...state.counters
    };
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

  function shake(message) {
    const content = (0, _messageHelper.cloneContent)(message.content);
    content.sequence = content.sequence || [];
    content.sequence.push({
      id,
      type,
      isSequenceFlow: true,
      targetId
    });
    if (content.id === targetId) return broker.publish('event', 'flow.shake.loop', content, {
      persistent: false,
      type: 'shake'
    });

    for (const s of message.content.sequence) {
      if (s.id === id) return broker.publish('event', 'flow.shake.loop', content, {
        persistent: false,
        type: 'shake'
      });
    }

    broker.publish('event', 'flow.shake', content, {
      persistent: false,
      type: 'shake'
    });
  }

  function getCondition() {
    const conditionExpression = behaviour.conditionExpression;
    if (!conditionExpression) return null;
    const {
      language
    } = conditionExpression;
    const script = environment.getScript(language, flowApi);

    if (script) {
      return ScriptCondition(script, language);
    }

    if (!conditionExpression.body) {
      const msg = language ? `Condition expression script ${language} is unsupported or was not registered` : 'Condition expression without body is unsupported';
      return emitFatal(new Error(msg), createMessage());
    }

    return ExpressionCondition(conditionExpression.body);
  }

  function ScriptCondition(script, language) {
    return {
      language,

      execute(message, callback) {
        try {
          return script.execute((0, _ExecutionScope.default)(flowApi, message), callback);
        } catch (err) {
          if (!callback) throw err;
          logger.error(`<${id}>`, err);
          callback(err);
        }
      }

    };
  }

  function ExpressionCondition(expression) {
    return {
      execute: (message, callback) => {
        try {
          const result = environment.resolveExpression(expression, createMessage(message));
          if (callback) return callback(null, result);
          return result;
        } catch (err) {
          if (callback) return callback(err);
          throw err;
        }
      }
    };
  }
}