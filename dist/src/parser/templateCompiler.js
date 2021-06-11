"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

function template(str, locals = {}) {
  return template.compile(str).call(this, locals);
}

function replaceNegativeIndexes(str) {
  const negativeArrayIndexesRegEx = /\s*\[\s*(-\s*\d)+\s*\]\s*/g;
  return str.replace(negativeArrayIndexesRegEx, '.slice($1).shift()');
}

template.compile = function (str) {
  if (typeof str !== 'string') {
    return () => str;
  }

  const isStringTemplate = toCheck => {
    const rest = toCheck.trim();

    const isQuote = c => c === '"' || c === '\'' || c === '`';

    return isQuote(rest[0]) && isQuote(rest[rest.length - 1]) && rest[0] === rest[rest.length - 1];
  };

  const compiler = toCompile => locals => {
    try {
      if (isStringTemplate(toCompile)) {
        return parseStr(toCompile.slice(1, -1)).call(locals);
      }

      return parse(toCompile).call(locals);
    } catch (err) {
      err.message = 'Parser Error: ' + err.message;
      throw err;
    }
  };

  return compiler(str);
};

function contextToString(context) {
  let declarationString = '';

  for (const key in context) {
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      declarationString += `const ${key}=locals['${key}'];`;
    }
  }

  return declarationString;
}

function parse(constable) {
  constable = constable.trim();
  const expRegEx = /^\$\{(.*)\}$/;
  const exp = constable.match(expRegEx);

  if (!exp) {
    return () => constable;
  } else if (constable.replace(expRegEx, '') !== '') {
    throw new Error('Malformed expression. Only one expression is allowed. If you want to combine expressions, pass a string with all the possible values');
  }

  return function () {
    // eslint-disable-next-line no-new-func
    return Function('locals', contextToString(this) + 'return ' + replaceNegativeIndexes(exp[1]))(this);
  };
}

function parseStr(str) {
  return function () {
    // eslint-disable-next-line no-new-func
    return Function('locals', contextToString(this) + 'return `' + replaceNegativeIndexes(str) + '`')(this);
  };
}

var _default = template.render = template;

exports.default = _default;