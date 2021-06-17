Expressions
===========

Expressions handler interface.

- `Expressions`
  - `resolveExpression(expression[, context])`: resolve expression

## `resolveExpression(expression[, context])`

Resolve expression.

Arguments:
- `expression`: expression templated string
- `context`: optional context from where to resolve expressions
## Default expression handling

Default expressions come in the form of `${<JavaScript code to evaluate>}`. The templates are delimited with `${` and `}` strings and all the JavaScript code inside will be evaluated. If there is more than one expression or there is some text around the template, it will return a string evaluating all of them.

For example, with this context:
```JavaScript
{
  content: {
    input: 2,
    id: 'operation',
    executionId: 1234,
  },
  environment: {
    variables: { 
      input: 1,
      inputArray: [1, 2, 3],
      inputObject: {
        'spaced name': 'name'
      },
      getInput: (context) => {
        return context.environment.variables.input;
      },
      isBelow: (a, b) => a < b,
    commonVariablePrefix: "a",
    current: 2,
  },
}
```
The following expressions are supported:

| Template | Result | More information |
|-|-|-|
| `${environment.variables.input}` | `1` |  |
| `${environment.variables.inputArray[0]}` | `1` | resolves to first item of the variable input array |
| `${environment.variables.inputArray[-1]}` | `3` | resolves to last item of the variable input array |
| `${environment.variables.inputObject['spaced name']}` | `'name'` | resolves to the variable input object property `spaced name` |
| `${environment.services.getInput()}` | `1` | executes the service function `getInput` with the context passed as an argument |
| `${environment.services.getInput}` | `Function getInput()` | returns the service function |
| `${environment.services.isBelow(content.input,2)}` | `false` | executes the service function `isBelow` with `content.input` value and 2 |
| `I, ${content.id}, execute with id ${content.executionId}` | `'I, operation, execute with id 1234'` | formats a string getting content object values |
| `${true}` | `true` |  |
| `${false}` | `false` |  |
| `${null}` | `null` |  |
| `${undefined}` | `undefined` |  |
| `${<number>}` | `<number>` | returns the number passed |
| `${() => {}}` | `() => {}` | returns the lambda function |

> 
> It is possible to nest multiple expressions if you write them in proper JavaScript code. For example:
>
> Given this context:
> ```JavaScript
> {
>   environment: {
>     variables: {
>       a1: (v) => `method a1: ${v}`,
>       a2: (v) => `method a2: ${v}`,
>       a3: (v) => `method a3: ${v}`,
>     },
>     commonVariablePrefix: "a",
>     current: 2,
>   },
> };
> ```
> The expression
> ```JavaScript
>  ${environment.variables[`${environment.commonVariablePrefix}${environment.current}`]}
> ```
> returns the function: 
> ```JavaScript 
> (v) => `method a2: ${v}`
> ```
> 
