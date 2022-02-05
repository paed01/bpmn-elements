"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ConditionalEventDefinition;

var _messageHelper = require("../messageHelper");

var _Errors = require("../error/Errors");

const executeMessageSymbol = Symbol.for('executeMessage');

function ConditionalEventDefinition(activity, eventDefinition) {
  const {
    id,
    broker,
    environment,
    attachedTo
  } = activity;
  const {
    type = 'ConditionalEventDefinition',
    behaviour = {}
  } = eventDefinition;
  this.id = id;
  this.type = type;
  this.isWaiting = !attachedTo;
  this.condition = behaviour.expression;
  this.activity = activity;
  this.environment = environment;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());
}

const proto = ConditionalEventDefinition.prototype;
Object.defineProperty(proto, 'executionId', {
  get() {
    const message = this[executeMessageSymbol];
    return message && message.content.executionId;
  }

});

proto.execute = function execute(executeMessage) {
  this[executeMessageSymbol] = executeMessage;
  return this.isWaiting ? this.executeWait(executeMessage) : this.executeCatch(executeMessage);
};

proto.executeWait = function executeWait(executeMessage) {
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  const parentExecutionId = parent.executionId;
  if (this._evaluateWait(executeMessage)) return;
  const broker = this.broker;

  const onApiMessage = this._onWaitApiMessage.bind(this);

  broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
    noAck: true,
    consumerTag: `_api-${executionId}`
  });
  broker.subscribeTmp('api', `activity.signal.${parentExecutionId}`, onApiMessage, {
    noAck: true,
    consumerTag: `_parent-signal-${executionId}`
  });
  const waitContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parentExecutionId,
    condition: this.condition
  });
  waitContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.wait', waitContent);
};

proto.executeCatch = function executeCatch(executeMessage) {
  const executeContent = executeMessage.content;
  const {
    executionId,
    index
  } = executeContent;
  this.broker.subscribeTmp('api', `activity.#.${executionId}`, this._onCatchApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-${executionId}_${index}`
  });
  const {
    id: attachedToId,
    broker: attachedToBroker
  } = this.activity.attachedTo;

  this._debug(`listen for execute completed from <${attachedToId}>`);

  attachedToBroker.subscribeOnce('execution', 'execute.completed', this._onAttachedCompleted.bind(this), {
    priority: 300,
    consumerTag: `_onend-${executionId}_${index}`
  });
};

proto._onWaitApiMessage = function onWaitApiMessage(routingKey, message) {
  const messageType = message.properties.type;

  switch (messageType) {
    case 'signal':
      {
        return this._evaluateWait(message);
      }

    case 'discard':
      {
        this._stopWait();

        return this.broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(this[executeMessageSymbol].content, {
          state: 'discard'
        }));
      }

    case 'stop':
      {
        return this._stopWait();
      }
  }
};

proto._evaluateWait = function evaluate(message) {
  const executeMessage = this[executeMessageSymbol];
  const broker = this.broker,
        executeContent = executeMessage.content;

  try {
    var output = this.environment.resolveExpression(this.condition, message); // eslint-disable-line no-var
  } catch (err) {
    return broker.publish('execution', 'execute.error', (0, _messageHelper.cloneContent)(executeContent, {
      error: new _Errors.ActivityError(err.message, executeMessage, err)
    }, {
      mandatory: true
    }));
  }

  this._debug(`condition evaluated to ${!!output}`);

  broker.publish('event', 'activity.condition', (0, _messageHelper.cloneContent)(executeContent, {
    conditionResult: output
  }));
  if (!output) return;

  this._stopWait();

  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
    output
  }));
};

proto._stopWait = function stopWait() {
  const broker = this.broker,
        executionId = this.executionId;
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_parent-signal-${executionId}`);
};

proto._onAttachedCompleted = function onAttachedCompleted(routingKey, message) {
  this._stopCatch();

  const executeMessage = this[executeMessageSymbol];
  const broker = this.broker,
        executeContent = executeMessage.content;

  try {
    var output = this.environment.resolveExpression(this.condition, message); // eslint-disable-line no-var
  } catch (err) {
    return broker.publish('execution', 'execute.error', (0, _messageHelper.cloneContent)(executeContent, {
      error: new _Errors.ActivityError(err.message, executeMessage, err)
    }, {
      mandatory: true
    }));
  }

  this._debug(`condition from <${message.content.executionId}> evaluated to ${!!output}`);

  broker.publish('event', 'activity.condition', (0, _messageHelper.cloneContent)(executeContent, {
    conditionResult: output
  }));

  if (output) {
    broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
      output
    }));
  }
};

proto._onCatchApiMessage = function onCatchApiMessage(routingKey, message) {
  const messageType = message.properties.type;

  switch (messageType) {
    case 'discard':
      {
        this._stopCatch();

        this._debug('discarded');

        return this.broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(this[executeMessageSymbol].content, {
          state: 'discard'
        }));
      }

    case 'stop':
      {
        this._stopCatch();

        return this._debug('stopped');
      }
  }
};

proto._stopCatch = function stopCatch() {
  const {
    executionId,
    index
  } = this[executeMessageSymbol].content;
  this.activity.attachedTo.broker.cancel(`_onend-${executionId}_${index}`);
  this.broker.cancel(`_api-${executionId}_${index}`);
};

proto._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};