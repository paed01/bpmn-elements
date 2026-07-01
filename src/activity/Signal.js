/**
 * Signal reference element. Resolves the signal name expression against the execution message.
 * @param {import('moddle-context-serializer').SerializableElement} signalDef
 * @param {import('#types').ContextInstance} context
 */
export function Signal(signalDef, context) {
  if (!(this instanceof Signal)) return new Signal(signalDef, context);
  const { id, type = 'Signal', name, parent } = signalDef;
  this.id = id;
  this.type = type;
  this.name = name;
  /** @type {import('#types').ElementParent} */
  this.parent = { ...parent };
  this.environment = context.environment;
}

/**
 * Resolve signal reference for the given execution message.
 * @param {import('#types').ElementBrokerMessage} executionMessage
 * @returns {import('#types').ResolvedReference}
 */
Signal.prototype.resolve = function resolve(executionMessage) {
  const { id, type, name, parent } = this;
  return {
    id,
    type,
    messageType: 'signal',
    ...(name && { name: this.environment.resolveExpression(name, executionMessage) }),
    parent: { ...parent },
  };
};
