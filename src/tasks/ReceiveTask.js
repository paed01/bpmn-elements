import Activity from '../activity/Activity.js';
import {cloneContent} from '../messageHelper.js';

const kCompleted = Symbol.for('completed');
const kExecuteMessage = Symbol.for('executeMessage');
const kReferenceElement = Symbol.for('referenceElement');
const kReferenceInfo = Symbol.for('referenceInfo');

export default function ReceiveTask(activityDef, context) {
  const task = new Activity(ReceiveTaskBehaviour, activityDef, context);

  task.broker.assertQueue('message', {autoDelete: false, durable: true});
  task.broker.bindQueue('message', 'api', '*.message.#', {durable: true});

  return task;
}

export function ReceiveTaskBehaviour(activity) {
  const {id, type, behaviour} = activity;

  this.id = id;
  this.type = type;

  const reference = this.reference = {
    name: 'anonymous',
    ...behaviour.messageRef,
    referenceType: 'message',
  };

  this.loopCharacteristics = behaviour.loopCharacteristics && new behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  this.activity = activity;
  this.broker = activity.broker;

  this[kReferenceElement] = reference.id && activity.getActivityById(reference.id);
}

ReceiveTaskBehaviour.prototype.execute = function execute(executeMessage) {
  return new ReceiveTaskExecution(this).execute(executeMessage);
};

function ReceiveTaskExecution(parent) {
  const {activity, broker, loopCharacteristics, reference} = parent;

  this.id = activity.id;
  this.logger = activity.logger;
  this.reference = reference;
  this.broker = broker;
  this.loopCharacteristics = loopCharacteristics;
  this.referenceElement = parent[kReferenceElement];

  this[kCompleted] = false;
}

ReceiveTaskExecution.prototype.execute = function execute(executeMessage) {
  this[kExecuteMessage] = executeMessage;

  const executeContent = executeMessage.content;
  const {executionId, isRootScope} = executeContent;
  this.executionId = executionId;

  const info = this[kReferenceInfo] = this._getReferenceInfo(executeMessage);

  if (isRootScope) {
    this._setupMessageHandling(executionId);
  }

  const loopCharacteristics = this.loopCharacteristics;
  if (loopCharacteristics && executeMessage.content.isRootScope) {
    return loopCharacteristics.execute(executeMessage);
  }

  const broker = this.broker;
  broker.consume('message', this._onCatchMessage.bind(this), {
    noAck: true,
    consumerTag: `_onmessage-${executionId}`,
  });

  if (this[kCompleted]) return;

  broker.subscribeTmp('api', `activity.#.${executionId}`, this._onApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-${executionId}`,
    priority: 400,
  });

  this._debug(`expect ${info.description}`);

  broker.publish('event', 'activity.wait', cloneContent(executeContent, {message: {...info.message}}));
};

ReceiveTaskExecution.prototype._onCatchMessage = function onCatchMessage(routingKey, message) {
  const content = message.content;

  const {id: signalId, executionId: signalExecutionId} = content.message || {};
  const {message: referenceMessage, description} = this[kReferenceInfo];

  if (!referenceMessage.id && signalId || signalExecutionId) {
    if (this.loopCharacteristics && signalExecutionId !== this.executionId) return;
    if (signalId !== this.id && signalExecutionId !== this.executionId) return;
    this._debug('caught direct message');
  } else if (referenceMessage.id !== signalId) return;
  else {
    this._debug(`caught ${description}`);
  }

  const {type: messageType, correlationId} = message.properties;
  const broker = this.broker;
  const executeContent = this[kExecuteMessage].content;

  broker.publish('event', 'activity.consumed', cloneContent(executeContent, {message: {...message.content.message}}), {correlationId, type: messageType});
  broker.publish('event', 'activity.catch', cloneContent(executeContent, {message: message.content.message}), {type: 'catch', correlationId});

  this._complete(message.content.message, {correlationId});
};

ReceiveTaskExecution.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  const {type: messageType, correlationId} = message.properties;
  switch (messageType) {
    case 'message':
    case 'signal': {
      return this._complete(message.content.message, {correlationId});
    }
    case 'discard': {
      this[kCompleted] = true;
      this._stop();
      return this.broker.publish('execution', 'execute.discard', cloneContent(this[kExecuteMessage].content), {correlationId});
    }
    case 'stop': {
      return this._stop();
    }
  }
};

ReceiveTaskExecution.prototype._complete = function complete(output, options) {
  this[kCompleted] = true;
  this._stop();
  return this.broker.publish('execution', 'execute.completed', cloneContent(this[kExecuteMessage].content, {output}), options);
};

ReceiveTaskExecution.prototype._stop = function stop() {
  const broker = this.broker, executionId = this.executionId;
  broker.cancel(`_onmessage-${executionId}`);
  broker.cancel(`_api-${executionId}`);
};

ReceiveTaskExecution.prototype._setupMessageHandling = function setupMessageHandling(executionId) {
  const broker = this.broker;
  broker.subscribeTmp('api', '#.signal.*', this._onDelegateMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-delegated-${executionId}`,
  }, {
    noAck: true,
  });
  broker.subscribeTmp('api', `activity.stop.${executionId}`, this._onStopApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-stop-${executionId}`,
    priority: 400,
  });
  broker.subscribeTmp('execution', 'execute.#', this._onExecutionComplete.bind(this), {
    noAck: true,
    consumerTag: `_execution-complete-${executionId}`,
  }, {
    noAck: true,
  });
};

ReceiveTaskExecution.prototype._onDelegateMessage = function onDelegateMessage(_, message) {
  if (!message.properties.delegate) return;
  this.broker.sendToQueue('message', message.content, message.properties);
};

ReceiveTaskExecution.prototype._onStopApiMessage = function onStopApiMessage() {
  this._stopMessageHandling(true);
};

ReceiveTaskExecution.prototype._onExecutionComplete = function onExecutionComplete(routingKey, {content}) {
  if (!content.isRootScope) return;
  switch (routingKey) {
    case 'execute.completed':
    case 'execute.error':
    case 'execute.discard':
      this._stopMessageHandling();
      break;
  }
};

ReceiveTaskExecution.prototype._stopMessageHandling = function stop(keepMessageQ) {
  const broker = this.broker, executionId = this.executionId;
  broker.cancel(`_api-delegated-${executionId}`);
  broker.cancel(`_api-stop-${executionId}`);
  broker.cancel(`_execution-complete-${executionId}`);
  if (!keepMessageQ) broker.purgeQueue('message');
};

ReceiveTaskExecution.prototype._getReferenceInfo = function getReferenceInfo(message) {
  const referenceElement = this.referenceElement;
  if (!referenceElement) {
    return {
      message: {...this.reference},
      description: 'anonymous message',
    };
  }

  const result = {
    message: referenceElement.resolve(message),
  };

  result.description = `${result.message.name} <${result.message.id}>`;

  return result;
};

ReceiveTaskExecution.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.id})> ${msg}`);
};
