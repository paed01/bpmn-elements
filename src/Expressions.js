// import getPropertyValue from './getPropertyValue';
import template from './parser/templateCompiler';

export default function Expressions() {
  return {
    resolveExpression,
  };
}

function resolveExpression(templatedString, context, expressionFnContext) {
  return template(templatedString, { ...context, ...expressionFnContext });
}

