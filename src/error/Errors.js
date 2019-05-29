import {cloneMessage} from '../messageHelper';

class ActivityError extends Error {
  constructor(message, sourceMessage, inner) {
    super(message);
    this.name = this.constructor.name;
    if (sourceMessage) {
      const clone = cloneMessage(sourceMessage);
      this.fields = clone.fields && {...clone.fields};
      this.content = {...clone.content, error: undefined};
      this.properties = clone.properties;
    }
    if (!inner) return;

    this.inner = inner;
    if ('name' in inner) this.name = inner.name;
    if ('code' in inner) this.code = inner.code;
    if ('id' in inner) this.id = inner.id;
  }
}

class BpmnError extends Error {
  constructor(message, behaviour = {}, sourceMessage, inner) {
    const {errorCode} = behaviour;

    super(message);
    this.name = behaviour.name || this.constructor.name;
    this.code = 'errorCode' in behaviour && errorCode && errorCode.toString();
    this.id = behaviour.id;
    if (sourceMessage) {
      const clone = cloneMessage(sourceMessage);
      this.fields = clone.fields && {...clone.fields};
      this.content = {...clone.content, error: undefined};
      this.properties = clone.properties;
    }
    if (inner) this.inner = inner;
  }
}

export {
  ActivityError,
  BpmnError,
  createMessageFromError,
  makeErrorFromMessage
};

function createMessageFromError(error) {
  if (error instanceof BpmnError) return Object.assign({}, error);

  return {
    message: error.message,
    name: error.name,
    source: createSource(),
    inner: error,
  };

  function createSource() {
    if (!error.source) return;
    const {id, type, executionId} = error.source;
    return {
      id,
      type,
      executionId,
    };
  }
}

function makeErrorFromMessage({content}, caller) {
  if (content instanceof Error) return content;
  const {error} = content;

  if (error instanceof Error) return error;
  if (error instanceof ActivityError) return error;
  if (error instanceof BpmnError) return error;
  if (error.type === 'BpmnError') return new BpmnError(error.id, error.name, error.code, error.source, error.inner);

  const {message, name, source} = error;
  return new ActivityError(message, source || caller, name);
}
