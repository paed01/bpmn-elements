"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Environment;

var _Expressions = _interopRequireDefault(require("./Expressions"));

var _Scripts = require("./Scripts");

var _Timers = require("./Timers");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const kServices = Symbol.for('services');
const kVariables = Symbol.for('variables');
const defaultOptions = ['expressions', 'extensions', 'Logger', 'output', 'scripts', 'services', 'settings', 'timers', 'variables'];

function Environment(options = {}) {
  this.options = validateOptions(options);
  this.expressions = options.expressions || (0, _Expressions.default)();
  this.extensions = options.extensions;
  this.output = options.output || {};
  this.scripts = options.scripts || (0, _Scripts.Scripts)();
  this.timers = options.timers || (0, _Timers.Timers)();
  this.settings = { ...options.settings
  };
  this.Logger = options.Logger || DummyLogger;
  this[kServices] = options.services || {};
  this[kVariables] = options.variables || {};
}

const proto = Environment.prototype;
Object.defineProperty(proto, 'variables', {
  enumerable: true,

  get() {
    return this[kVariables];
  }

});
Object.defineProperty(proto, 'services', {
  enumerable: true,

  get() {
    return this[kServices];
  },

  set(value) {
    const services = this[kServices];

    for (const name in services) {
      if (!(name in value)) delete services[name];
    }

    Object.assign(services, value);
  }

});

proto.getState = function getState() {
  return {
    settings: { ...this.settings
    },
    variables: { ...this[kVariables]
    },
    output: { ...this.output
    }
  };
};

proto.recover = function recover(state) {
  if (!state) return this;
  if (state.settings) Object.assign(this.settings, state.settings);
  if (state.variables) Object.assign(this[kVariables], state.variables);
  if (state.output) Object.assign(this.output, state.output);
  return this;
};

proto.clone = function clone(overrideOptions = {}) {
  const services = this[kServices];
  const newOptions = {
    settings: { ...this.settings
    },
    variables: { ...this[kVariables]
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
  if (overrideOptions.services) newOptions.services = { ...services,
    ...overrideOptions.services
  };
  return new this.constructor(newOptions);
};

proto.assignVariables = function assignVariables(newVars) {
  if (!newVars || typeof newVars !== 'object') return;
  this[kVariables] = { ...this.variables,
    ...newVars
  };
};

proto.assignSettings = function assignVariables(newSettings) {
  if (!newSettings || typeof newSettings !== 'object') return;
  this.settings = { ...this.settings,
    ...newSettings
  };
};

proto.getScript = function getScript(...args) {
  return this.scripts.getScript(...args);
};

proto.registerScript = function registerScript(...args) {
  return this.scripts.register(...args);
};

proto.getServiceByName = function getServiceByName(serviceName) {
  return this[kServices][serviceName];
};

proto.resolveExpression = function resolveExpression(expression, message = {}, expressionFnContext) {
  const from = {
    environment: this,
    ...message
  };
  return this.expressions.resolveExpression(expression, from, expressionFnContext);
};

proto.addService = function addService(name, fn) {
  this[kServices][name] = fn;
};

function validateOptions(input) {
  const options = {};

  for (const key in input) {
    if (defaultOptions.indexOf(key) === -1) {
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
    warn
  };

  function debug() {}

  function error() {}

  function warn() {}
}