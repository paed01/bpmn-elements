"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Escalation = Escalation;
/**
 * Escalation reference element. Resolves the escalation name expression against the execution message.
 * @param {import('moddle-context-serializer').SerializableElement} escalationDef
 * @param {import('#types').ContextInstance} context
 */
function Escalation(escalationDef, context) {
  if (!(this instanceof Escalation)) return new Escalation(escalationDef, context);
  const {
    id,
    type,
    name,
    parent
  } = escalationDef;
  this.id = id;
  this.type = type;
  this.name = name;
  /** @type {import('#types').ElementParent} */
  this.parent = {
    ...parent
  };
  this.environment = context.environment;
}

/**
 * Resolve escalation reference for the given execution message.
 * @param {import('#types').ElementBrokerMessage} executionMessage
 * @returns {import('#types').ResolvedReference}
 */
Escalation.prototype.resolve = function resolve(executionMessage) {
  const {
    id,
    type,
    name,
    parent
  } = this;
  return {
    id,
    type,
    messageType: 'escalation',
    name: name && this.environment.resolveExpression(name, executionMessage),
    parent: {
      ...parent
    }
  };
};