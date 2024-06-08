"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ExclusiveGatewayBehaviour = ExclusiveGatewayBehaviour;
exports.default = ExclusiveGateway;
var _Activity = _interopRequireDefault(require("../activity/Activity.js"));
var _messageHelper = require("../messageHelper.js");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ExclusiveGateway(activityDef, context) {
  return new _Activity.default(ExclusiveGatewayBehaviour, activityDef, context);
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