import {cloneMessage, cloneParent, cloneContent} from './messageHelper';
import {filterUndefined} from './shared';
import {ActivityError} from './error/Errors';
import {getRoutingKeyPattern} from 'smqp';

export {Formatter};

function Formatter(element, formatQ) {
  const {id, broker, logger} = element;

  return function formatRunMessage(runMessage, callback) {
    const startFormatMsg = formatQ.get();
    if (!startFormatMsg) return callback(null, runMessage.content, false);

    const pendingFormats = [];
    const {fields, content} = runMessage;
    const fundamentals = {
      id: content.id,
      type: content.type,
      parent: cloneParent(content.parent),
      attachedTo: content.attachedTo,
      executionId: content.executionId,
      isSubProcess: content.isSubProcess,
      isMultiInstance: content.isMultiInstance,
    };
    if (content.inbound) {
      fundamentals.inbound = content.inbound.slice();
    }
    if (content.outbound) {
      fundamentals.outbound = content.outbound.slice();
    }

    let formattingError;
    let formattedContent = cloneContent(content);

    const depleted = formatQ.on('depleted', () => {
      if (pendingFormats.length) return;
      depleted.cancel();
      logger.debug(`<${id}> completed formatting ${fields.routingKey}`);
      broker.cancel('_format-consumer');
      if (formattingError) return callback(formattingError);
      return callback(null, filterUndefined(formattedContent), true);
    });

    startFormatMsg.nack(false, true);
    formatQ.assertConsumer(onFormatMessage, { consumerTag: '_format-consumer', prefetch: 100 });

    function onFormatMessage(routingKey, message) {
      const {endRoutingKey, error} = message.content || {};

      if (endRoutingKey) {
        pendingFormats.push(message);
        return logger.debug(`<${id}> start formatting ${fields.routingKey} message content with formatter ${routingKey}`);
      }

      const {isError, message: formatStart} = popFormattingStart(routingKey);

      logger.debug(`<${id}> format ${fields.routingKey} message content with formatter ${routingKey}`);

      formattedContent = {
        ...formattedContent,
        ...message.content,
        ...fundamentals,
      };

      message.ack();
      if (formatStart) {
        if (isError) {
          const errMessage = error && error.message || 'formatting failed';
          logger.debug(`<${id}> formatting of ${fields.routingKey} failed with ${routingKey}: ${errMessage}`);
          formattingError = new ActivityError(errMessage, cloneMessage(runMessage, formattedContent), error);
          for (const {nack} of pendingFormats.splice(0)) nack(false, false);
        }
        formatStart.ack(isError);
      }
    }

    function popFormattingStart(routingKey) {
      for (let i = 0; i < pendingFormats.length; i++) {
        const pendingFormat = pendingFormats[i];
        const {endRoutingKey, errorRoutingKey = '#.error'} = pendingFormat.content;

        if (getRoutingKeyPattern(endRoutingKey).test(routingKey)) {
          logger.debug(`<${id}> completed formatting ${fields.routingKey} message content with formatter ${routingKey}`);
          pendingFormats.splice(i, 1);
          return {message: pendingFormat};
        } else if (getRoutingKeyPattern(errorRoutingKey).test(routingKey)) {
          pendingFormats.splice(i, 1);
          return {isError: true, message: pendingFormat};
        }
      }

      return {};
    }
  };
}
