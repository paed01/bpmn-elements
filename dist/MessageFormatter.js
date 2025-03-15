"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Formatter = Formatter;
var _messageHelper = require("./messageHelper.js");
var _shared = require("./shared.js");
var _Errors = require("./error/Errors.js");
var _smqp = require("smqp");
const kOnMessage = Symbol.for('onMessage');
const kExecution = Symbol.for('execution');
const EXEC_ROUTING_KEY = 'run._formatting.exec';

/**
 * Message formatter used to enrich an element run message before continuing to the next run message
 * @param {import('types').ElementBase} element
 */
function Formatter(element) {
  const {
    id,
    broker,
    logger
  } = element;
  this.id = id;
  this.broker = broker;
  this.logger = logger;
  this[kOnMessage] = this._onMessage.bind(this);
}

/**
 * Format message
 * @param {import('types').ElementBrokerMessage} message
 * @param {CallableFunction} callback
 */
Formatter.prototype.format = function format(message, callback) {
  const correlationId = this._runId = (0, _shared.getUniqueId)(message.fields.routingKey);
  const consumerTag = '_formatter-' + correlationId;
  const broker = this.broker;
  broker.publish('format', EXEC_ROUTING_KEY, {}, {
    correlationId,
    persistent: false
  });
  this[kExecution] = {
    correlationId,
    formatKey: message.fields.routingKey,
    runMessage: (0, _messageHelper.cloneMessage)(message),
    callback,
    pending: new Set(),
    formatted: false,
    executeMessage: null
  };
  broker.consume('format-run-q', this[kOnMessage], {
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
  } = this[kExecution];
  const asyncFormatting = pending.size;
  if (routingKey === EXEC_ROUTING_KEY) {
    if (message.properties.correlationId !== correlationId) return message.ack();
    message.ack();
    if (!asyncFormatting) {
      return this._complete(message);
    }
    this[kExecution].executeMessage = message;
  } else {
    message.ack();
    const endRoutingKey = message.content?.endRoutingKey;
    if (endRoutingKey) {
      this._enrich(message.content);
      pending.add(message);
      return this._debug(`start formatting ${formatKey} message content with formatter ${routingKey}`);
    }
    if (asyncFormatting) {
      const isError = this._popFormatStart(pending, routingKey).isError;
      if (isError) {
        return this._complete(message, true);
      }
    }
    this._enrich(message.content);
    this._debug(`format ${message.fields.routingKey} message content with formatter ${routingKey}`);
    if (executeMessage && !pending.size) {
      this._complete(message);
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
  } = this[kExecution];
  this[kExecution] = null;
  if (executeMessage) executeMessage.ack();
  this.broker.cancel(message.fields.consumerTag);
  if (isError) {
    const error = message.content?.error || new Error('formatting failed');
    const errMessage = error.message || 'formatting failed';
    this._debug(`formatting of ${formatKey} failed with ${message.fields.routingKey}: ${errMessage}`);
    return callback(new _Errors.ActivityError(errMessage, (0, _messageHelper.cloneMessage)(runMessage), error));
  }
  return callback(null, runMessage.content, formatted);
};
Formatter.prototype._enrich = function enrich(withContent) {
  const content = this[kExecution].runMessage.content;
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
          this[kExecution].formatted = true;
        }
    }
  }
};
Formatter.prototype._popFormatStart = function popFormattingStart(pending, routingKey) {
  for (const msg of pending) {
    const {
      endRoutingKey,
      errorRoutingKey = '#.error'
    } = msg.content;
    if (endRoutingKey && (0, _smqp.getRoutingKeyPattern)(endRoutingKey).test(routingKey)) {
      this._debug(`completed formatting ${msg.fields.routingKey} message content with formatter ${routingKey}`);
      pending.delete(msg);
      return {
        message: msg
      };
    } else if ((0, _smqp.getRoutingKeyPattern)(errorRoutingKey).test(routingKey)) {
      pending.delete(msg);
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