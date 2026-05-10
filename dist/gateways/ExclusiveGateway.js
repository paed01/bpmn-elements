"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ExclusiveGateway = ExclusiveGateway;
exports.ExclusiveGatewayBehaviour = ExclusiveGatewayBehaviour;
var _Activity = require("../activity/Activity.js");
var _messageHelper = require("../messageHelper.js");
function ExclusiveGateway(activityDef, context) {
  return new _Activity.Activity(ExclusiveGatewayBehaviour, activityDef, context);
}
function ExclusiveGatewayBehaviour(activity) {
  const {
    id,
    type,
    broker
  } = activity;
  this.id = id;
  this.type = type;
  this.broker = broker;
}
ExclusiveGatewayBehaviour.prototype.execute = function execute({
  content
}) {
  this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content, {
    outboundTakeOne: true
  }));
};