/**
 * Message reference element. Resolves the message name expression against the execution message.
 * @param {import('moddle-context-serializer').SerializableElement} messageDef
 * @param {import('#types').ContextInstance} context
 */
export function Message(messageDef, context) {
  if (!(this instanceof Message)) return new Message(messageDef, context);
  const { id, type, name, parent } = messageDef;
  this.id = id;
  this.type = type;
  this.name = name;
  /** @type {import('#types').ElementParent} */
  this.parent = { ...parent };
  this.environment = context.environment;
}

/**
 * Resolve message reference for the given execution message.
 * @param {import('#types').ElementBrokerMessage} executionMessage
 */
Message.prototype.resolve = function resolve(executionMessage) {
  const { id, type, name, parent } = this;
  return {
    id,
    type,
    messageType: 'message',
    ...(name && { name: this.environment.resolveExpression(name, executionMessage) }),
    parent: { ...parent },
  };
};
