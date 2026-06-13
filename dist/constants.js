"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.STATE_VERSION = exports.K_TARGETS = exports.K_STOPPED = exports.K_STATUS = exports.K_STATE_MESSAGE = exports.K_REFERENCE_INFO = exports.K_REFERENCE_ELEMENT = exports.K_MESSAGE_Q = exports.K_MESSAGE_HANDLERS = exports.K_EXTENSIONS = exports.K_EXECUTION = exports.K_EXECUTE_MESSAGE = exports.K_COUNTERS = exports.K_CONSUMING = exports.K_COMPLETED = exports.K_ACTIVATED = void 0;
const K_ACTIVATED = exports.K_ACTIVATED = Symbol.for('activated');
const K_COMPLETED = exports.K_COMPLETED = Symbol.for('completed');
const K_CONSUMING = exports.K_CONSUMING = Symbol.for('consuming');
const K_COUNTERS = exports.K_COUNTERS = Symbol.for('counters');
const K_EXECUTE_MESSAGE = exports.K_EXECUTE_MESSAGE = Symbol.for('executeMessage');
const K_EXECUTION = exports.K_EXECUTION = Symbol.for('execution');
const K_EXTENSIONS = exports.K_EXTENSIONS = Symbol.for('extensions');
const K_MESSAGE_HANDLERS = exports.K_MESSAGE_HANDLERS = Symbol.for('messageHandlers');
const K_MESSAGE_Q = exports.K_MESSAGE_Q = Symbol.for('messageQ');
const K_REFERENCE_ELEMENT = exports.K_REFERENCE_ELEMENT = Symbol.for('referenceElement');
const K_REFERENCE_INFO = exports.K_REFERENCE_INFO = Symbol.for('referenceInfo');
const K_STATE_MESSAGE = exports.K_STATE_MESSAGE = Symbol.for('stateMessage');
const K_STATUS = exports.K_STATUS = Symbol.for('status');
const K_STOPPED = exports.K_STOPPED = Symbol.for('stopped');
const K_TARGETS = exports.K_TARGETS = Symbol.for('targets');

/**
 * State version. Tracks the package major; bump on each major. Recovering an older major triggers
 * migrations. Unstamped legacy states are treated as version 0.
 */
const STATE_VERSION = exports.STATE_VERSION = 18;