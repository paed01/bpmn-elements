CallActivity
============

Call activity behaviour.

Emits `activity.call` event with `calledElement` property containing the id of the process. Expressions can be used to resolve the `calledElement` property value.

Process defined in the same definition can be started. If the process is not found the call activity expects to be signaled.
