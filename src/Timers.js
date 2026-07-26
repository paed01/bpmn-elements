const K_EXECUTING = Symbol.for('executing');
const K_TIMER_API = Symbol.for('timers api');

const MAX_DELAY = 2147483647;

/**
 * Default timers handler
 * @param {import('#types').TimersOptions} [options]
 */
export function Timers(options) {
  this.count = 0;
  /** @type {Required<import('#types').TimersOptions>} */
  this.options = {
    setTimeout,
    clearTimeout,
    ...options,
  };
  /** @internal */
  this[K_EXECUTING] = new Set();
  /** @type {import('#types').wrappedSetTimeout} */
  this.setTimeout = this.setTimeout.bind(this);
  /** @type {import('#types').wrappedClearTimeout} */
  this.clearTimeout = this.clearTimeout.bind(this);
}

/** Executing timers */
Object.defineProperty(Timers.prototype, 'executing', {
  /** @returns {import('#types').Timer[]} */
  get() {
    return [...this[K_EXECUTING]];
  },
});

Timers.prototype.register = function register(owner) {
  return new RegisteredTimers(this, owner);
};

/**
 * @param {CallableFunction} callback
 * @param {number} delay
 * @param  {...any} args
 * @returns {import('#types').Timer}
 */
Timers.prototype.setTimeout = function wrappedSetTimeout(callback, delay, ...args) {
  return this._setTimeout(null, callback, delay, ...args);
};

/** @param {import('#types').Timer | ReturnType<setTimeout>} ref */
Timers.prototype.clearTimeout = function wrappedClearTimeout(ref) {
  if (this[K_EXECUTING].delete(ref)) {
    ref.timerRef = this.options.clearTimeout(ref.timerRef);
    return;
  }
  return this.options.clearTimeout(ref);
};

/**
 * @internal
 * @param {any} owner
 * @param {CallableFunction} callback
 * @param {number} delay
 * @param {any[]} args
 * @returns {import('#types').Timer}
 */
Timers.prototype._setTimeout = function setTimeout(owner, callback, delay, ...args) {
  const executing = this[K_EXECUTING];
  const ref = this._getReference(owner, callback, delay, args);
  executing.add(ref);
  if (delay < MAX_DELAY) {
    ref.timerRef = this.options.setTimeout(onTimeout, ref.delay, ...ref.args);
  }
  return ref;

  function onTimeout(...rargs) {
    executing.delete(ref);
    return callback(...rargs);
  }
};

/**
 * @internal
 * @param {any} owner
 * @param {CallableFunction} callback
 * @param {number} delay
 * @param {any[]} args
 * @returns {import('#types').Timer}
 */
Timers.prototype._getReference = function getReference(owner, callback, delay, args) {
  return new Timer(owner, `timer_${this.count++}`, callback, delay, args);
};

/**
 * @param {Timers} timersApi
 * @param {any} owner
 */
function RegisteredTimers(timersApi, owner) {
  /** @internal */
  this[K_TIMER_API] = timersApi;
  this.owner = owner;
  /** @type {import('#types').wrappedSetTimeout} */
  this.setTimeout = this.setTimeout.bind(this);
  /** @type {import('#types').wrappedClearTimeout} */
  this.clearTimeout = this.clearTimeout.bind(this);
}

/**
 * @internal
 * @param {CallableFunction} callback
 * @param {number} delay
 * @param {any[]} args
 * @returns {import('#types').Timer}
 */
RegisteredTimers.prototype.setTimeout = function registeredSetTimeout(callback, delay, ...args) {
  const timersApi = this[K_TIMER_API];
  return timersApi._setTimeout(this.owner, callback, delay, ...args);
};

/** @param {import('#types').Timer | ReturnType<setTimeout>} ref */
RegisteredTimers.prototype.clearTimeout = function registeredClearTimeout(ref) {
  this[K_TIMER_API].clearTimeout(ref);
};

function Timer(owner, timerId, callback, delay, args) {
  this.callback = callback;
  this.delay = delay;
  this.args = args;
  this.owner = owner;
  this.timerId = timerId;
  this.expireAt = new Date(Date.now() + delay);
  this.timerRef = null;
}
