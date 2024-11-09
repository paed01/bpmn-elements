import { cloneMessage } from './messageHelper.js';
import { getUniqueId } from './shared.js';
import { ActivityError } from './error/Errors.js';
import { getRoutingKeyPattern } from 'smqp';

const kOnMessage = Symbol.for('onMessage');
const kExecution = Symbol.for('execution');

export function Formatter(element, formatQ) {
  const { id, broker, logger } = element;
  this.id = id;
  this.broker = broker;
  this.logger = logger;
  this.formatQ = formatQ;
  this[kOnMessage] = this._onMessage.bind(this);
}

Formatter.prototype.format = function format(message, callback) {
  const correlationId = (this._runId = getUniqueId(message.fields.routingKey));
  const consumerTag = '_formatter-' + correlationId;
  const formatQ = this.formatQ;

  formatQ.queueMessage(
    {
      routingKey: '_formatting.exec',
    },
    {},
    {
      correlationId,
      persistent: false,
    },
  );

  this[kExecution] = {
    correlationId,
    formatKey: message.fields.routingKey,
    runMessage: cloneMessage(message),
    callback,
    pending: [],
    formatted: false,
    executeMessage: null,
  };

  formatQ.consume(this[kOnMessage], {
    consumerTag,
    prefetch: 100,
  });
};

Formatter.prototype._onMessage = function onMessage(routingKey, message) {
  const { formatKey, correlationId, pending, executeMessage } = this[kExecution];
  const asyncFormatting = pending.length;

  switch (routingKey) {
    case '_formatting.exec':
      if (message.properties.correlationId !== correlationId) return message.ack();
      if (!asyncFormatting) {
        message.ack();
        return this._complete(message);
      }
      this[kExecution].executeMessage = message;
      break;
    default: {
      message.ack();

      const endRoutingKey = message.content?.endRoutingKey;
      if (endRoutingKey) {
        this._decorate(message.content);
        pending.push(message);
        return this._debug(`start formatting ${formatKey} message content with formatter ${routingKey}`);
      }

      if (asyncFormatting) {
        const { isError, message: startMessage } = this._popFormatStart(pending, routingKey);
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
  const { runMessage, formatKey, callback, formatted, executeMessage } = this[kExecution];
  this[kExecution] = null;
  if (executeMessage) executeMessage.ack();

  this.broker.cancel(message.fields.consumerTag);

  if (isError) {
    const error = message.content?.error || new Error('formatting failed');
    const errMessage = error.message || 'formatting failed';
    this._debug(`formatting of ${formatKey} failed with ${message.fields.routingKey}: ${errMessage}`);
    return callback(new ActivityError(errMessage, cloneMessage(runMessage), error));
  }

  return callback(null, runMessage.content, formatted);
};

Formatter.prototype._decorate = function decorate(withContent) {
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
      default: {
        content[key] = withContent[key];
        this[kExecution].formatted = true;
      }
    }
  }
};

Formatter.prototype._popFormatStart = function popFormattingStart(pending, routingKey) {
  for (let idx = 0; idx < pending.length; idx++) {
    const msg = pending[idx];
    const { endRoutingKey, errorRoutingKey = '#.error' } = msg.content;

    if (endRoutingKey && getRoutingKeyPattern(endRoutingKey).test(routingKey)) {
      this._debug(`completed formatting ${msg.fields.routingKey} message content with formatter ${routingKey}`);
      pending.splice(idx, 1);
      return { message: msg };
    } else if (getRoutingKeyPattern(errorRoutingKey).test(routingKey)) {
      pending.splice(idx, 1);
      return { isError: true, message: msg };
    }
  }

  return {};
};

Formatter.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.id}> ${msg}`);
};
