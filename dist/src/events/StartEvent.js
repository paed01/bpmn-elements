"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.StartEventBehaviour = StartEventBehaviour;
exports.default = StartEvent;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _EventDefinitionExecution = _interopRequireDefault(require("../eventDefinitions/EventDefinitionExecution"));

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const kExecuteMessage = Symbol.for('executeMessage');
const kExecution = Symbol.for('execution');

function StartEvent(activityDef, context) {
  return new _Activity.default(StartEventBehaviour, activityDef, context);
}

function StartEventBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.activity = activity;
  this.broker = activity.broker;
  this[kExecution] = activity.eventDefinitions && new _EventDefinitionExecution.default(activity, activity.eventDefinitions);
}

const proto = StartEventBehaviour.prototype;
Object.defineProperty(proto, 'executionId', {
  get() {
    const message = this[kExecuteMessage];
    return message && message.content.executionId;
  }

});

proto.execute = function execute(executeMessage) {
  const execution = this[kExecution];

  if (execution) {
    return execution.execute(executeMessage);
  }

  const content = (0, _messageHelper.cloneContent)(executeMessage.content);
  const broker = this.broker;

  if (!content.form) {
    return broker.publish('execution', 'execute.completed', content);
  }

  const executionId = content.executionId;
  this[kExecuteMessage] = executeMessage;
  broker.subscribeTmp('api', `activity.#.${executionId}`, (...args) => this._onApiMessage(...args), {
    noAck: true,
    consumerTag: `_api-${executionId}`,
    priority: 300
  });
  broker.subscribeTmp('api', '#.signal.*', (...args) => this._onDelegatedApiMessage(...args), {
    noAck: true,
    consumerTag: `_api-delegated-${executionId}`
  });
  broker.publish('event', 'activity.wait', { ...content,
    executionId,
    state: 'wait'
  });
};

proto._onApiMessage = function onApiMessage(routingKey, message) {
  const {
    type: messageType,
    correlationId
  } = message.properties;

  switch (messageType) {
    case 'stop':
      return this._stop();

    case 'signal':
      {
        this._stop();

        const content = this[kExecuteMessage].content;
        return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content, {
          output: message.content.message,
          state: 'signal'
        }), {
          correlationId
        });
      }

    case 'discard':
      {
        this._stop();

        const content = this[kExecuteMessage].content;
        return this.broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(content), {
          correlationId
        });
      }
  }
};

proto._onDelegatedApiMessage = function onDelegatedApiMessage(routingKey, message) {
  if (!message.properties.delegate) return;
  const content = message.content;
  if (!content.message) return;
  const {
    id: signalId,
    executionId: signalExecutionId
  } = content.message;
  if (signalId !== this.id && signalExecutionId !== this.executionId) return;
  const {
    type,
    correlationId
  } = message.properties;
  const executeContent = this[kExecuteMessage].content;
  this.broker.publish('event', 'activity.consumed', (0, _messageHelper.cloneContent)(executeContent, {
    message: { ...content.message
    }
  }), {
    correlationId,
    type
  });
  return this._onApiMessage(routingKey, message);
};

proto._stop = function stop() {
  const broker = this.broker,
        executionId = this.executionId;
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_api-delegated-${executionId}`);
};