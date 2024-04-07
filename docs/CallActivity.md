# CallActivity

# Behaviour

Call activity will wait for called process to complete.

Process defined in the same definition can be started. If the process is not found the call activity expects to be signaled or cancelled.

Emits `activity.call` event with `calledElement` property containing the id of the process. Expressions can be used to resolve the `calledElement` property value.

If the call activity is cancelled the target process is discarded.

If the target process is discarded the call activity is cancelled.

If the target process throws the call activity is errored. The call activity can catch the error with a boundary error event.
