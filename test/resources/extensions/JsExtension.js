import fs from 'fs';
import { brokerSafeId } from '../../../src/shared.js';

// @ts-expect-error type coverage
const moddleOptions = JSON.parse(fs.readFileSync('./test/resources/js-bpmn-moddle.json'));

export default {
  extension: Js,
  moddleOptions,
};

function Js(activity, context) {
  // @ts-expect-error type coverage
  const resultVariable = ResultVariableIo(activity, context);
  const formKey = FormKey(activity, context);
  // @ts-expect-error type coverage
  const versionTag = VersionTag(activity, context);

  return {
    type: 'js:extension',
    extensions: { resultVariable, formKey, versionTag },
    activate(msg) {
      // @ts-expect-error type coverage
      if (resultVariable) resultVariable.activate(msg);
      // @ts-expect-error type coverage
      if (formKey) formKey.activate(msg);
      // @ts-expect-error type coverage
      if (versionTag) versionTag.activate(msg);
    },
    deactivate() {
      if (resultVariable) resultVariable.deactivate();
      if (formKey) formKey.deactivate();
      if (versionTag) versionTag.deactivate();
    },
  };
}

function ResultVariableIo(activity) {
  const { result } = activity.behaviour;
  if (!result) return;

  const { id, logger, environment } = activity;
  const { broker } = activity;

  const type = 'js:resultvariable';
  let activityConsumer;

  return {
    type,
    activate,
    deactivate,
  };

  function deactivate() {
    if (activityConsumer) activityConsumer = activityConsumer.cancel();
  }

  function activate() {
    if (activityConsumer) return;
    activityConsumer = broker.subscribeTmp('event', 'activity.end', onActivityEnd, { noAck: true });
  }

  function onActivityEnd(_, message) {
    const resultName = environment.resolveExpression(result, message.content);
    logger.debug(`<${id}> js:extension save to "${resultName}"`);

    environment.output[resultName] = message.content.output;
  }
}

function FormKey(activity, context) {
  const { id, logger, behaviour } = activity;
  const { formKey } = behaviour;
  if (!formKey) return;

  const { broker } = activity;
  const { environment } = context;

  const type = 'js:formkey';
  const safeType = brokerSafeId(type).toLowerCase();
  let activityConsumer;

  return {
    type,
    activate,
    deactivate,
  };

  function deactivate() {
    if (activityConsumer) activityConsumer = activityConsumer.cancel();
  }

  function activate() {
    if (activityConsumer) return;
    activityConsumer = broker.subscribeTmp('event', 'activity.start', onActivityStart, { noAck: true, consumerTag: '_' });
  }

  function onActivityStart(_, message) {
    const formKeyValue = environment.resolveExpression(formKey, message);
    logger.debug(`<${id}> apply form`);

    broker.publish('format', `run.${safeType}.start`, {
      form: {
        type,
        key: formKeyValue,
      },
    });
  }
}

function VersionTag(element) {
  if (element.type !== 'bpmn:Process') return;

  const { versionTag } = element.behaviour;
  if (!versionTag) return;

  const { id, logger, broker, environment } = element;

  const type = 'js:versiontag';
  let processConsumer;

  return {
    type,
    activate,
    deactivate,
  };

  function deactivate() {
    if (processConsumer) processConsumer = processConsumer.cancel();
  }

  function activate() {
    if (processConsumer) return;
    processConsumer = broker.subscribeTmp('event', 'process.end', onProcessEnd, { noAck: true });
  }

  function onProcessEnd() {
    logger.debug(`<${id}> js:extension capture version tag "${versionTag}"`);
    environment.output[id] = { versionTag };
  }
}
