export default function Message(messageDef, context) {
  const {id, type, name, parent: originalParent} = messageDef;
  const {environment} = context;
  const parent = {...originalParent};

  return {
    id,
    type,
    name,
    parent,
    resolve,
  };

  function resolve(executionMessage) {
    return {
      id,
      type,
      messageType: 'message',
      name: name && environment.resolveExpression(name, executionMessage),
      parent: {...parent},
    };
  }
}
