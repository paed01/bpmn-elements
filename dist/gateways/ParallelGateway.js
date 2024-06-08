"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParallelGatewayBehaviour = ParallelGatewayBehaviour;
exports.default = ParallelGateway;
var _Activity = _interopRequireDefault(require("../activity/Activity.js"));
var _messageHelper = require("../messageHelper.js");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ParallelGateway(activityDef, context) {
  return new _Activity.default(ParallelGatewayBehaviour, {
    ...activityDef,
    isParallelGateway: true
  }, context);
}
function ParallelGatewayBehaviour(activity) {
  const {
    id,
    type,
    broker
  } = activity;
  this.id = id;
  this.type = type;
  this.broker = broker;
}
ParallelGatewayBehaviour.prototype.execute = function execute({
  content
}) {
  this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content));
};