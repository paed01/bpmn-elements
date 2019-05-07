Shared Api
==========

Activity, Process, and Definition elements share the same api interface. The element must not necessarely implement listeners for all the api calls.

The Api is composed from the element event message.

Api properties:
- `id`: element id
- `type`: element type
- `executionId`: current execution id
- `environment`: shared [environment](/docs/Environment.md)
- `fields`: message fields
  - `routingKey`: message routing key
- `content`: message content
  - `id`: element id
  - `type`: element type
  - `executionId`: element execution id
  - `parent`: element parent
    - `id`: element parent id
    - `type`: element parent type
    - `executionId`: element parent unique execution id
      - `path`: list of parent parents
- `messageProperties`: message properties,
  - `messageId`: message id
- `owner`: api owner, i.e. the owning element instance
  - `broker`: element [broker](https://github.com/paed01/smqp)

### `cancel()`

Cancel run. Sends cancel message via element broker.

### `discard()`

Discard run. Sends discard message.

### `signal(message)`

Signal activity. Sends signal message.

### `stop()`

Stop element run. Sends stop message.

### `resolveExpression(expression)`

Resolve expression.

### `createMessage([overrideContent])`

Utility function to create new message content from the api message.
