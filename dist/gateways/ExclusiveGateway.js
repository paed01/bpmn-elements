"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ExclusiveGateway = ExclusiveGateway;
exports.ExclusiveGatewayBehaviour = ExclusiveGatewayBehaviour;
var _Activity = require("../activity/Activity.js");
var _messageHelper = require("../messageHelper.js");
/**
 * Exclusive gateway
 * @param {import('moddle-context-serializer').Activity} activityDef
 * @param {import('#types').ContextInstance} context
 */
function ExclusiveGateway(activityDef, context) {
  return new _Activity.Activity(ExclusiveGatewayBehaviour, activityDef, context);
}

/**
 * Exclusive gateway behaviour
 * @param {import('#types').Activity} activity
 */
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

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
ExclusiveGatewayBehaviour.prototype.execute = function execute({
  content
}) {
  this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content, {
    outboundTakeOne: true
  }));
};