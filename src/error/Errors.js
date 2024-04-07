import { cloneMessage } from '../messageHelper.js';

class ActivityError extends Error {
  constructor(description, sourceMessage, inner) {
    super(description);
    this.type = 'ActivityError';
    this.name = this.constructor.name;
    this.description = description;
    if (sourceMessage)
      this.source = cloneMessage(sourceMessage, sourceMessage.content && sourceMessage.content.error && { error: undefined });
    if (inner) {
      this.inner = inner;
      if (inner.name) this.name = inner.name;
      if (inner.code) this.code = inner.code;
    }
  }
}

class RunError extends ActivityError {}

class BpmnError extends Error {
  constructor(description, behaviour = {}, sourceMessage, inner) {
    const { errorCode } = behaviour;

    super(description);
    this.type = 'BpmnError';
    this.name = behaviour.name || this.constructor.name;
    this.description = description;
    this.code = ('errorCode' in behaviour && errorCode && errorCode.toString()) || behaviour.code;
    this.id = behaviour.id;
    if (sourceMessage)
      this.source = cloneMessage(sourceMessage, sourceMessage.content && sourceMessage.content.error && { error: undefined });
    if (inner) this.inner = inner;
  }
}

export { ActivityError, BpmnError, RunError, makeErrorFromMessage };

function makeErrorFromMessage(errorMessage) {
  const { content } = errorMessage;
  if (isKnownError(content)) return content;

  const { error } = content;
  if (!error) return new Error(`Malformatted error message with routing key ${errorMessage.fields && errorMessage.fields.routingKey}`);

  if (isKnownError(error)) return error;
  switch (error.type) {
    case 'ActivityError':
      return new ActivityError(
        error.message || error.description,
        error.source,
        error.inner ? error.inner : { code: error.code, name: error.name },
      );
    case 'RunError':
      return new RunError(
        error.message || error.description,
        error.source,
        error.inner ? error.inner : { code: error.code, name: error.name },
      );
    case 'BpmnError':
      return new BpmnError(error.message || error.description, error, error.source);
  }

  return error;
}

function isKnownError(test) {
  if (test instanceof ActivityError) return test;
  if (test instanceof BpmnError) return test;
  if (test instanceof Error) return test;
}
