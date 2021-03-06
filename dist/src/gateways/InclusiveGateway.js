"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = InclusiveGateway;
exports.InclusiveGatewayBehaviour = InclusiveGatewayBehaviour;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function InclusiveGateway(activityDef, context) {
  return (0, _Activity.default)(InclusiveGatewayBehaviour, activityDef, context);
}

function InclusiveGatewayBehaviour(activity) {
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
    broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content));
  }
}