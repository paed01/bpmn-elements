"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = EventDefinitionExecution;

var _messageHelper = require("../messageHelper");

const completedSymbol = Symbol.for('completed');
const executeMessageSymbol = Symbol.for('executeMessage');
const stoppedSymbol = Symbol.for('stopped');

function EventDefinitionExecution(activity, eventDefinitions, completedRoutingKey = 'execute.completed') {
  this.id = activity.id;
  this.activity = activity;
  this.broker = activity.broker;
  this.eventDefinitions = eventDefinitions;
  this.completedRoutingKey = completedRoutingKey;
  this[completedSymbol] = false;
  this[stoppedSymbol] = false;
  this[executeMessageSymbol] = null;
}

const proto = EventDefinitionExecution.prototype;
Object.defineProperty(proto, 'completed', {
  enumerable: true,

  get() {
    return this[completedSymbol];
  }

});
Object.defineProperty(proto, 'stopped', {
  enumerable: true,

  get() {
    return this[stoppedSymbol];
  }

});

proto.execute = function execute(executeMessage) {
  const content = executeMessage.content;
  if (content.isDefinitionScope) return this._executeDefinition(executeMessage);
  if (!content.isRootScope) return;
  const broker = this.broker;
  this[executeMessageSymbol] = executeMessage;
  const executionId = content.executionId;
  broker.subscribeTmp('execution', 'execute.#', this._onExecuteMessage.bind(this), {
    noAck: true,
    consumerTag: '_eventdefinition-execution-execute-tag',
    priority: 300
  });
  broker.subscribeTmp('api', `activity.*.${executionId}`, this._onApiMessage.bind(this), {
    noAck: true,
    consumerTag: '_eventdefinition-execution-api-tag',
    priority: 300
  });
  broker.publish('execution', 'execute.update', (0, _messageHelper.cloneContent)(content, {
    preventComplete: true
  }));
  if (executeMessage.fields.redelivered) return;
  const parent = (0, _messageHelper.unshiftParent)(content.parent, content);
  const eventDefinitions = this.eventDefinitions;

  for (let index = 0; index < eventDefinitions.length; ++index) {
    if (this[completedSymbol]) break;
    if (this[stoppedSymbol]) break;
    const ed = eventDefinitions[index];
    const edExecutionId = `${executionId}_${index}`;

    this._debug(executionId, `start event definition ${ed.type}, index ${index}`);

    const edContent = (0, _messageHelper.cloneContent)(content, {
      isRootScope: undefined,
      type: ed.type,
      executionId: edExecutionId,
      isDefinitionScope: true,
      index
    });
    edContent.parent = (0, _messageHelper.cloneParent)(parent);
    broker.publish('execution', 'execute.start', edContent);
  }
};

proto._onApiMessage = function onApiMessage(_, message) {
  const messageType = message.properties.type;

  switch (messageType) {
    case 'stop':
    case 'discard':
      return this._stop();
  }
};

proto._onExecuteMessage = function onExecuteMessage(routingKey, message) {
  switch (routingKey) {
    case 'execute.completed':
      {
        this._stop();

        if (message.content.isDefinitionScope) return this._complete(message);
        break;
      }

    case 'execute.discard':
      {
        const {
          executionId,
          isDefinitionScope
        } = message.content;

        if (isDefinitionScope) {
          this._debug(executionId, `event definition ${message.content.type} discarded, index ${message.content.index}`);

          break;
        }

        this._stop();

        this._debug(executionId, 'event definition parent execution discarded');

        break;
      }
  }
};

proto._complete = function complete(message) {
  const {
    executionId,
    type,
    index,
    parent
  } = message.content;
  this[completedSymbol] = true;

  this._debug(executionId, `event definition ${type} completed, index ${index}`);

  const completeContent = (0, _messageHelper.cloneContent)(message.content, {
    executionId: this[executeMessageSymbol].content.executionId,
    isRootScope: true
  });
  completeContent.parent = (0, _messageHelper.shiftParent)(parent);
  this.broker.publish('execution', this.completedRoutingKey, completeContent, {
    correlationId: message.properties.correlationId
  });
};

proto._executeDefinition = function executeDefinition(message) {
  const {
    executionId,
    index
  } = message.content;
  const ed = this.eventDefinitions[index];
  if (!ed) return this.activity.logger.warn(`<${executionId} (${this.id})> found no event definition on index ${index}`);

  this._debug(executionId, `execute event definition ${ed.type}, index ${index}`);

  ed.execute(message);
};

proto._stop = function stop() {
  this[stoppedSymbol] = true;
  this.broker.cancel('_eventdefinition-execution-execute-tag');
  this.broker.cancel('_eventdefinition-execution-api-tag');
};

proto._debug = function debug(executionId, msg) {
  this.activity.logger.debug(`<${executionId} (${this.id})> ${msg}`);
};