"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RunError = exports.BpmnError = exports.ActivityError = void 0;
exports.makeErrorFromMessage = makeErrorFromMessage;
var _messageHelper = require("../messageHelper.js");
class ActivityError extends Error {
  /**
   * @param {string} [description]
   * @param {import('#types').ElementBrokerMessage} [sourceMessage]
   * @param {Error | { name?: string; code?: string | number }} [inner]
   */
  constructor(description, sourceMessage, inner) {
    super(description);
    /** @type {string} */
    this.type = 'ActivityError';
    /** @type {string} */
    this.name = this.constructor.name;
    /** @type {string} */
    this.description = description;
    if (sourceMessage) {
      /** @type {Pick<import('#types').ElementBrokerMessage, 'fields' | 'content' | 'properties'> | undefined} */
      this.source = (0, _messageHelper.cloneMessage)(sourceMessage, sourceMessage.content?.error && {
        error: undefined
      });
    }
    if (inner) {
      /** @type {Error | { name?: string; code?: string | number } | undefined} */
      this.inner = inner;
      if (inner.name) this.name = inner.name;
      if ('code' in inner && inner.code) {
        /** @type {string | number | undefined} */
        this.code = inner.code;
      }
    }
  }
}
exports.ActivityError = ActivityError;
class RunError extends ActivityError {
  /**
   * @param {ConstructorParameters<typeof ActivityError>} args
   */
  constructor(...args) {
    super(...args);
    this.type = 'RunError';
  }
}
exports.RunError = RunError;
class BpmnError extends Error {
  /**
   * @param {string} [description]
   * @param {{ id?: string; name?: string; errorCode?: string | number; code?: string }} [behaviour]
   * @param {import('#types').ElementBrokerMessage} [sourceMessage]
   */
  constructor(description, behaviour, sourceMessage) {
    super(description);
    /** @type {string} */
    this.type = 'BpmnError';
    /** @type {string} */
    this.name = behaviour?.name ?? this.constructor.name;
    /** @type {string} */
    this.description = description;
    /** @type {string | undefined} */
    this.code = behaviour?.errorCode?.toString() ?? behaviour?.code;
    /** @type {string | undefined} */
    this.id = behaviour?.id;
    if (sourceMessage) {
      /** @type {Pick<import('#types').ElementBrokerMessage, 'fields' | 'content' | 'properties'> | undefined} */
      this.source = (0, _messageHelper.cloneMessage)(sourceMessage, sourceMessage.content?.error && {
        error: undefined
      });
    }
  }
}

/**
 * Get an Error from an error message.
 * @param {import('#types').ElementBrokerMessage} errorMessage
 * @returns {Error | ActivityError | RunError | BpmnError}
 */
exports.BpmnError = BpmnError;
function makeErrorFromMessage(errorMessage) {
  const {
    content
  } = errorMessage;

  // @ts-ignore
  if (isKnownError(content)) return content;
  const {
    error
  } = content;
  if (!error) return new Error(`Malformatted error message with routing key ${errorMessage.fields?.routingKey}`);
  if (isKnownError(error)) return error;
  switch (error.type) {
    case 'ActivityError':
      return new ActivityError(error.message || error.description, error.source, error.inner ? error.inner : {
        code: error.code,
        name: error.name
      });
    case 'RunError':
      return new RunError(error.message || error.description, error.source, error.inner ? error.inner : {
        code: error.code,
        name: error.name
      });
    case 'BpmnError':
      return new BpmnError(error.message || error.description, error, error.source);
  }
  return error;
}

/**
 * @param {any} test
 * @returns {Error | undefined}
 */
function isKnownError(test) {
  if (test instanceof ActivityError) return test;
  if (test instanceof BpmnError) return test;
  if (test instanceof Error) return test;
}