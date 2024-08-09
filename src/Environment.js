import Expressions from './Expressions.js';
import { Scripts } from './Scripts.js';
import { Timers } from './Timers.js';

const kServices = Symbol.for('services');
const kVariables = Symbol.for('variables');

const defaultOptions = new Set(['expressions', 'extensions', 'Logger', 'output', 'scripts', 'services', 'settings', 'timers', 'variables']);

export default function Environment(options = {}) {
  this.options = validateOptions(options);

  this.expressions = options.expressions || Expressions();
  this.extensions = options.extensions;
  this.output = options.output || {};
  this.scripts = options.scripts || new Scripts();
  this.timers = options.timers || new Timers();
  this.settings = { ...options.settings };
  this.Logger = options.Logger || DummyLogger;
  this[kServices] = options.services || {};
  this[kVariables] = options.variables || {};
}

Object.defineProperties(Environment.prototype, {
  variables: {
    get() {
      return this[kVariables];
    },
  },
  services: {
    get() {
      return this[kServices];
    },
    set(value) {
      const services = this[kServices];
      for (const name in services) {
        if (!(name in value)) delete services[name];
      }
      Object.assign(services, value);
    },
  },
});

Environment.prototype.getState = function getState() {
  return {
    settings: { ...this.settings },
    variables: { ...this[kVariables] },
    output: { ...this.output },
  };
};

Environment.prototype.recover = function recover(state) {
  if (!state) return this;

  if (state.settings) Object.assign(this.settings, state.settings);
  if (state.variables) Object.assign(this[kVariables], state.variables);
  if (state.output) Object.assign(this.output, state.output);

  return this;
};

Environment.prototype.clone = function clone(overrideOptions = {}) {
  const services = this[kServices];
  const newOptions = {
    settings: { ...this.settings },
    variables: { ...this[kVariables] },
    Logger: this.Logger,
    extensions: this.extensions,
    scripts: this.scripts,
    timers: this.timers,
    expressions: this.expressions,
    ...this.options,
    ...overrideOptions,
    services,
  };

  if (overrideOptions.services) newOptions.services = { ...services, ...overrideOptions.services };

  return new this.constructor(newOptions);
};

Environment.prototype.assignVariables = function assignVariables(newVars) {
  if (!newVars || typeof newVars !== 'object') return;

  this[kVariables] = {
    ...this.variables,
    ...newVars,
  };
};

Environment.prototype.assignSettings = function assignSettings(newSettings) {
  if (!newSettings || typeof newSettings !== 'object') return;

  this.settings = {
    ...this.settings,
    ...newSettings,
  };
};

Environment.prototype.getScript = function getScript(...args) {
  return this.scripts.getScript(...args);
};

Environment.prototype.registerScript = function registerScript(...args) {
  return this.scripts.register(...args);
};

Environment.prototype.getServiceByName = function getServiceByName(serviceName) {
  return this[kServices][serviceName];
};

Environment.prototype.resolveExpression = function resolveExpression(expression, message = {}, expressionFnContext) {
  const from = {
    environment: this,
    ...message,
  };

  return this.expressions.resolveExpression(expression, from, expressionFnContext);
};

Environment.prototype.addService = function addService(name, fn) {
  this[kServices][name] = fn;
};

function validateOptions(input) {
  const options = {};
  for (const key in input) {
    if (!defaultOptions.has(key)) {
      options[key] = input[key];
    }
  }

  if (input.timers) {
    if (typeof input.timers.register !== 'function') throw new Error('timers.register is not a function');
    if (typeof input.timers.setTimeout !== 'function') throw new Error('timers.setTimeout is not a function');
    if (typeof input.timers.clearTimeout !== 'function') throw new Error('timers.clearTimeout is not a function');
  }

  if (input.scripts) {
    if (typeof input.scripts.register !== 'function') throw new Error('scripts.register is not a function');
    if (typeof input.scripts.getScript !== 'function') throw new Error('scripts.getScript is not a function');
  }

  if (input.extensions) {
    if (typeof input.extensions !== 'object') throw new Error('extensions is not an object');
    for (const key in input.extensions) {
      if (typeof input.extensions[key] !== 'function') throw new Error(`extensions[${key}] is not a function`);
    }
  }

  return options;
}

function DummyLogger() {
  return {
    debug,
    error,
    warn,
  };
  function debug() {}
  function error() {}
  function warn() {}
}
