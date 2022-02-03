"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Formatter = Formatter;

var _messageHelper = require("./messageHelper");

var _shared = require("./shared");

var _Errors = require("./error/Errors");

var _smqp = require("smqp");

const onMessageSymbol = Symbol.for('onMessage');
const executionSymbol = Symbol.for('execution');

function Formatter(element, formatQ) {
  const {
    id,
    broker,
    logger
  } = element;
  this.id = id;
  this.broker = broker;
  this.logger = logger;
  this.formatQ = formatQ;
  this.pendingFormats = [];
  this[onMessageSymbol] = this._onMessage.bind(this);
}

Formatter.prototype.format = function format(message, callback) {
  const correlationId = this._runId = (0, _shared.getUniqueId)(message.fields.routingKey);
  const consumerTag = '_formatter-' + correlationId;
  const formatQ = this.formatQ;
  formatQ.queueMessage({
    routingKey: '_formatting.exec'
  }, {}, {
    correlationId,
    persistent: false
  });
  this[executionSymbol] = {
    correlationId,
    formatKey: message.fields.routingKey,
    runMessage: (0, _messageHelper.cloneMessage)(message),
    callback,
    pending: [],
    formatted: false,
    executeMessage: null
  };
  formatQ.consume(this[onMessageSymbol], {
    consumerTag,
    prefetch: 100
  });
};

Formatter.prototype._onMessage = function onMessage(routingKey, message) {
  const {
    formatKey,
    correlationId,
    pending,
    executeMessage
  } = this[executionSymbol];
  const asyncFormatting = pending.length;

  switch (routingKey) {
    case '_formatting.exec':
      if (message.properties.correlationId !== correlationId) return message.ack();

      if (!asyncFormatting) {
        message.ack();
        return this._complete(message);
      }

      this[executionSymbol].executeMessage = message;
      break;

    default:
      {
        message.ack();
        const endRoutingKey = message.content && message.content.endRoutingKey;

        if (endRoutingKey) {
          this._decorate(message.content);

          pending.push(message);
          return this._debug(`start formatting ${formatKey} message content with formatter ${routingKey}`);
        }

        if (asyncFormatting) {
          const {
            isError,
            message: startMessage
          } = this._popFormatStart(pending, routingKey);

          if (startMessage) startMessage.ack();

          if (isError) {
            return this._complete(message, true);
          }
        }

        this._decorate(message.content);

        this._debug(`format ${message.fields.routingKey} message content with formatter ${routingKey}`);

        if (executeMessage && asyncFormatting && !pending.length) {
          this._complete(message);
        }
      }
  }
};

Formatter.prototype._complete = function complete(message, isError) {
  const {
    runMessage,
    formatKey,
    callback,
    formatted,
    executeMessage
  } = this[executionSymbol];
  this[executionSymbol] = null;
  if (executeMessage) executeMessage.ack();
  this.broker.cancel(message.fields.consumerTag);

  if (isError) {
    const error = message.content && message.content.error || new Error('formatting failed');
    const errMessage = error.message || 'formatting failed';

    this._debug(`formatting of ${formatKey} failed with ${message.fields.routingKey}: ${errMessage}`);

    return callback(new _Errors.ActivityError(errMessage, (0, _messageHelper.cloneMessage)(runMessage), error));
  }

  return callback(null, runMessage.content, formatted);
};

Formatter.prototype._decorate = function decorate(withContent) {
  const content = this[executionSymbol].runMessage.content;

  for (const key in withContent) {
    switch (key) {
      case 'id':
      case 'type':
      case 'parent':
      case 'attachedTo':
      case 'executionId':
      case 'isSubProcess':
      case 'isMultiInstance':
      case 'inbound':
      case 'outbound':
      case 'endRoutingKey':
      case 'errorRoutingKey':
        break;

      default:
        {
          content[key] = withContent[key];
          this[executionSymbol].formatted = true;
        }
    }
  }
};

Formatter.prototype._popFormatStart = function popFormattingStart(pending, routingKey) {
  for (let idx = 0; idx < pending.length; idx++) {
    const msg = pending[idx];
    const {
      endRoutingKey,
      errorRoutingKey = '#.error'
    } = msg.content;

    if (endRoutingKey && (0, _smqp.getRoutingKeyPattern)(endRoutingKey).test(routingKey)) {
      this._debug(`completed formatting ${msg.fields.routingKey} message content with formatter ${routingKey}`);

      pending.splice(idx, 1);
      return {
        message: msg
      };
    } else if ((0, _smqp.getRoutingKeyPattern)(errorRoutingKey).test(routingKey)) {
      pending.splice(idx, 1);
      return {
        isError: true,
        message: msg
      };
    }
  }

  return {};
};

Formatter.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.id}> ${msg}`);
};