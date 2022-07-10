export default function Signal(signalDef, context) {
  const {id, type = 'Signal', name, parent: originalParent} = signalDef;
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
      messageType: 'signal',
      ...(name && {name: environment.resolveExpression(name, executionMessage)}),
      parent: {...parent},
    };
  }
}
