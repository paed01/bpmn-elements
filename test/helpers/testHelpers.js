import * as types from '../../index';
import BpmnModdle from 'bpmn-moddle';
import Context from '../../src/Context';
import Debug from 'debug';
import Environment from '../../src/Environment';
import {default as Serializer, TypeResolver} from 'moddle-context-serializer';
import {Scripts} from './JavaScripts';

const typeResolver = TypeResolver(types);

export default {
  AssertMessage,
  context,
  moddleContext,
  Logger,
};

async function context(source, ...args) {
  const [options, callback] = getOptionsAndCallback(...args);
  const moddleCtx = await moddleContext(source, options);
  const serializer = Serializer(moddleCtx, typeResolver);

  const extensions = options && options.extensions && Object.keys(options.extensions).reduce((result, name) => {
    const extension = options.extensions[name].extension;
    if (extension) result[name] = extension;
    return result;
  }, {});

  const ctx = Context(serializer, Environment({Logger, scripts: Scripts(), ...options, extensions}));
  if (callback) {
    callback(null, ctx);
  }

  return ctx;
}

function moddleContext(source, options = {}) {
  const moddleOptions = options.extensions && Object.keys(options.extensions).reduce((result, ext) => {
    result[ext] = options.extensions[ext].moddleOptions;
    return result;
  }, {});

  const bpmnModdle = new BpmnModdle(moddleOptions);

  return new Promise((resolve, reject) => {
    bpmnModdle.fromXML(Buffer.isBuffer(source) ? source.toString() : source.trim(), (err, definitions, moddleCtx) => {
      if (err) return reject(err);
      resolve(moddleCtx);
    });
  });
}

export function Logger(scope) {
  return {
    debug: Debug('bpmn-elements:' + scope),
    error: Debug('bpmn-elements:error:' + scope),
    warn: Debug('bpmn-elements:warn:' + scope),
  };
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

    const activity = processContext.getChildActivityById(id);
    const {source, context: ctx, id} = message.content;
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
