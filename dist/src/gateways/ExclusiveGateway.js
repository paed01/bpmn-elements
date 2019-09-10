"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ExclusiveGateway;
exports.ExclusiveGatewayBehaviour = ExclusiveGatewayBehaviour;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _Errors = require("../error/Errors");

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ExclusiveGateway(activityDef, context) {
  return (0, _Activity.default)(ExclusiveGatewayBehaviour, activityDef, context);
}

function ExclusiveGatewayBehaviour(activity) {
  const {
    id,
    type,
    broker,
    logger,
    outbound: outboundSequenceFlows = []
  } = activity;
  const source = {
    id,
    type,
    execute
  };
  return source;

  function execute(executeMessage) {
    const content = (0, _messageHelper.cloneContent)(executeMessage.content);
    if (!outboundSequenceFlows.length) return complete();
    let conditionMet, defaultFlow, evaluateError;
    const outbound = content.outbound = [];

    for (let i = 0; i < outboundSequenceFlows.length; i++) {
      const flow = outboundSequenceFlows[i];

      if (conditionMet) {
        outbound.push({
          id: flow.id,
          action: 'discard'
        });
        continue;
      }

      if (flow.isDefault) {
        defaultFlow = flow;
        continue;
      }

      if (flow.evaluateCondition(executeMessage, onEvaluateError)) {
        conditionMet = true;
        outbound.push({
          id: flow.id,
          action: 'take'
        });
      } else {
        if (evaluateError) return broker.publish('execution', 'execute.error', (0, _messageHelper.cloneContent)(content, {
          error: evaluateError
        }));
        outbound.push({
          id: flow.id,
          action: 'discard'
        });
      }
    }

    if (defaultFlow) {
      if (conditionMet) {
        outbound.push({
          id: defaultFlow.id,
          action: 'discard'
        });
      } else {
        logger.debug(`<${id}> take default flow <${defaultFlow.id}>`);
        outbound.push({
          id: defaultFlow.id,
          action: 'take'
        });
      }
    } else if (!conditionMet) {
      const err = new _Errors.ActivityError(`<${id}> no conditional flow taken`, executeMessage);
      logger.error(`<${id}>`, err);
      return broker.publish('execution', 'execute.error', { ...content,
        error: err
      });
    }

    return complete();

    function complete() {
      broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content));
    }

    function onEvaluateError(err) {
      evaluateError = err;
    }
  }
}