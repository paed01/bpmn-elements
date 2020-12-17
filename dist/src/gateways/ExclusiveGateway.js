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
    return activity.evaluateOutbound((0, _messageHelper.cloneMessage)(executeMessage), true, complete);

    function complete(err, outbound) {
      if (err) {
        const error = new _Errors.ActivityError(err.message, executeMessage, err);
        return broker.publish('execution', 'execute.error', { ...content,
          error
        });
      }

      if (!outbound) return broker.publish('execution', 'execute.completed', content);
      const taken = outbound.find(({
        action
      }) => action === 'take');

      if (!taken) {
        const error = new _Errors.ActivityError(`<${id}> no conditional flow taken`, executeMessage);
        logger.error(`<${id}>`, err);
        return broker.publish('execution', 'execute.error', { ...content,
          error
        });
      }

      if (taken.isDefault) {
        logger.debug(`<${id}> take default flow <${taken.id}>`);
      }

      return broker.publish('execution', 'execute.completed', { ...content,
        outbound
      });
    }
  }
}