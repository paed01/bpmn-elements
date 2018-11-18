import getPropertyValue from './getPropertyValue';

const isExpressionPattern = /^\${(.+?)}$/;
const expressionPattern = /\${(.+?)}/;

export default resolveExpressions;

function resolveExpressions(templatedString, context, expressionFnContext) {
  let result = templatedString;

  while (expressionPattern.test(result)) {
    const expressionMatch = result.match(expressionPattern);
    const innerProperty = expressionMatch[1];

    if (innerProperty === 'true') {
      return true;
    } else if (innerProperty === 'false') {
      return false;
    }

    const contextValue = getPropertyValue(context, innerProperty, expressionFnContext);

    if (expressionMatch.input === expressionMatch[0]) {
      return contextValue;
    }

    result = result.replace(expressionMatch[0], contextValue === undefined ? '' : contextValue);
  }
  return result;
}

export function isExpression(text) {
  if (!text) return false;
  return isExpressionPattern.test(text);
}

export function hasExpression(text) {
  if (!text) return false;
  return expressionPattern.test(text);
}
