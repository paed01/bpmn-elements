import {cloneMessage} from '../messageHelper';
import {ActivityError, BpmnError} from '../error/Errors';

export default function ExecutionScope(activity, initMessage) {
  const {id, type, environment, logger} = activity;

  const {fields, content, properties} = cloneMessage(initMessage);

  const scope = {
    id,
    type,
    fields,
    content,
    properties,
    environment,
    logger,
    resolveExpression,
    ActivityError,
    BpmnError,
  };

  return scope;

  function resolveExpression(expression) {
    return environment.resolveExpression(expression, scope);
  }
}
