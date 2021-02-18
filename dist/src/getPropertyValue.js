"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
const propertyPattern = /(\w+)\((.*?)(?:\))|(\.|\[|^)(.+?)(?:\]|\[|\.|$)/;
const stringConstantPattern = /^(['"])(.*)\1$/;
const numberConstantPattern = /^\W*-?\d+(.\d+)?\W*$/;
const negativeIndexPattern = /^-\d+$/;
var _default = getPropertyValue;
exports.default = _default;

function getPropertyValue(inputContext, propertyPath, fnScope) {
  if (!inputContext) return;
  let resultValue;
  let next = iterateProps(inputContext, inputContext, propertyPath.trim());

  while (next) {
    resultValue = next.getResult();
    next = next();
  }

  return resultValue;

  function iterateProps(base, iterateContext, iteratePropertyPath) {
    let result;
    const rest = iteratePropertyPath.replace(propertyPattern, (match, fnName, args, p, prop) => {
      if (fnName) {
        result = executeFn(getNamedValue(iterateContext, fnName), args, base);
      } else {
        result = getNamedValue(iterateContext, prop);
      }

      return '';
    });
    if (rest === iteratePropertyPath) return;
    if (result === undefined || result === null) return;

    const iterateNext = () => iterateProps(base, result, rest);

    iterateNext.getResult = () => {
      if (rest !== '') return;
      return result;
    };

    return iterateNext;
  }

  function executeFn(fn, args, base) {
    if (!fn) return;
    let callArguments = [];

    if (args) {
      callArguments = callArguments.concat(args.split(','));
      callArguments = callArguments.map(argument => {
        return getFunctionArgument(base, argument.trim(), fnScope);
      });
    } else {
      callArguments.push(base);
    }

    if (!fnScope) return fn.apply(null, callArguments);
    return function ScopedIIFE() {
      // eslint-disable-line no-extra-parens
      return fn.apply(this, callArguments);
    }.call(fnScope);
  }
}

function getFunctionArgument(obj, argument, fnScope) {
  const stringMatch = argument.match(stringConstantPattern);

  if (stringMatch) {
    return stringMatch[2];
  } else if (numberConstantPattern.test(argument)) {
    return Number(argument);
  }

  switch (argument) {
    case 'true':
      return true;

    case 'false':
      return false;

    case 'null':
      return null;

    default:
      return getPropertyValue(obj, argument, fnScope);
  }
}

function getNamedValue(obj, property) {
  if (Array.isArray(obj)) {
    return getArrayItem(obj, property);
  }

  return obj[property];
}

function getArrayItem(list, idx) {
  if (negativeIndexPattern.test(idx)) {
    const nidx = Number(idx);
    const aidx = nidx === 0 ? 0 : list.length + nidx;
    return list[aidx];
  }

  return list[idx];
}