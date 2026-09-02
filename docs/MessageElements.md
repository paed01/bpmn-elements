# Message, Signal, Escalation

Reference elements that resolve a name expression against the execution message. Used by `Definition.sendMessage` and by message/signal/escalation event definitions to address a specific target.

Each element exposes the same shape and is instantiated automatically when the BPMN XML contains `bpmn:Message`, `bpmn:Signal`, or `bpmn:Escalation`.

Properties:

- `id`: element id
- `type`: element type, e.g. `bpmn:Message`
- `name`: optional name, may be an expression resolved against the execution message
- `parent`: parent element reference
- `environment`: shared [environment](/docs/Environment.md)

### `resolve(executionMessage)`

Resolve the reference for the given execution message. Returns an object with `id`, `type`, `messageType`, `name` (resolved if present), and `parent`. `messageType` is one of `'message'`, `'signal'`, or `'escalation'`.

Used internally by [`Definition.sendMessage`](/docs/Definition.md#sendmessagemessage) when the message id matches a Message, Signal, or Escalation element.
