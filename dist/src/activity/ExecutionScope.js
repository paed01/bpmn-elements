"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ExecutionScope;
var _messageHelper = require("../messageHelper");
var _Errors = require("../error/Errors");
function ExecutionScope(activity, initMessage) {
  const {
    id,
    type,
    environment,
    logger
  } = activity;
  const {
    fields,
    content,
    properties
  } = (0, _messageHelper.cloneMessage)(initMessage);
  const scope = {
    id,
    type,
    fields,
    content,
    properties,
    environment,
    logger,
    resolveExpression,
    ActivityError: _Errors.ActivityError,
    BpmnError: _Errors.BpmnError
  };
  return scope;
  function resolveExpression(expression) {
    return environment.resolveExpression(expression, scope);
  }
}