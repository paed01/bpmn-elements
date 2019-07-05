"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = EventBasedGateway;
exports.EventBasedGatewayBehaviour = EventBasedGatewayBehaviour;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function EventBasedGateway(activityDef, context) {
  return (0, _Activity.default)(EventBasedGatewayBehaviour, { ...activityDef
  }, context);
}

function EventBasedGatewayBehaviour(activity, context) {
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
    const isRedelivered = executeMessage.fields.redelivered;
    const content = (0, _messageHelper.cloneContent)(executeMessage.content);
    const executionId = content.executionId;
    const outbound = content.outbound = [];
    const targets = [];

    for (let i = 0; i < outboundSequenceFlows.length; i++) {
      const flow = outboundSequenceFlows[i];
      targets.push(context.getActivityById(flow.targetId));
      outbound.push({
        id: flow.id,
        action: 'take'
      });
    }

    const targetConsumerTag = `_gateway-listener-${executionId}`;
    targets.forEach(target => {
      target.broker.subscribeOnce('event', 'activity.end', onTargetCompleted, {
        consumerTag: targetConsumerTag
      });
    });
    broker.subscribeOnce('api', `activity.stop.${executionId}`, stop, {
      noAck: true,
      consumerTag: `_api-stop-${executionId}`
    });
    if (!isRedelivered) return broker.publish('execution', 'execute.outbound.take', content);

    function onTargetCompleted(_, message, owner) {
      logger.debug(`<${executionId} (${id})> <${message.content.executionId}> completed run, discarding the rest`);
      targets.forEach(target => {
        if (target === owner) return;
        target.broker.cancel(targetConsumerTag);
        target.discard();
      });
      const completedContent = (0, _messageHelper.cloneContent)(executeMessage.content);
      completedContent.ignoreOutbound = true;
      broker.publish('execution', 'execute.completed', completedContent);
    }

    function stop() {
      targets.forEach(target => {
        target.broker.cancel(targetConsumerTag);
      });
      broker.cancel(`_api-stop-${executionId}`);
    }
  }
}