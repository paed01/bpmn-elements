"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = EventDefinitionExecution;

var _messageHelper = require("../messageHelper");

function EventDefinitionExecution(activity, eventDefinitions, completedRoutingKey = 'execute.completed') {
  const {
    id,
    broker,
    logger
  } = activity;
  const executeConsumerTag = '_eventdefinition-execution-execute-tag';
  const apiConsumerTag = '_eventdefinition-execution-api-tag';
  let parentExecutionContent,
      parent,
      completed = false,
      stopped = false;
  return {
    execute,

    get completed() {
      return completed;
    }

  };

  function execute(executeMessage) {
    const executeContent = executeMessage.content;
    const isRedelivered = executeMessage.fields.redelivered;
    const {
      isRootScope,
      isDefinitionScope,
      executionId: messageExecutionId
    } = executeContent;
    if (isDefinitionScope) return executeDefinition();
    let parentExecutionId;

    if (isRootScope) {
      parentExecutionId = messageExecutionId;
      parentExecutionContent = executeContent;
      broker.subscribeTmp('execution', 'execute.#', onExecuteMessage, {
        noAck: true,
        consumerTag: executeConsumerTag,
        priority: 300
      });
      broker.subscribeTmp('api', `activity.*.${parentExecutionId}`, onApiMessage, {
        noAck: true,
        consumerTag: apiConsumerTag,
        priority: 300
      });
      parent = (0, _messageHelper.unshiftParent)(parentExecutionContent.parent, parentExecutionContent);
      broker.publish('execution', 'execute.update', { ...(0, _messageHelper.cloneContent)(parentExecutionContent),
        preventComplete: true
      });
    }

    if (isRedelivered) return;

    for (let index = 0; index < eventDefinitions.length; ++index) {
      if (completed) break;
      if (stopped) break;
      const ed = eventDefinitions[index];
      const executionId = `${messageExecutionId}_${index}`;
      logger.debug(`<${messageExecutionId} (${id})> start event definition ${ed.type}, index ${index}`);
      broker.publish('execution', 'execute.start', { ...(0, _messageHelper.cloneContent)(parentExecutionContent),
        isRootScope: undefined,
        type: ed.type,
        executionId,
        isDefinitionScope: true,
        index,
        parent
      });
    }

    function onApiMessage(_, message) {
      const messageType = message.properties.type;

      switch (messageType) {
        case 'stop':
          stopped = true;

        case 'discard':
          return stop();
      }
    }

    function onExecuteMessage(routingKey, message) {
      const {
        correlationId
      } = message.properties;

      switch (routingKey) {
        case 'execute.completed':
          {
            stop();
            if (message.content.isDefinitionScope) return complete();
            break;
          }

        case 'execute.discard':
          {
            if (message.content.isDefinitionScope) {
              logger.debug(`<${message.content.executionId} (${id})> event definition ${message.content.type} discarded, index ${message.content.index}`);
              break;
            }

            stop();
            logger.debug(`<${message.content.executionId} (${id})> event definition parent execution discarded`);
            break;
          }
      }

      function complete() {
        const content = (0, _messageHelper.cloneContent)(message.content);
        completed = true;
        logger.debug(`<${content.executionId} (${id})> event definition ${content.type} completed, index ${content.index}`);
        broker.publish('execution', completedRoutingKey, { ...(0, _messageHelper.cloneContent)(content),
          executionId: parentExecutionId,
          isRootScope: true,
          parent: (0, _messageHelper.shiftParent)(content.parent)
        }, {
          correlationId
        });
      }
    }

    function executeDefinition() {
      const ed = eventDefinitions[executeContent.index];
      if (!ed) return logger.warn(`<${messageExecutionId} (${id})> found no event definition on index ${executeContent.index}`);
      logger.debug(`<${messageExecutionId} (${id})> execute event definition ${ed.type}, index ${executeContent.index}`);
      ed.execute(executeMessage);
    }

    function stop() {
      broker.cancel(executeConsumerTag);
      broker.cancel(apiConsumerTag);
    }
  }
}