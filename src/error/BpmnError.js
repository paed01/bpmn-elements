export default function BpmnErrorActivity(errorDef, context) {
  const { id, type, name = 'BpmnError', behaviour = {} } = errorDef;
  const { environment } = context;

  return {
    id,
    type,
    name,
    errorCode: behaviour.errorCode,
    resolve,
  };

  function resolve(executionMessage, error) {
    const resolveCtx = { ...executionMessage, error };
    const result = {
      id,
      type,
      messageType: 'throw',
      name: name && environment.resolveExpression(name, resolveCtx),
      code: behaviour.errorCode && environment.resolveExpression(behaviour.errorCode, resolveCtx),
    };

    if (error) result.inner = error;
    return result;
  }
}
