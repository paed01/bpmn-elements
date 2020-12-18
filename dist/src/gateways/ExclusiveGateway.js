"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ExclusiveGateway;
exports.ExclusiveGatewayBehaviour = ExclusiveGatewayBehaviour;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ExclusiveGateway(activityDef, context) {
  return (0, _Activity.default)(ExclusiveGatewayBehaviour, activityDef, context);
}

function ExclusiveGatewayBehaviour(activity) {
  const {
    id,
    type,
    broker
  } = activity;
  const source = {
    id,
    type,
    execute
  };
  return source;

  function execute({
    content
  }) {
    broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content, {
      outboundTakeOne: true
    }));
  }
}