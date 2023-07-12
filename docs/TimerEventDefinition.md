TimerEventDefinition
====================

TimerEventDefinition behaviour.

# TimerEventDefinition events

The timer event definition publish a number of events.

## `activity.timer`

Fired when the timer is started.

Object with properties. A subset:

- `content:` object with activity and timer information
  - [`timeDuration`](#timeduration): the resolved time duration if any
  - [`timeDate`](#timedate): the resolved expire date if any
  - [`timeCycle`](#timecycle): the resolved time cycle if any
  - `startedAt`: timer started at date
  - `expireAt`: timer expires at date

## `activity.timeout`

Fired when the timer has timed out or was cancelled.

Object with `activity.timer` properties and some:

- `content:` object with activity and timer information
  - `stoppedAt`: stopped at date
  - `runningTime`: running for milliseconds

# `timeDuration`

Default support for ISO8601 duration. Will set a timer (`setTimeout`) for the duration and then complete when timed out. Invalid ISI8601 duration will stall the execution and wait for cancel.

# `timeDate`

Behaves the same as `timeDuration`. Due date will timeout immediately. An invalid date will stall the execution and wait for cancel.

# `timeCycle`

Default support for ISO8601 repeating interval.

If another format is used, e.g. cron, the event definition will wait until cancelled. There are several modules to handle time cycles and this project tries to keep the number of dependencies to a minimum.

# Combined `timeDuration` and `timeDate`

The shortest timeout will be picked to start the timer.

# Set your own timeout

If the parent event start message has an `expireAt` date or `timeout` positive integer property a timer will be started.

See how to format these messages [here](/docs/Extension.md).

# Api

Timer event definition api.

## `TimerEventDefinition.parse(timerType, value)`

Parse timer value into expire date.

Arguments:
- `timerType`: timer type string, one of `timeDuration`, `timeCycle`, or `timeDate`
- `value`: resolved expression timer string

Returns object:
- `expireAt`: expires at date
- `delay`: delay in milliseconds
- `repeat`: repeat number of times
