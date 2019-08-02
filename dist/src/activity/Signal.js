"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Signal;

function Signal(signalDef, context) {
  const {
    id,
    type,
    name,
    parent: originalParent
  } = signalDef;
  const {
    environment
  } = context;
  const parent = { ...originalParent
  };
  return {
    id,
    type,
    name,
    parent,
    resolve
  };

  function resolve(executionMessage) {
    return {
      id,
      type,
      messageType: 'signal',
      name: name && environment.resolveExpression(name, executionMessage),
      parent: { ...parent
      }
    };
  }
}