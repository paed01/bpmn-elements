"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Message;

function Message(messageDef, context) {
  const {
    id,
    type,
    name,
    parent: originalParent
  } = messageDef;
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
      name: name && environment.resolveExpression(name, executionMessage),
      parent: { ...parent
      }
    };
  }
}