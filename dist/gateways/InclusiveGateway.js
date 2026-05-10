"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.InclusiveGateway = InclusiveGateway;
exports.InclusiveGatewayBehaviour = InclusiveGatewayBehaviour;
var _Activity = require("../activity/Activity.js");
var _messageHelper = require("../messageHelper.js");
function InclusiveGateway(activityDef, context) {
  return new _Activity.Activity(InclusiveGatewayBehaviour, activityDef, context);
}
function InclusiveGatewayBehaviour(activity) {
  const {
    id,
    type,
    broker
  } = activity;
  this.id = id;
  this.type = type;
  this.broker = broker;
}
InclusiveGatewayBehaviour.prototype.execute = function execute({
  content
}) {
  this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content));
};