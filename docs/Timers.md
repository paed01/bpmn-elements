Timers
======

Timers handler. The purpose is to keep track of executing timers. Can be added to inline script context to override builtin timers.

# `Timers(options)`

Default timers behavior.

Arguments:
- `options`: optional object
  - `setTimeout`: optional function, defaults to builtin `setTimeout`
  - `clearTimeout`: optional function, defaults to builtin `clearTimeout`

Returns:
- `executing`: list with executing timers
- `register(owner)`: register timers owner
- `setTimeout`: wrapped options `setTimeout`
- `clearTimeout`: wrapped options `clearTimeout`

## `register(owner)`

Register timers with owner. Called from TimerEventDefinition.

Arguments:
- `owner`: owning object, usually the activity in question

Returns:
- `setTimeout`: calls `setTimeout`
- `clearTimeout`: clear timeout function

## `setTimeout(callback, delay, ...args)`

Adds timer to list of executing timers, calls options `setTimeout`, and returns timer.

Returns timer:
- `timerId`: unique id
- `owner`: registered owner if any, defaults to timers instance
- `timerRef`: return value of builtin or overridden `setTimeout`

## `clearTimeout(ref)`

Removes timer from list of executing timers and calls options `clearTimeout` with `ref.timerRef`.
