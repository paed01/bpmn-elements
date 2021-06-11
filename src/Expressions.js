export default function Expressions() {
  return {
    resolveExpression,
  };
}

function resolveExpression(templatedString, context) {
  return compile(templatedString)(context);
}

function compile(str) {
  if (typeof str !== 'string') {
    // we don't need to parse other type of values, return the value as it
    return () => str;
  }

  return (context) => {
    try {
      return parse(str)(context);
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
}

function parse(constable) {
  constable = constable.trim();
  const expRegEx = /^\$\{(.*)\}$/;
  const exp = constable.match(expRegEx);

  let parseStr;

  return (context) => {
    if (!exp || constable.replace(expRegEx, '') !== '') {
      // If there is more than one expression or we have strings outside the expression, we managed
      // it like an string and return a string
      parseStr = `${contextToString(context)}return \`${replaceNegativeIndexes(
        constable
      )}\`;`;
    } else {
      parseStr = `${contextToString(context)}return ${replaceNegativeIndexes(
        exp[1]
      )};`;
    }

    // eslint-disable-next-line no-new-func
    return Function('context', parseStr)(context);
  };
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

/**
 * Look for negative indexes with a regular expression in the string and
 * replace them with equivalent array operations
 */
function replaceNegativeIndexes(str) {
  const negativeArrayIndexesRegEx = /\s*\[\s*(-\s*\d)+\s*\]\s*/g;
  return str.replace(negativeArrayIndexesRegEx, '.slice($1).shift()');
}
