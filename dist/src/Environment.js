"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Environment;

var _Expressions = _interopRequireDefault(require("./Expressions"));

var _Scripts = require("./Scripts");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const defaultOptions = ['extensions', 'output', 'services', 'scripts', 'settings', 'variables', 'Logger'];

function Environment(options = {}) {
  const initialOptions = validateOptions(options);
  let variables = options.variables || {};
  const settings = { ...(options.settings || {})
  };
  const output = options.output || {};
  const services = options.services || {};
  const scripts = options.scripts || (0, _Scripts.Scripts)();
  const expressions = options.expressions || (0, _Expressions.default)();
  const Logger = options.Logger || DummyLogger;
  const extensions = options.extensions;
  const environmentApi = {
    options: initialOptions,
    expressions,
    extensions,
    output,
    scripts,
    services,
    settings,

    get variables() {
      return variables;
    },

    addService,
    assignVariables,
    clone,
    getScript,
    getServiceByName,
    getState,
    registerScript,
    resolveExpression,
    recover,
    Logger
  };
  return environmentApi;

  function getState() {
    return {
      settings: { ...settings
      },
      variables: { ...variables
      },
      output: { ...output
      }
    };
  }

  function recover(state) {
    if (!state) return environmentApi;
    const recoverOptions = validateOptions(state);
    Object.assign(options, recoverOptions);
    if (state.settings) Object.assign(settings, state.settings);
    if (state.variables) Object.assign(variables, state.variables);
    if (state.output) Object.assign(output, state.output);
    return environmentApi;
  }

  function clone(overrideOptions = {}) {
    const newOptions = {
      settings: { ...settings
      },
      variables: { ...variables
      },
      output: { ...output
      },
      Logger,
      extensions,
      scripts,
      expressions,
      ...initialOptions,
      ...overrideOptions,
      services
    };
    if (overrideOptions.services) newOptions.services = { ...services,
      ...overrideOptions.services
    };
    return Environment(newOptions);
  }

  function assignVariables(newVars) {
    if (!newVars || typeof newVars !== 'object') return;
    variables = { ...variables,
      ...newVars
    };
  }

  function getScript(...args) {
    return scripts.getScript(...args);
  }

  function registerScript(...args) {
    return scripts.register(...args);
  }

  function getServiceByName(serviceName) {
    return services[serviceName];
  }

  function resolveExpression(expression, message = {}, expressionFnContext) {
    const from = {
      environment: environmentApi,
      ...message
    };
    return expressions.resolveExpression(expression, from, expressionFnContext);
  }

  function addService(name, fn) {
    services[name] = fn;
  }
}

function validateOptions(input) {
  const options = {};

  for (const key in input) {
    if (defaultOptions.indexOf(key) === -1) {
      options[key] = input[key];
    }
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