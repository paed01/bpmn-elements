# CallActivity

# Behaviour

Call activity will wait for called process to complete.

Process defined in the same definition can be started. If the process is not found the call activity expects to be signaled or cancelled.

Emits `activity.call` event with `calledElement` property containing the id of the process. Expressions can be used to resolve the `calledElement` property value.

If the call activity is cancelled the target process is discarded.

If the target process is discarded the call activity is cancelled.

If the target process throws the call activity is errored. The call activity can catch the error with a boundary error event.

## Passing input to the called process

If the call activity run message carries an `input` property, it is forwarded to the called process and seeded as `environment.variables.input`, so the called process and its activities can resolve `${environment.variables.input}`.

The call activity does not populate `input` itself — set it during formatting, e.g. from an extension that publishes a `format` message on enter:

```js
function callInput(activity) {
  if (activity.type !== 'bpmn:CallActivity') return;
  return {
    activate() {
      activity.broker.subscribeTmp(
        'event',
        'activity.enter',
        () => {
          activity.broker
            .getQueue('format-run-q')
            .queueMessage({ routingKey: 'run.input.format' }, { input: { shoeSize: 42 } }, { persistent: false });
        },
        { noAck: true, consumerTag: '_call-input' }
      );
    },
    deactivate() {
      activity.broker.cancel('_call-input');
    },
  };
}
```

The same applies to an embedded sub process: format `input` onto the sub process (use the same extension, gated on `activity.type === 'bpmn:SubProcess'`) and it is seeded as `environment.variables.input` for the sub process execution and its child activities.

### Multi-instance loop context

A multi-instance call activity or sub process seeds `environment.variables.input` of each iteration with its loop context — an object with `isSequential`, `index`, and `cardinality`, plus the iteration item under the loop `elementVariable` name (default `item`) for a collection loop. The iteration can then resolve e.g. `${environment.variables.input.item}` or `${environment.variables.input.index}`.

Any `input` already formatted onto the iteration content is incorporated into this object and takes precedence over the loop context keys on conflict.
