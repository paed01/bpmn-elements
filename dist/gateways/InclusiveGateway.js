"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.InclusiveGateway = InclusiveGateway;
exports.InclusiveGatewayBehaviour = InclusiveGatewayBehaviour;
var _Activity = require("../activity/Activity.js");
var _messageHelper = require("../messageHelper.js");
/**
 * Inclusive gateway
 * @param {import('moddle-context-serializer').Activity} activityDef
 * @param {import('#types').ContextInstance} context
 */
function InclusiveGateway(activityDef, context) {
  return new _Activity.Activity(InclusiveGatewayBehaviour, activityDef, context);
}

/**
 * Inclusive gateway behaviour
 * @param {import('#types').Activity} activity
 */
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

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
InclusiveGatewayBehaviour.prototype.execute = function execute({
  content
}) {
  this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content, {
    requireOutbound: true
  }));
};