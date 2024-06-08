const kExecuting = Symbol.for('executing');
const kTimerApi = Symbol.for('timers api');

const MAX_DELAY = 2147483647;

export function Timers(options) {
  this.count = 0;
  this.options = {
    setTimeout,
    clearTimeout,
    ...options,
  };
  this[kExecuting] = new Set();
  this.setTimeout = this.setTimeout.bind(this);
  this.clearTimeout = this.clearTimeout.bind(this);
}

Object.defineProperty(Timers.prototype, 'executing', {
  get() {
    return [...this[kExecuting]];
  },
});

Timers.prototype.register = function register(owner) {
  return new RegisteredTimers(this, owner);
};

Timers.prototype.setTimeout = function wrappedSetTimeout(callback, delay, ...args) {
  return this._setTimeout(null, callback, delay, ...args);
};

Timers.prototype.clearTimeout = function wrappedClearTimeout(ref) {
  if (this[kExecuting].delete(ref)) {
    ref.timerRef = this.options.clearTimeout(ref.timerRef);
    return;
  }
  return this.options.clearTimeout(ref);
};

Timers.prototype._setTimeout = function setTimeout(owner, callback, delay, ...args) {
  const executing = this[kExecuting];
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

Timers.prototype._getReference = function getReference(owner, callback, delay, args) {
  return new Timer(owner, `timer_${this.count++}`, callback, delay, args);
};

function RegisteredTimers(timersApi, owner) {
  this[kTimerApi] = timersApi;
  this.owner = owner;
  this.setTimeout = this.setTimeout.bind(this);
  this.clearTimeout = this.clearTimeout.bind(this);
}

RegisteredTimers.prototype.setTimeout = function registeredSetTimeout(callback, delay, ...args) {
  const timersApi = this[kTimerApi];
  return timersApi._setTimeout(this.owner, callback, delay, ...args);
};

RegisteredTimers.prototype.clearTimeout = function registeredClearTimeout(ref) {
  this[kTimerApi].clearTimeout(ref);
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
