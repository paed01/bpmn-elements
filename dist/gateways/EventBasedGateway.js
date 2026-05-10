"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventBasedGateway = EventBasedGateway;
exports.EventBasedGatewayBehaviour = EventBasedGatewayBehaviour;
var _Activity = require("../activity/Activity.js");
var _messageHelper = require("../messageHelper.js");
var _constants = require("../constants.js");
function EventBasedGateway(activityDef, context) {
  return new _Activity.Activity(EventBasedGatewayBehaviour, activityDef, context);
}
function EventBasedGatewayBehaviour(activity, context) {
  this.id = activity.id;
  this.type = activity.type;
  this.activity = activity;
  this.broker = activity.broker;
  this.context = context;
  /** @private */
  this[_constants.K_TARGETS] = new Set(activity.outbound.map(flow => context.getActivityById(flow.targetId)));
}
EventBasedGatewayBehaviour.prototype.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;
  const {
    executionId,
    outbound = [],
    outboundTaken
  } = executeContent;
  const targets = this[_constants.K_TARGETS];
  /** @private */
  this[_constants.K_COMPLETED] = false;
  if (!targets.size) return this._complete(executeContent);
  for (const flow of this.activity.outbound) {
    outbound.push({
      id: flow.id,
      action: 'take'
    });
  }
  if (!this[_constants.K_COMPLETED] && outboundTaken) return;
  const targetConsumerTag = `_gateway-listener-${this.id}`;
  const onTargetCompleted = this._onTargetCompleted.bind(this, executeMessage);
  for (const target of this[_constants.K_TARGETS]) {
    target.broker.subscribeOnce('event', 'activity.end', onTargetCompleted, {
      consumerTag: targetConsumerTag
    });
  }
  const broker = this.activity.broker;
  broker.subscribeOnce('api', `activity.stop.${executionId}`, () => this._stop(), {
    consumerTag: '_api-stop-execution'
  });

  /** @private */
  this[_constants.K_COMPLETED] = false;
  if (!executeMessage.fields.redelivered) {
    return broker.publish('execution', 'execute.outbound.take', (0, _messageHelper.cloneContent)(executeContent, {
      outboundTaken: true
    }));
  }
};
EventBasedGatewayBehaviour.prototype._onTargetCompleted = function onTargetCompleted(executeMessage, _, message, owner) {
  const {
    id: targetId,
    executionId: targetExecutionId
  } = message.content;
  const executeContent = executeMessage.content;
  const executionId = executeContent.executionId;
  this.activity.logger.debug(`<${executionId} (${this.id})> <${targetExecutionId}> completed run, discarding the rest`);
  this._stop();
  for (const target of this[_constants.K_TARGETS]) {
    if (target === owner) continue;
    target.discard();
  }
  const completedContent = (0, _messageHelper.cloneContent)(executeContent, {
    taken: {
      id: targetId,
      executionId: targetExecutionId
    },
    ignoreOutbound: true
  });
  this._complete(completedContent);
};
EventBasedGatewayBehaviour.prototype._complete = function complete(completedContent) {
  /** @private */
  this[_constants.K_COMPLETED] = true;
  this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(completedContent));
};
EventBasedGatewayBehaviour.prototype._stop = function stop() {
  const targetConsumerTag = `_gateway-listener-${this.id}`;
  for (const target of this[_constants.K_TARGETS]) target.broker.cancel(targetConsumerTag);
  this.broker.cancel('_api-stop-execution');
};