"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = BpmnErrorActivity;

function BpmnErrorActivity(errorDef, context) {
  const {
    id,
    type,
    name
  } = errorDef;
  const {
    environment
  } = context;
  const {
    errorCode
  } = errorDef.behaviour || {};
  return {
    id,
    errorCode,
    type,
    name,
    resolve
  };

  function resolve(executionMessage, error) {
    return {
      id,
      type,
      name,
      errorCode: errorCode && environment.resolveExpression(errorCode, { ...executionMessage,
        error
      })
    };
  }
}