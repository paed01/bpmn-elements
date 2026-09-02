/**
 * BPMN error.
 * @param {import('#types').SerializableElement} errorDef
 * @param {import('#types').ContextInstance} context
 */
export function BpmnErrorActivity(errorDef, context) {
  const { id, type, name = 'BpmnError', behaviour = {} } = errorDef;
  const { environment } = context;

  return {
    id,
    type,
    name,
    errorCode: behaviour.errorCode,
    resolve,
  };

  /**
   * @param {import('#types').ElementBrokerMessage} executionMessage
   * @param {Error} [error]
   * @returns {import('#types').ResolvedReference & {code?:string}}
   */
  function resolve(executionMessage, error) {
    const resolveCtx = { ...executionMessage, error };
    /** @type {{ id?: string; type?: string; messageType: string; name: string; code: string | undefined; inner?: Error }} */
    const result = {
      id,
      type,
      messageType: 'throw',
      name: name && environment.resolveExpression(name, resolveCtx),
      code: behaviour.errorCode && environment.resolveExpression(behaviour.errorCode, resolveCtx),
    };

    if (error) result.inner = error;
    return /** @type {import('#types').ResolvedReference & {code?:string}} */ (result);
  }
}
