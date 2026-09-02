import Debug from 'debug';
import { BpmnModdle } from 'bpmn-moddle';
import * as types from 'bpmn-elements';

import { Context, Environment } from 'bpmn-elements';
import { Serializer, TypeResolver } from 'moddle-context-serializer';
import { Scripts } from './JavaScripts.js';

import camundaBpmnModdle from 'camunda-bpmn-moddle/resources/camunda.json' with { type: 'json' };

// @ts-expect-error type coverage
const typeResolver = TypeResolver(types);

export default {
  AssertMessage,
  context,
  emptyContext,
  moddleContext,
  Logger,
  camundaBpmnModdle,
};

/**
 * Context helper
 * @param {Buffer|string} source BPMN2 source
 * @param {...any} args
 * @returns {Promise<import('bpmn-elements').ContextInstance>}
 */
async function context(source, ...args) {
  const logger = Logger('test-helpers:context');

  const [options = {}, callback] = getOptionsAndCallback(...args);
  logger.debug('moddle context load');
  const moddleCtx = await moddleContext(source, options);
  logger.debug('moddle context complete');

  if (moddleCtx.warnings) {
    moddleCtx.warnings.forEach(({ error, message, element, property }) => {
      if (error) return logger.error(message);
      logger.error(`<${element.id}> ${property}:`, message);
    });
  }

  let resolver = typeResolver;
  if (options.types) {
    resolver = TypeResolver({ ...types, ...options.types });
  }

  const serializer = Serializer(moddleCtx, resolver, options.extendFn);

  const extensions =
    options &&
    options.extensions &&
    Object.keys(options.extensions).reduce((result, name) => {
      const extension = options.extensions[name].extension;
      if (extension) result[name] = extension;
      return result;
    }, {});

  const { settings, ...otherOptions } = options;
  const ctx = Context(
    serializer,
    new Environment({ Logger, scripts: new Scripts(), settings: { enableDummyService: true, ...settings }, ...otherOptions, extensions })
  );
  logger.debug('context complete');
  if (callback) {
    callback(null, ctx);
  }

  return ctx;
}

/**
 * Parse BPMN2 source into a moddle context
 * @param {Buffer|string} source BPMN2 source
 * @param {any} [options]
 * @returns {Promise<any>}
 */
function moddleContext(source, options = {}) {
  const moddleOptions =
    options.extensions &&
    Object.keys(options.extensions).reduce((result, ext) => {
      result[ext] = options.extensions[ext].moddleOptions;
      return result;
    }, {});

  const bpmnModdle = new BpmnModdle(moddleOptions);
  return bpmnModdle.fromXML(Buffer.isBuffer(source) ? source.toString() : source.trim());
}

/** @type {import('bpmn-elements').LoggerFactory} */
export function Logger(scope) {
  return {
    debug: Debug('bpmn-elements:' + scope),
    error: Debug('bpmn-elements:error:' + scope),
    warn: Debug('bpmn-elements:warn:' + scope),
  };
}

/**
 * Context helper without source, based on overridable serializable context stub
 * @param {any} [override]
 * @param {import('bpmn-elements').EnvironmentOptions} [options]
 * @returns {import('bpmn-elements').ContextInstance}
 */
function emptyContext(override, options) {
  return Context(
    {
      getActivities() {},
      getActivityExtensions() {},
      getAssociations() {},
      getInboundAssociations() {
        return [];
      },
      getInboundSequenceFlows() {
        return [];
      },
      getMessageFlows() {},
      getOutboundSequenceFlows() {
        return [];
      },
      getProcesses() {
        return [];
      },
      getExecutableProcesses() {
        return [];
      },
      getSequenceFlows() {},
      loadExtensions() {
        return {
          activate() {},
          deactivate() {},
        };
      },
      ...override,
    },
    new Environment({ Logger, scripts: new Scripts(), settings: { enableDummyService: true }, ...options })
  );
}

function AssertMessage(processContext, messages, inSequence) {
  return function assertMessage(routingKey, activityId, compareState) {
    if (!messages.length) {
      if (activityId) throw new Error(`${routingKey} <${activityId}> not found`);
      throw new Error(`${routingKey} not found`);
    }

    const message = messages.shift();

    if (!inSequence) {
      if (message.fields.routingKey !== routingKey) return assertMessage(routingKey, activityId);
      if (activityId && message.content.id !== activityId) return assertMessage(routingKey, activityId);
    }

    expect(message.fields, `${message.fields.routingKey} <${message.content.id}>`).to.have.property('routingKey', routingKey);
    if (activityId) expect(message.content).to.have.property('id', activityId);

    if (!compareState) return message;

    const { source, context: ctx, id } = message.content;
    const activity = processContext.getChildActivityById(id);
    const activityApi = activity.getApi(source, ctx);

    expect(activityApi.getState(), `${routingKey} ${activityId} state`).to.deep.include(compareState);

    return message;
  };
}

function getOptionsAndCallback(optionsOrCallback, callback, defaultOptions) {
  let options;
  if (typeof optionsOrCallback === 'function') {
    callback = optionsOrCallback;
    options = defaultOptions;
  } else {
    options = defaultOptions ? Object.assign(defaultOptions, optionsOrCallback) : optionsOrCallback;
  }

  return [options, callback];
}
