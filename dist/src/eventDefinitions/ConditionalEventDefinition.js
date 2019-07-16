"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ConditionalEventDefinition;

var _messageHelper = require("../messageHelper");

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
  const {
    debug
  } = environment.Logger(type.toLowerCase());
  const condition = behaviour.expression;
  const isWaiting = !attachedTo;
  const source = {
    type,
    condition,
    execute
  };
  return source;

  function execute(executeMessage) {
    return isWaiting ? executeWait(executeMessage) : executeCatch(executeMessage);
  }

  function executeCatch(executeMessage) {
    const attachedToBroker = attachedTo.broker;
    const messageContent = (0, _messageHelper.cloneContent)(executeMessage.content);
    const {
      executionId,
      index
    } = messageContent;
    messageContent.condition = condition;
    const apiConsumerTag = `_api-${executionId}_${index}`;
    const endConsumerTag = `_onend-${executionId}_${index}`;
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: apiConsumerTag
    });
    debug(`<${executionId} (${id})> listen for execute completed from <${attachedTo.id}>`);
    attachedToBroker.subscribeOnce('execution', 'execute.completed', onAttachedCompleted, {
      priority: 300,
      consumerTag: endConsumerTag
    });

    function onAttachedCompleted(routingKey, endMessage) {
      stop();
      const output = environment.resolveExpression(condition, endMessage);
      debug(`<${executionId} (${id})> condition from <${endMessage.content.executionId}> evaluated to`, !!output);
      broker.publish('event', 'activity.condition', { ...(0, _messageHelper.cloneContent)(messageContent),
        conditionResult: output
      });

      if (output) {
        broker.publish('execution', 'execute.completed', { ...messageContent,
          output
        });
      }
    }

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;

      switch (messageType) {
        case 'discard':
          {
            stop();
            debug(`<${executionId} (${id})> discarded`);
            return broker.publish('execution', 'execute.discard', { ...messageContent,
              state: 'discard'
            });
          }

        case 'stop':
          {
            stop();
            return debug(`<${executionId} (${id})> stopped`);
          }
      }
    }

    function stop() {
      attachedToBroker.cancel(endConsumerTag);
      broker.cancel(apiConsumerTag);
    }
  }

  function executeWait(executeMessage) {
    const messageContent = (0, _messageHelper.cloneContent)(executeMessage.content);
    messageContent.condition = condition;
    const {
      executionId,
      parent
    } = messageContent;
    const parentExecutionId = parent && parent.executionId;
    if (evaluate(executeMessage)) return;
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: `_api-${executionId}`
    });
    broker.subscribeTmp('api', `activity.signal.${parentExecutionId}`, onApiMessage, {
      noAck: true,
      consumerTag: `_parent-signal-${executionId}`
    });
    broker.publish('event', 'activity.wait', { ...(0, _messageHelper.cloneContent)(messageContent),
      executionId: parentExecutionId,
      parent: (0, _messageHelper.shiftParent)(parent)
    });

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;

      switch (messageType) {
        case 'signal':
          {
            return evaluate(message);
          }

        case 'discard':
          {
            stop();
            return broker.publish('execution', 'execute.discard', { ...messageContent,
              state: 'discard'
            });
          }

        case 'stop':
          {
            stop();
            break;
          }
      }
    }

    function evaluate(message) {
      const output = environment.resolveExpression(condition, message);
      debug(`<${executionId} (${id})> condition evaluated to`, !!output);
      broker.publish('event', 'activity.condition', { ...(0, _messageHelper.cloneContent)(messageContent),
        conditionResult: output
      });
      if (!output) return;
      stop();
      return broker.publish('execution', 'execute.completed', { ...messageContent,
        output
      });
    }

    function stop() {
      broker.cancel(`_api-${executionId}`);
      broker.cancel(`_parent-signal-${executionId}`);
    }
  }
}