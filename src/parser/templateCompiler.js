function template(str, locals = {}) {
  return template.compile(str).call(this, locals);
}

function replaceNegativeIndexes(str) {
  const negativeArrayIndexesRegEx = /\s*\[\s*(-\s*\d)+\s*\]\s*/g;
  return str.replace(negativeArrayIndexesRegEx, '.slice($1).shift()');
}

template.compile = function(str) {
  if (typeof str !== 'string') {
    // we don't need to parse other type of values, return the value as it
    return () => str;
  }

  const compiler = (toCompile) => (locals) => {
    try {
      return parse(toCompile).call(locals);
    } catch (err) {
      // support access to undefined object fields
      if (
        (err.name === 'TypeError' &&
          err.message.match(/^Cannot read property.+of undefined$/)) ||
        (err.name === 'ReferenceError' &&
          err.message.match(/^.+ is not defined$/))
      ) {
        return undefined;
      }
      err.message = 'Parser Error: ' + err.message;
      throw err;
    }
  };

  return compiler(str);
};

function contextToString(context = {}) {
  let declarationString = '';
  for (const key in context) {
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      declarationString += `const ${key}=locals['${key}'];this.${key}=locals['${key}'];`;
    }
  }
  return declarationString;
}

function parse(constable) {
  constable = constable.trim();
  const expRegEx = /^\$\{(.*)\}$/;
  const exp = constable.match(expRegEx);

  if (!exp || constable.replace(expRegEx, '') !== '') {
    // If there is more than one expression or we have strings outside the expression, we managed
    // it like an string
    return parseStr(constable);
  }

  return function() {
    // eslint-disable-next-line no-new-func
    return Function(
      'locals',
      contextToString(this) + 'return ' + replaceNegativeIndexes(exp[1])
    )(this);
  };
}

function parseStr(str) {
  return function() {
    // eslint-disable-next-line no-new-func
    return Function(
      'locals',
      contextToString(this) + 'return `' + replaceNegativeIndexes(str) + '`'
    )(this);
  };
}

export default template.render = template;
