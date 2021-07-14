Expressions
===========

Expressions handler interface.

- `Expressions`
  - `resolveExpression(expression[, context, fnContext])`: resolve expression
  - `isExpression(testString)`: optional function to evaluate if string is an expression
  - `hasExpression(testString)`: optional function to evaluate if the string contains an expression

# Standard

## `resolveExpression(expression[, context, fnContext])`

Resolve expression.

Arguments:
- `expression`: expresion templated string
- `context`: optional context from where to resolve expressions
- `fnContext`: optional call context (this)

## `isExpression(testString)`

Evaluate if a string is an expression, and only an expression, e.g. `${environment.variables.supersecret}`.

## `hasExpression(testString)`

Evaluate if a string contains an expression, e.g. `${environment.variables.username}:${environment.variables.supersecret}`.

## Default expression handling

Default expressions come in the form of `${<variables or services>.<property name>}`.

The following expressions are supported:

- `${environment.variables.input}` - resolves to the variable input
- `${environment.variables.input[0]}` - resolves to first item of the variable input array
- `${environment.variables.input[-1]}` - resolves to last item of the variable input array
- `${environment.variables.input[spaced name]}` - resolves to the variable input object property `spaced name`

- `${environment.services.getInput}` - return the service function `getInput`
- `${environment.services.getInput()}` - executes the service function `getInput` with the argument `{services, variables}`
- `${environment.services.isBelow(content.input,2)}` - executes the service function `isBelow` with result of `variable.input` value and 2

- `I, ${content.id}, execute with id ${content.executionId}` - formats a string addressing content object values

and, as utility:

- `${true}` - return Boolean value `true`
- `${false}` - return Boolean value `false`

> Expressions in expressions is **not** supported and has unforeseeable outcome!


# Community

## [`expression-parser`](/aircall/aircall-expression-parser)

A far more advanced expression parser by [Aircall](/aircall).

`npm i @aircall/expression-parser`
