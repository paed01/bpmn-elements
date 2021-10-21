"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ParallelGateway;
exports.ParallelGatewayBehaviour = ParallelGatewayBehaviour;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ParallelGateway(activityDef, context) {
  return new _Activity.default(ParallelGatewayBehaviour, { ...activityDef,
    isParallelGateway: true
  }, context);
}

function ParallelGatewayBehaviour(activity) {
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