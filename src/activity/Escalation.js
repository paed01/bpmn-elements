export default function Escalation(signalDef, context) {
  const { id, type, name, parent: originalParent } = signalDef;
  const { environment } = context;
  const parent = { ...originalParent };

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
      messageType: 'escalation',
      name: name && environment.resolveExpression(name, executionMessage),
      parent: { ...parent },
    };
  }
}
