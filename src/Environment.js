import { Expressions } from './Expressions.js';
import { Scripts } from './Scripts.js';
import { Timers } from './Timers.js';

const K_SERVICES = Symbol.for('services');
const K_VARIABLES = Symbol.for('variables');

const defaultOptions = new Set(['expressions', 'extensions', 'Logger', 'output', 'scripts', 'services', 'settings', 'timers', 'variables']);

/**
 * Holds global execution config: variables, injected services, timers, scripts engine,
 * expressions, Logger factory, and settings such as `batchSize`. Cloned and merged per Definition.
 * @param {import('#types').EnvironmentOptions} [options]
 */
export function Environment(options = {}) {
  this.options = validateOptions(options);

  this.expressions = options.expressions || Expressions();
  this.extensions = options.extensions;
  this.output = options.output || {};
  this.scripts = options.scripts || new Scripts();
  this.timers = options.timers || new Timers();
  this.settings = { skipDiscard: true, ...options.settings };
  this.Logger = options.Logger || DummyLogger;
  this[K_SERVICES] = options.services || {};
  this[K_VARIABLES] = options.variables || {};
}

Object.defineProperty(Environment.prototype, 'variables', {
  /** @returns {Record<string, any>} */
  get() {
    return this[K_VARIABLES];
  },
});

Object.defineProperty(Environment.prototype, 'services', {
  /** @returns {Record<string, CallableFunction>} */
  get() {
    return this[K_SERVICES];
  },
  set(value) {
    const services = this[K_SERVICES];
    for (const name in services) {
      if (!(name in value)) delete services[name];
    }
    Object.assign(services, value);
  },
});

/**
 * Snapshot environment state for recover.
 * @returns {import('#types').EnvironmentState}
 */
Environment.prototype.getState = function getState() {
  return {
    settings: { ...this.settings },
    variables: { ...this[K_VARIABLES] },
    output: { ...this.output },
  };
};

/**
 * Restore environment state captured by getState. Merges into the existing settings,
 * variables, and output rather than replacing them.
 * @param {import('#types').EnvironmentState} [state]
 * @returns {this}
 */
Environment.prototype.recover = function recover(state) {
  if (!state) return this;

  if (state.settings) Object.assign(this.settings, state.settings);
  if (state.variables) Object.assign(this[K_VARIABLES], state.variables);
  if (state.output) Object.assign(this.output, state.output);

  return this;
};

/**
 * Clone the environment, optionally overriding options. Services are merged when
 * `overrideOptions.services` is supplied.
 * @param {import('#types').EnvironmentOptions} [overrideOptions]
 */
Environment.prototype.clone = function clone(overrideOptions) {
  const services = this[K_SERVICES];
  const newOptions = {
    settings: { ...this.settings },
    variables: { ...this[K_VARIABLES] },
    Logger: this.Logger,
    extensions: this.extensions,
    scripts: this.scripts,
    timers: this.timers,
    expressions: this.expressions,
    ...this.options,
    ...overrideOptions,
    services,
  };

  if (overrideOptions?.services) newOptions.services = { ...services, ...overrideOptions.services };

  return new this.constructor(newOptions);
};

/**
 * Merge variables into the environment. Non-objects are ignored.
 * @param {Record<string, any>} newVars
 */
Environment.prototype.assignVariables = function assignVariables(newVars) {
  if (!newVars || typeof newVars !== 'object') return;

  this[K_VARIABLES] = {
    ...this.variables,
    ...newVars,
  };
};

/**
 * Merge settings into the environment. Non-objects are ignored.
 * @param {import('#types').EnvironmentSettings} newSettings
 * @returns {this}
 */
Environment.prototype.assignSettings = function assignSettings(newSettings) {
  if (!newSettings || typeof newSettings !== 'object') return this;

  this.settings = {
    ...this.settings,
    ...newSettings,
  };

  return this;
};

/**
 * Resolve a registered script by language and identifier.
 * @param {string} language
 * @param {{ id: string, [x: string]: any }} identifier
 */
Environment.prototype.getScript = function getScript(...args) {
  return this.scripts.getScript(...args);
};

/**
 * Register a script for an activity, delegating to the configured scripts engine.
 * @param {any} activity
 */
Environment.prototype.registerScript = function registerScript(...args) {
  return this.scripts.register(...args);
};

/**
 * Lookup a registered service by name.
 * @param {string} serviceName
 */
Environment.prototype.getServiceByName = function getServiceByName(serviceName) {
  return this[K_SERVICES][serviceName];
};

/**
 * Resolve an expression with the environment as scope, optionally extended by an element message.
 * @param {string} expression
 * @param {import('#types').ElementBrokerMessage} [message] Element message merged onto the resolution scope
 * @param {any} [expressionFnContext]
 */
Environment.prototype.resolveExpression = function resolveExpression(expression, message, expressionFnContext) {
  const from = {
    environment: this,
    ...message,
  };

  return this.expressions.resolveExpression(expression, from, expressionFnContext);
};

/**
 * Register a service callable by name.
 * @param {string} name
 * @param {CallableFunction} fn
 */
Environment.prototype.addService = function addService(name, fn) {
  this[K_SERVICES][name] = fn;
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

/**
 * @returns {import('#types').ILogger}
 */
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
