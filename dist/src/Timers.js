"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Timers = Timers;

function Timers(options) {
  let count = 0;
  const executing = [];
  options = {
    setTimeout,
    clearTimeout,
    ...options
  };
  const timersApi = {
    get executing() {
      return executing.slice();
    },

    register,
    setTimeout: wrappedSetTimeout,
    clearTimeout: wrappedClearTimeout
  };
  return timersApi;

  function register(owner) {
    return {
      setTimeout: registerTimeout(owner),
      clearTimeout: timersApi.clearTimeout
    };
  }

  function registerTimeout(owner) {
    return function registeredSetTimeout(...args) {
      return timersApi.setTimeout.call(owner, ...args);
    };
  }

  function wrappedSetTimeout(callback, delay, ...args) {
    const ref = {
      timerId: `timer_${count++}`,
      callback,
      delay,
      args,
      owner: this
    };
    executing.push(ref);
    ref.timerRef = options.setTimeout.call(this, onTimeout, delay, ...args);
    return ref;

    function onTimeout(...rargs) {
      const idx = executing.indexOf(ref);
      if (idx > -1) executing.splice(idx, 1);
      return callback(...rargs);
    }
  }

  function wrappedClearTimeout(ref) {
    const idx = executing.indexOf(ref);

    if (idx > -1) {
      const [{
        owner
      }] = executing.splice(idx, 1);
      return options.clearTimeout.call(owner, ref.timerRef);
    }

    return options.clearTimeout(ref);
  }
}