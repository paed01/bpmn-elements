"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = CancelEventDefinition;

var _shared = require("../shared");

var _messageHelper = require("../messageHelper");

const kMessageQ = Symbol.for('cancelQ');
const kCompleted = Symbol.for('completed');
const kExecuteMessage = Symbol.for('executeMessage');

function CancelEventDefinition(activity, eventDefinition) {
  const {
    id,
    broker,
    environment,
    isThrowing
  } = activity;
  const type = eventDefinition.type;
  this.id = id;
  this.type = type;
  const reference = this.reference = {
    referenceType: 'cancel'
  };
  this.isThrowing = isThrowing;
  this.activity = activity;
  this.environment = environment;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());

  if (!isThrowing) {
    this[kCompleted] = false;
    const messageQueueName = `${reference.referenceType}-${(0, _shared.brokerSafeId)(id)}-q`;
    this[kMessageQ] = broker.assertQueue(messageQueueName, {
      autoDelete: false,
      durable: true
    });
    broker.bindQueue(messageQueueName, 'api', `*.${reference.referenceType}.#`, {
      durable: true,
      priority: 400
    });
  }
}

const proto = CancelEventDefinition.prototype;
Object.defineProperty(proto, 'executionId', {
  get() {
    const message = this[kExecuteMessage];
    return message && message.content.executionId;
  }

});

proto.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};

proto.executeCatch = function executeCatch(executeMessage) {
  this[kExecuteMessage] = executeMessage;
  this[kCompleted] = false;
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  const parentExecutionId = parent.executionId;
  const broker = this.broker;

  const onCatchMessage = this._onCatchMessage.bind(this);

  this[kMessageQ].consume(onCatchMessage, {
    noAck: true,
    consumerTag: `_oncancel-${executionId}`
  });
  if (this[kCompleted]) return;

  const onApiMessage = this._onApiMessage.bind(this);

  broker.subscribeTmp('api', `activity.#.${parentExecutionId}`, onApiMessage, {
    noAck: true,
    consumerTag: `_api-parent-${executionId}`
  });
  broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
    noAck: true,
    consumerTag: `_api-${executionId}`
  });

  this._debug('expect cancel');

  const exchangeKey = `execute.canceled.${executionId}`;
  broker.subscribeOnce('execution', exchangeKey, onCatchMessage, {
    consumerTag: `_onattached-cancel-${executionId}`
  });
  broker.publish('execution', 'execute.expect', (0, _messageHelper.cloneContent)(executeContent, {
    pattern: '#.cancel',
    exchange: 'execution',
    exchangeKey
  }));
};

proto.executeThrow = function executeThrow(executeMessage) {
  const {
    isTransaction
  } = this.environment.variables.content || {};
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  this.logger.debug(`<${executionId} (${this.activity.id})> throw cancel${isTransaction ? ' transaction' : ''}`);
  const broker = this.broker;
  const cancelContent = (0, _messageHelper.cloneContent)(executeContent, {
    isTransaction,
    executionId: parent.executionId,
    state: 'throw'
  });
  cancelContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.cancel', cancelContent, {
    type: 'cancel',
    delegate: isTransaction
  });
  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent));
};

proto._onCatchMessage = function onCatchMessage(_, message) {
  if (message.content && message.content.isTransaction) return this._onCancelTransaction(_, message);

  this._debug(`cancel caught from <${message.content.id}>`);

  return this._complete(message.content.message);
};

proto._onCancelTransaction = function onCancelTransaction(_, message) {
  const broker = this.broker,
        executionId = this.executionId;
  const executeContent = this[kExecuteMessage].content;
  broker.cancel(`_oncancel-${executionId}`);

  this._debug(`cancel transaction thrown by <${message.content.id}>`);

  broker.assertExchange('cancel', 'topic');
  broker.publish('execution', 'execute.detach', (0, _messageHelper.cloneContent)(executeContent, {
    pattern: '#',
    bindExchange: 'cancel',
    sourceExchange: 'event',
    sourcePattern: '#'
  }));
  broker.publish('event', 'activity.compensate', (0, _messageHelper.cloneContent)(message.content, {
    state: 'throw'
  }), {
    type: 'compensate',
    delegate: true
  });
  broker.subscribeTmp('cancel', 'activity.leave', (__, {
    content: msg
  }) => {
    if (msg.id !== executeContent.attachedTo) return;
    return this._complete(message.content.message);
  }, {
    noAck: true,
    consumerTag: `_oncancelend-${executionId}`
  });
};

proto._complete = function complete(output) {
  this[kCompleted] = true;

  this._stop();

  this._debug('completed');

  const content = (0, _messageHelper.cloneContent)(this[kExecuteMessage].content, {
    output,
    state: 'cancel'
  });
  return this.broker.publish('execution', 'execute.completed', content);
};

proto._onApiMessage = function onApiMessage(routingKey, message) {
  switch (message.properties.type) {
    case 'discard':
      {
        this[kCompleted] = true;

        this._stop();

        const content = (0, _messageHelper.cloneContent)(this[kExecuteMessage].content);
        return this.broker.publish('execution', 'execute.discard', content);
      }

    case 'stop':
      {
        this._stop();

        break;
      }
  }
};

proto._stop = function stop() {
  const broker = this.broker,
        executionId = this.executionId;
  broker.cancel(`_api-parent-${executionId}`);
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_oncancel-${executionId}`);
  broker.cancel(`_oncancelend-${executionId}`);
  broker.cancel(`_onattached-cancel-${executionId}`);
  this[kMessageQ].purge();
};

proto._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};