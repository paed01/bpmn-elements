"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventBasedGatewayBehaviour = EventBasedGatewayBehaviour;
exports.default = EventBasedGateway;
var _Activity = _interopRequireDefault(require("../activity/Activity.js"));
var _messageHelper = require("../messageHelper.js");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const kCompleted = Symbol.for('completed');
const kTargets = Symbol.for('targets');
function EventBasedGateway(activityDef, context) {
  return new _Activity.default(EventBasedGatewayBehaviour, activityDef, context);
}
function EventBasedGatewayBehaviour(activity, context) {
  this.id = activity.id;
  this.type = activity.type;
  this.activity = activity;
  this.broker = activity.broker;
  this.context = context;
  this[kTargets] = activity.outbound.map(flow => context.getActivityById(flow.targetId));
}
EventBasedGatewayBehaviour.prototype.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;
  const {
    executionId,
    outbound = [],
    outboundTaken
  } = executeContent;
  const targets = this[kTargets];
  this[kCompleted] = false;
  if (!targets.length) return this._complete(executeContent);
  for (const flow of this.activity.outbound) {
    outbound.push({
      id: flow.id,
      action: 'take'
    });
  }
  if (!this[kCompleted] && outboundTaken) return;
  const targetConsumerTag = `_gateway-listener-${this.id}`;
  const onTargetCompleted = this._onTargetCompleted.bind(this, executeMessage);
  for (const target of this[kTargets]) {
    target.broker.subscribeOnce('event', 'activity.end', onTargetCompleted, {
      consumerTag: targetConsumerTag
    });
  }
  const broker = this.activity.broker;
  broker.subscribeOnce('api', `activity.stop.${executionId}`, () => this._stop(), {
    consumerTag: '_api-stop-execution'
  });
  this[kCompleted] = false;
  if (!executeMessage.fields.redelivered) return broker.publish('execution', 'execute.outbound.take', (0, _messageHelper.cloneContent)(executeContent, {
    outboundTaken: true
  }));
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
  for (const target of this[kTargets]) {
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
  this[kCompleted] = true;
  this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(completedContent));
};
EventBasedGatewayBehaviour.prototype._stop = function stop() {
  const targetConsumerTag = `_gateway-listener-${this.id}`;
  for (const target of this[kTargets]) target.broker.cancel(targetConsumerTag);
  this.broker.cancel('_api-stop-execution');
};