"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Expressions;

var _jsXRay = require("js-x-ray");

function Expressions() {
  return {
    resolveExpression
  };
}

function resolveExpression(templatedString, context) {
  return compile(templatedString)(context);
}

function compile(str) {
  if (typeof str !== 'string') {
    return () => str;
  }

  return context => {
    try {
      return parse(str)(context);
    } catch (err) {
      // support access to undefined object fields
      if (err.name === 'TypeError' && err.message.match(/^Cannot read property.+of undefined$/) || err.name === 'ReferenceError' && err.message.match(/^.+ is not defined$/)) {
        return undefined;
      }

      err.message = 'Parser Error: ' + err.message;
      throw err;
    }
  };
}

function parse(strToParse) {
  strToParse = removeBL(strToParse);
  const expRegEx = /\$\{.*\}/g;
  return context => {
    const returnLiteral = () => securityChecker(`${contextToString(context)}return ${prepareStr(strToParse.slice(2, -1))};`);

    const returnString = () => securityChecker(`${contextToString(context)}return \`${prepareStr(strToParse)}\`;`);

    try {
      return expRegEx.exec(strToParse) // eslint-disable-next-line no-new-func
      ? Function('context', returnLiteral())(context) // eslint-disable-next-line no-new-func
      : Function('context', returnString())(context);
    } catch (err) {
      // eslint-disable-next-line no-new-func
      return Function('context', returnString())(context);
    }
  };
}
/**
 * Remove break lines and spaces before and after the str
 */


function removeBL(str) {
  return str.replace(/[\r\n]+/gm, ' ').trim();
}
/**
 * @param {string} str Javascript code in string format to check if it is secure
 * @returns The str param or throw an error if the str in not secure
 */


function securityChecker(str) {
  const fnWrapperStr = `function check(context) {${str}}`;
  const {
    warnings,
    dependencies
  } = (0, _jsXRay.runASTAnalysis)(fnWrapperStr);
  const dependenciesName = [...dependencies];
  const inTryDeps = [...dependencies.getDependenciesInTryStatement()];

  if (dependenciesName.length > 0 || inTryDeps.length > 0) {
    throw new Error('Insecure module import');
  }

  if (warnings.length > 0) {
    throw new Error('Security problems detected: ' + warnings.join(', '));
  }

  return str;
}
/**
 *
 * @param {Object} context object to convert to a string variable
 * declaration
 * @returns string with all properties assigned to variables named with
 * context field names and the context fields added to the Function `this`
 * context
 */


function contextToString(context = {}) {
  let declarationString = '';

  for (const key in context) {
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      declarationString += `const ${key}=context['${key}'];this.${key}=context['${key}'];`;
    }
  }

  return declarationString;
}

function prepareStr(str) {
  return replaceNegativeIndexes(replaceEmptyFnToReceiveContext(str));
}
/**
 * Look for negative indexes with a regular expression in the string and
 * replace them with equivalent array operations
 */


function replaceNegativeIndexes(str) {
  const negativeArrayIndexesRegEx = /\s*\[\s*(-\s*\d)+\s*\]\s*/g;
  return str.replace(negativeArrayIndexesRegEx, '.slice($1).shift()');
}
/**
 * Pass the context to empty functions
 */


function replaceEmptyFnToReceiveContext(str) {
  const emptyFnRegEx = /((\w|_|\$)+(\w|\d|\$|_)*)[()]{2,}/g;
  return str.replace(emptyFnRegEx, '$1(this)');
}