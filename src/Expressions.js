// import getPropertyValue from './getPropertyValue';
import template from './parser/templateCompiler';

const isExpressionPattern = /^\${(.+?)}$/;
const expressionPattern = /\${(.+?)}/;

export default function Expressions() {
  return {
    resolveExpression,
    isExpression,
    hasExpression,
  };
}

function resolveExpression(templatedString, context, expressionFnContext) {
  return template(templatedString, { ...context, ...expressionFnContext });
}

function isExpression(text) {
  if (!text) return false;
  return isExpressionPattern.test(text);
}

function hasExpression(text) {
  if (!text) return false;
  return expressionPattern.test(text);
}
