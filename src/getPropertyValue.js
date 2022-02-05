const propertyPattern = /(\w+)\((.*?)(?:\))|(\.|\[|^)(.+?)(?:\]|\[|\.|$)/;
const stringConstantPattern = /^(['"])(.*)\1$/;
const numberConstantPattern = /^\W*-?\d+(.\d+)?\W*$/;
const negativeIndexPattern = /^-\d+$/;

export default getPropertyValue;

function getPropertyValue(inputContext, propertyPath, fnScope) {
  if (!inputContext) return;

  let resultValue;
  let next = iterateProps(inputContext, inputContext, propertyPath.trim(), fnScope);
  while (next) {
    resultValue = next.getResult();
    next = next();
  }
  return resultValue;
}

function iterateProps(base, iterateContext, iteratePropertyPath, fnScope) {
  let result;
  const rest = iteratePropertyPath.replace(propertyPattern, (match, fnName, args, p, prop) => {
    if (fnName) {
      result = executeFn(getNamedValue(iterateContext, fnName), args, base, fnScope);
    } else {
      result = getNamedValue(iterateContext, prop);
    }
    return '';
  });

  if (rest === iteratePropertyPath) return;
  if (result === undefined || result === null) return;

  const iterateNext = () => iterateProps(base, result, rest, fnScope);
  iterateNext.getResult = () => {
    if (rest !== '') return;
    return result;
  };

  return iterateNext;
}

function executeFn(fn, args, base, fnScope) {
  if (!fn) return;

  let callArguments = [];
  if (args) {
    callArguments = splitArguments(args, base, fnScope);
  } else {
    callArguments.push(base);
  }

  if (!fnScope) return fn.apply(null, callArguments);

  return (function ScopedIIFE() { // eslint-disable-line no-extra-parens
    return fn.apply(this, callArguments);
  }).call(fnScope);
}

function splitArguments(args, base, fnScope) {
  let insideString = false;
  let delimiter = '';
  let argCompleted = false;
  let arg = '';

  const callArguments = [];

  for (let i = 0; i < args.length; i++) {
    const charPos = args.charAt(i);

    if (!insideString) {

      if (charPos === ',') {
        argCompleted = true;

      } else if (charPos !== ' ') {
        arg += charPos;

        if (charPos === '\'' || charPos === '"') {
          insideString = true;
          delimiter = charPos;
        }
      }
    } else {
      arg += charPos;
      if (charPos === delimiter) {
        argCompleted = true;
        delimiter = '';
      }
    }

    if (argCompleted) {

      if (arg.length > 0) {
        callArguments.push(getFunctionArgument(base, arg.trim(), fnScope));
      }
      arg = '';
      insideString = false;
      argCompleted = false;
    }
  }

  if (arg.trim() !== '') {
    callArguments.push(getFunctionArgument(base, arg.trim(), fnScope));
  }

  return callArguments;
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
