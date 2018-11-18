import expressions from './expressions';
import {Scripts as IScripts} from './Scripts';

const defaultOptions = ['extensions', 'output', 'services', 'scripts', 'settings', 'variables'];

export default function Environment(options = {}) {
  const initialOptions = validateOptions(options);

  const initialSettings = {...(options.settings || {})};
  const initialOutput = options.output || {};
  const initialVariables = options.variables || {};
  const services = options.services || {};
  const scripts = options.scripts || IScripts();
  const Logger = options.Logger || DummyLogger;
  const extensions = options.extensions;

  return init(initialOptions, initialSettings, initialVariables, initialOutput);

  function init(clonedOptions, settings, variables, output) {
    const environmentApi = {
      options: clonedOptions,
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
      getInput,
      getOutput,
      getScript,
      getServiceByName,
      getState,
      registerScript,
      resolveExpression,
      recover,
      Logger,
    };

    return environmentApi;

    function getState() {
      return {
        settings: {...settings},
        variables: {...variables},
        output: {...output},
      };
    }

    function recover(state) {
      if (!state) return environmentApi;

      const recoverOptions = {
        services,
        scripts,
        Logger,
        extensions,
        settings: {
          ...state.settings || {},
          ...settings,
        },
        variables: {
          ...variables,
          ...state.variables || {},
        },
        output: {
          ...output,
          ...state.output || {},
        },
      };

      return Environment(recoverOptions);
    }

    function clone(overrideOptions = {}) {
      const newOptions = {
        settings: {...settings},
        variables: {...variables},
        output: {...output},
        Logger,
        extensions,
        ...overrideOptions,
        scripts,
        services,
      };

      if (overrideOptions.services) newOptions.services = {...services, ...overrideOptions.services};

      return Environment(newOptions);
    }

    function assignVariables(newVars) {
      if (!newVars || typeof newVars !== 'object') return;

      variables = {
        ...variables,
        ...newVars,
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
        ...message,
      };

      return expressions(expression, from, expressionFnContext);
    }

    function getInput() {
      return Object.assign({}, initialOptions, {
        variables: initialVariables,
      });
    }
    function getOutput() {
      return output;
    }
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
  };
  function debug() {}
  function error() {}
}
