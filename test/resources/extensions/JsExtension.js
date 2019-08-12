import moddleOptions from '../js-bpmn-moddle.json';
import {brokerSafeId} from '../../../src/shared';

export default {
  extension: Js,
  moddleOptions,
};

function Js(activity, context) {
  const resultVariable = ResultVariableIo(activity, context);
  const formKey = FormKey(activity, context);
  const messageRef = MessageRef(activity, context);

  return {
    type: 'js:extension',
    extensions: {resultVariable, formKey},
    activate(msg) {
      if (resultVariable) resultVariable.activate(msg);
      if (formKey) formKey.activate(msg);
      if (messageRef) messageRef.activate(msg);
    },
    deactivate() {
      if (resultVariable) resultVariable.deactivate();
      if (formKey) formKey.deactivate();
      if (messageRef) messageRef.deactivate();
    },
  };
}

function ResultVariableIo(activity, context) {
  const {id, logger, behaviour} = activity;
  const {result} = behaviour;
  if (!result) return;

  const {broker} = activity;
  const {environment} = context;

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
    activityConsumer = broker.subscribeTmp('event', 'activity.end', onActivityEnd, {noAck: true});
  }

  function onActivityEnd(_, message) {
    const resultName = environment.resolveExpression(result, message.content);
    logger.debug(`<${id}>`, 'js:extension save to', `"${resultName}"`);

    environment.output[resultName] = message.content.output;
  }
}

function FormKey(activity, context) {
  const {id, logger, behaviour} = activity;
  const {formKey} = behaviour;
  if (!formKey) return;

  const {broker} = activity;
  const {environment} = context;

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
    activityConsumer = broker.subscribeTmp('event', 'activity.start', onActivityStart, {noAck: true, consumerTag: '_'});
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

function MessageRef(activity, context) {
  const {id, logger, behaviour} = activity;
  const {messageRef} = behaviour;
  if (typeof messageRef !== 'string') return;


  const {broker} = activity;

  const type = 'js:messageRef';
  const safeType = brokerSafeId(type).toLowerCase();

  return {
    type,
    activate,
    deactivate,
  };

  function deactivate() {
    broker.cancel('_task-message-ref');
  }

  function activate() {
    broker.subscribeTmp('event', 'activity.execution.completed', onActivityExecutionCompleted, {noAck: true, consumerTag: '_task-message-ref', priority: 400});
  }

  function onActivityExecutionCompleted(_, completeMessage) {
    const messageElement = context.getActivityById(messageRef);
    logger.debug(`<${id}> send message <${messageRef}>`);

    const message = messageElement ? messageElement.resolve(completeMessage) : {id: messageRef};

    broker.publish('format', `run.${safeType}.message`, {
      message,
    });
  }

}
