export const K_ACTIVATED = Symbol.for('activated');
export const K_COMPLETED = Symbol.for('completed');
export const K_CONSUMING = Symbol.for('consuming');
export const K_COUNTERS = Symbol.for('counters');
export const K_EXECUTE_MESSAGE = Symbol.for('executeMessage');
export const K_EXECUTION = Symbol.for('execution');
export const K_EXTENSIONS = Symbol.for('extensions');
export const K_MESSAGE_HANDLERS = Symbol.for('messageHandlers');
export const K_MESSAGE_Q = Symbol.for('messageQ');
export const K_REFERENCE_ELEMENT = Symbol.for('referenceElement');
export const K_REFERENCE_INFO = Symbol.for('referenceInfo');
export const K_STATE_MESSAGE = Symbol.for('stateMessage');
export const K_STATUS = Symbol.for('status');
export const K_STOPPED = Symbol.for('stopped');
export const K_TARGETS = Symbol.for('targets');

/**
 * State version. Tracks the package major; bump on each major. Recovering an older major triggers
 * migrations. Unstamped legacy states are treated as version 0.
 */
export const STATE_VERSION = 18;
