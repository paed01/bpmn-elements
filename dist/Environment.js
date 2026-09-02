"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Environment = Environment;
var _Expressions = require("./Expressions.js");
var _Scripts = require("./Scripts.js");
var _Timers = require("./Timers.js");
const K_SERVICES = Symbol.for('services');
const K_VARIABLES = Symbol.for('variables');
const defaultOptions = new Set(['expressions', 'extensions', 'Logger', 'output', 'scripts', 'services', 'settings', 'timers', 'variables']);

/**
 * Holds global execution config: variables, injected services, timers, scripts engine,
 * expressions, Logger factory, and settings such as `batchSize`. Cloned and merged per Definition.
 * @param {import('#types').EnvironmentOptions} [options]
 */
function Environment(options = {}) {
  this.options = validateOptions(options);

  /** @type {import('#types').IExpressions} */
  this.expressions = options.expressions || (0, _Expressions.Expressions)();
  this.extensions = options.extensions;
  this.output = options.output || {};
  /** @type {import('#types').IScripts} */
  // @ts-ignore
  this.scripts = options.scripts || new _Scripts.Scripts();
  /** @type {import('#types').ITimers} */
  this.timers = options.timers || new _Timers.Timers();
  /** @type {import('#types').EnvironmentSettings} */
  this.settings = {
    ...options.settings
  };
  /** @type {import('#types').LoggerFactory} */
  this.Logger = options.Logger || DummyLogger;
  /** @internal */
  this[K_SERVICES] = options.services || {};
  /** @internal */
  this[K_VARIABLES] = options.variables || {};
}
Object.defineProperty(Environment.prototype, 'variables', {
  /** @returns {Record<string, any>} */
  get() {
    return this[K_VARIABLES];
  }
});
Object.defineProperty(Environment.prototype, 'services', {
  /** @returns {Record<string, import('#types').ServiceFunction>} */
  get() {
    return this[K_SERVICES];
  },
  set(value) {
    const services = this[K_SERVICES];
    for (const name in services) {
      if (!(name in value)) delete services[name];
    }
    Object.assign(services, value);
  }
});

/**
 * Snapshot environment state for recover.
 * @returns {import('#types').EnvironmentState}
 */
Environment.prototype.getState = function getState() {
  return {
    settings: {
      ...this.settings
    },
    variables: {
      ...this[K_VARIABLES]
    },
    output: {
      ...this.output
    }
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
 * @returns {Environment}
 */
Environment.prototype.clone = function clone(overrideOptions) {
  const services = this[K_SERVICES];
  const newOptions = {
    settings: {
      ...this.settings
    },
    variables: {
      ...this[K_VARIABLES]
    },
    Logger: this.Logger,
    extensions: this.extensions,
    scripts: this.scripts,
    timers: this.timers,
    expressions: this.expressions,
    ...this.options,
    ...overrideOptions,
    services
  };
  if (overrideOptions?.services) newOptions.services = {
    ...services,
    ...overrideOptions.services
  };

  // @ts-ignore
  return new this.constructor(newOptions);
};

/**
 * Merge variables into the environment. Non-objects are ignored.
 * @param {Record<string, any>} [newVars]
 */
Environment.prototype.assignVariables = function assignVariables(newVars) {
  if (!newVars || typeof newVars !== 'object') return;
  this[K_VARIABLES] = {
    ...this.variables,
    ...newVars
  };
};

/**
 * Merge settings into the environment. Non-objects are ignored.
 * @param {import('#types').EnvironmentSettings} [newSettings]
 * @returns {this}
 */
Environment.prototype.assignSettings = function assignSettings(newSettings) {
  if (!newSettings || typeof newSettings !== 'object') return this;
  this.settings = {
    ...this.settings,
    ...newSettings
  };
  return this;
};

/**
 * Resolve a registered script by language and identifier.
 * @param {[language: string, identifier: { id: string, [x: string]: any }]} args
 */
Environment.prototype.getScript = function getScript(...args) {
  return this.scripts.getScript(...args);
};

/**
 * Register a script for an activity, delegating to the configured scripts engine.
 * @param {[activity: any]} args
 */
Environment.prototype.registerScript = function registerScript(...args) {
  return this.scripts.register(...args);
};

/**
 * Lookup a registered service by name.
 * @param {string} serviceName
 * @returns {import('#types').ServiceFunction | undefined}
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
    ...message
  };
  return this.expressions.resolveExpression(expression, from, expressionFnContext);
};

/**
 * Register a service callable by name.
 * @param {string} name service function name
 * @param {import('#types').ServiceFunction} fn service function
 */
Environment.prototype.addService = function addService(name, fn) {
  this[K_SERVICES][name] = fn;
};

/**
 * @param {import('#types').EnvironmentOptions} input
 * @returns {import('#types').EnvironmentOptions} validated options
 */
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
    warn
  };
  function debug() {}
  function error() {}
  function warn() {}
}