"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Expressions;

var _getPropertyValue = _interopRequireDefault(require("./getPropertyValue"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const isExpressionPattern = /^\${(.+?)}$/;
const expressionPattern = /\${(.+?)}/;

function Expressions() {
  return {
    resolveExpression,
    isExpression,
    hasExpression
  };
}

function resolveExpression(templatedString, context, expressionFnContext) {
  let result = templatedString;

  while (expressionPattern.test(result)) {
    const expressionMatch = result.match(expressionPattern);
    const innerProperty = expressionMatch[1];

    if (innerProperty === 'true') {
      return true;
    } else if (innerProperty === 'false') {
      return false;
    }

    const contextValue = (0, _getPropertyValue.default)(context, innerProperty, expressionFnContext);

    if (expressionMatch.input === expressionMatch[0]) {
      return contextValue;
    }

    result = result.replace(expressionMatch[0], contextValue === undefined ? '' : contextValue);
  }

  return result;
}

function isExpression(text) {
  if (!text) return false;
  return isExpressionPattern.test(text);
}

function hasExpression(text) {
  if (!text) return false;
  return expressionPattern.test(text);
}