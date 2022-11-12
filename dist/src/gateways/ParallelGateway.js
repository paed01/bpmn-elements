"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParallelGatewayBehaviour = ParallelGatewayBehaviour;
exports.default = ParallelGateway;
var _Activity = _interopRequireDefault(require("../activity/Activity"));
var _messageHelper = require("../messageHelper");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
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