"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OutboundEvaluator = OutboundEvaluator;
exports.formatFlowAction = formatFlowAction;
var _Errors = require("../error/Errors.js");
var _messageHelper = require("../messageHelper.js");
function OutboundEvaluator(activity, outboundFlows) {
  this.activity = activity;
  this.broker = activity.broker;
  const flows = this.outboundFlows = outboundFlows.slice();
  const defaultFlowIdx = flows.findIndex(({
    isDefault
  }) => isDefault);
  if (defaultFlowIdx > -1) {
    const [defaultFlow] = flows.splice(defaultFlowIdx, 1);
    flows.push(defaultFlow);
  }
  this.defaultFlowIdx = outboundFlows.findIndex(({
    isDefault
  }) => isDefault);
  this._onEvaluated = this.onEvaluated.bind(this);
  this.evaluateArgs = {};
}
OutboundEvaluator.prototype.evaluate = function evaluate(fromMessage, discardRestAtTake, callback) {
  const outboundFlows = this.outboundFlows;
  const args = this.evaluateArgs = {
    fromMessage,
    evaluationId: fromMessage.content.executionId,
    discardRestAtTake,
    callback,
    conditionMet: false,
    result: {},
    takenCount: 0
  };
  if (!outboundFlows.length) return this.completed();
  const flows = args.flows = outboundFlows.slice();
  this.broker.subscribeTmp('execution', 'evaluate.flow.#', this._onEvaluated, {
    consumerTag: `_flow-evaluation-${args.evaluationId}`
  });
  return this.evaluateFlow(flows.shift());
};
OutboundEvaluator.prototype.onEvaluated = function onEvaluated(routingKey, message) {
  const content = message.content;
  const {
    id: flowId,
    action,
    evaluationId
  } = message.content;
  const args = this.evaluateArgs;
  if (action === 'take') {
    args.takenCount++;
    args.conditionMet = true;
  }
  args.result[flowId] = content;
  if ('result' in content) {
    this.activity.logger.debug(`<${evaluationId} (${this.activity.id})> flow <${flowId}> evaluated to: ${!!content.result}`);
  }
  let nextFlow = args.flows.shift();
  if (!nextFlow) return this.completed();
  if (args.discardRestAtTake && args.conditionMet) {
    do {
      args.result[nextFlow.id] = formatFlowAction(nextFlow, {
        action: 'discard'
      });
    } while (nextFlow = args.flows.shift());
    return this.completed();
  }
  if (args.conditionMet && nextFlow.isDefault) {
    args.result[nextFlow.id] = formatFlowAction(nextFlow, {
      action: 'discard'
    });
    return this.completed();
  }
  message.ack();
  this.evaluateFlow(nextFlow);
};
OutboundEvaluator.prototype.evaluateFlow = function evaluateFlow(flow) {
  const broker = this.broker;
  const {
    fromMessage,
    evaluationId
  } = this.evaluateArgs;
  flow.evaluate((0, _messageHelper.cloneMessage)(fromMessage), (err, result) => {
    if (err) return this.completed(err);
    const action = result ? 'take' : 'discard';
    return broker.publish('execution', 'evaluate.flow.' + action, formatFlowAction(flow, {
      action,
      result,
      evaluationId
    }), {
      persistent: false
    });
  });
};
OutboundEvaluator.prototype.completed = function completed(err) {
  const {
    callback,
    evaluationId,
    fromMessage,
    result,
    takenCount
  } = this.evaluateArgs;
  this.broker.cancel(`_flow-evaluation-${evaluationId}`);
  if (err) return callback(err);
  if (!takenCount && this.outboundFlows.length) {
    const nonTakenError = new _Errors.ActivityError(`<${this.activity.id}> no conditional flow taken`, fromMessage);
    return callback(nonTakenError);
  }
  const message = fromMessage.content.message;
  const evaluationResult = [];
  for (const flow of Object.values(result)) {
    evaluationResult.push({
      ...flow,
      ...(message !== undefined && {
        message
      })
    });
  }
  return callback(null, evaluationResult);
};
function formatFlowAction(flow, options) {
  return {
    ...options,
    id: flow.id,
    action: options.action,
    targetId: flow.targetId,
    ...(flow.isDefault && {
      isDefault: true
    })
  };
}