"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.InclusiveGatewayBehaviour = InclusiveGatewayBehaviour;
exports.default = InclusiveGateway;
var _Activity = _interopRequireDefault(require("../activity/Activity.js"));
var _messageHelper = require("../messageHelper.js");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function InclusiveGateway(activityDef, context) {
  return new _Activity.default(InclusiveGatewayBehaviour, activityDef, context);
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