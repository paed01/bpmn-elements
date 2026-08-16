import { getPropertyValue } from './getPropertyValue.js';
const isExpressionPattern = /^\${(.+?)}$/;
const expressionPattern = /\${(.+?)}/;

/**
 * Default expression handler
 */
export function Expressions() {
  return {
    resolveExpression,
    isExpression,
    hasExpression,
  };
}

/**
 * Resolve expression(s) in a templated string
 * @param {string} templatedString
 * @param {any} [context] resolution context, e.g. an element execution message
 * @param {any} [expressionFnContext] this-context for called expression functions
 */
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

/**
 * Text is a lone expression
 * @param {string} [text]
 */
function isExpression(text) {
  if (!text) return false;
  return isExpressionPattern.test(text);
}

/**
 * Text contains one or more expressions
 * @param {string} [text]
 */
function hasExpression(text) {
  if (!text) return false;
  return expressionPattern.test(text);
}
