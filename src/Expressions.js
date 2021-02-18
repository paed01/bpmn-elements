import getPropertyValue from './getPropertyValue';

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
  let result = templatedString;

  while (expressionPattern.test(result)) {
    const expressionMatch = result.match(expressionPattern);
    const innerProperty = expressionMatch[1];

    if (innerProperty === 'true') {
      return true;
    } else if (innerProperty === 'false') {
      return false;
    } else if (innerProperty === 'null') {
      return null;
    } else {
      const n = Number(innerProperty);
      if (!isNaN(n)) return n;
    }

    const contextValue = getPropertyValue(context, innerProperty, expressionFnContext);

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
