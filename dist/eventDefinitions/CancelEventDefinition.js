"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = CancelEventDefinition;
var _messageHelper = require("../messageHelper.js");
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
  this.reference = {
    referenceType: 'cancel'
  };
  this.isThrowing = isThrowing;
  this.activity = activity;
  this.environment = environment;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());
}
Object.defineProperty(CancelEventDefinition.prototype, 'executionId', {
  get() {
    const message = this[kExecuteMessage];
    return message && message.content.executionId;
  }
});
CancelEventDefinition.prototype.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};
CancelEventDefinition.prototype.executeCatch = function executeCatch(executeMessage) {
  this[kExecuteMessage] = executeMessage;
  this[kCompleted] = false;
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  const parentExecutionId = parent.executionId;
  const broker = this.broker;
  this._debug('expect cancel');
  broker.subscribeTmp('api', `activity.#.${parent.executionId}#`, this._onApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-${executionId}`
  });
  const expectRoutingKey = `execute.cancelled.${executionId}`;
  broker.subscribeOnce('execution', expectRoutingKey, this._onCatchMessage.bind(this), {
    consumerTag: `_onattached-cancel-${executionId}`
  });
  broker.publish('execution', 'execute.expect', (0, _messageHelper.cloneContent)(executeContent, {
    pattern: 'activity.execution.cancel',
    exchange: 'execution',
    expectRoutingKey
  }));
  const waitContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parentExecutionId,
    condition: this.condition,
    expect: 'cancel'
  });
  waitContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.wait', waitContent);
};
CancelEventDefinition.prototype.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  this.logger.debug(`<${executionId} (${this.activity.id})> throw cancel`);
  const broker = this.broker;
  const cancelContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parent.executionId,
    state: 'throw'
  });
  cancelContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.cancel', cancelContent, {
    type: 'cancel'
  });
  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent));
};
CancelEventDefinition.prototype._onCatchMessage = function onCatchMessage(_, message) {
  const content = message.content;
  this._debug(`cancel caught from <${content.id}>`);
  return this._complete(content.message);
};
CancelEventDefinition.prototype._complete = function complete(output) {
  this[kCompleted] = true;
  this._stop();
  this._debug('completed');
  const content = (0, _messageHelper.cloneContent)(this[kExecuteMessage].content, {
    output,
    state: 'cancel'
  });
  return this.broker.publish('execution', 'execute.completed', content);
};
CancelEventDefinition.prototype._onApiMessage = function onApiMessage(routingKey, message) {
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
CancelEventDefinition.prototype._stop = function stop() {
  const broker = this.broker,
    executionId = this.executionId;
  broker.cancel(`_onattached-cancel-${executionId}`);
  broker.cancel(`_api-${executionId}`);
};
CancelEventDefinition.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};