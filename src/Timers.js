const K_EXECUTING = Symbol.for('executing');
const K_TIMER_API = Symbol.for('timers api');

const MAX_DELAY = 2147483647;

/**
 * @param {import('#types').TimersOptions} options
 */
export function Timers(options) {
  this.count = 0;
  this.options = {
    setTimeout,
    clearTimeout,
    ...options,
  };
  /** @internal */
  this[K_EXECUTING] = new Set();
  this.setTimeout = this.setTimeout.bind(this);
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

Timers.prototype.setTimeout = function wrappedSetTimeout(callback, delay, ...args) {
  return this._setTimeout(null, callback, delay, ...args);
};

Timers.prototype.clearTimeout = function wrappedClearTimeout(ref) {
  if (this[K_EXECUTING].delete(ref)) {
    ref.timerRef = this.options.clearTimeout(ref.timerRef);
    return;
  }
  return this.options.clearTimeout(ref);
};

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

/** @internal */
Timers.prototype._getReference = function getReference(owner, callback, delay, args) {
  return new Timer(owner, `timer_${this.count++}`, callback, delay, args);
};

function RegisteredTimers(timersApi, owner) {
  /** @internal */
  this[K_TIMER_API] = timersApi;
  this.owner = owner;
  this.setTimeout = this.setTimeout.bind(this);
  this.clearTimeout = this.clearTimeout.bind(this);
}

RegisteredTimers.prototype.setTimeout = function registeredSetTimeout(callback, delay, ...args) {
  const timersApi = this[K_TIMER_API];
  return timersApi._setTimeout(this.owner, callback, delay, ...args);
};

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
