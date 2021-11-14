"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.StartEventBehaviour = StartEventBehaviour;
exports.default = StartEvent;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _EventDefinitionExecution = _interopRequireDefault(require("../eventDefinitions/EventDefinitionExecution"));

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function StartEvent(activityDef, context) {
  return new _Activity.default(StartEventBehaviour, activityDef, context);
}

function StartEventBehaviour(activity) {
  const {
    id,
    type = 'startevent',
    broker,
    eventDefinitions
  } = activity;
  const eventDefinitionExecution = eventDefinitions && (0, _EventDefinitionExecution.default)(activity, eventDefinitions);
  const event = {
    id,
    type,
    execute
  };
  return event;

  function execute(executeMessage) {
    if (eventDefinitionExecution) {
      return eventDefinitionExecution.execute(executeMessage);
    }

    const content = (0, _messageHelper.cloneContent)(executeMessage.content);

    if (!content.form) {
      return broker.publish('execution', 'execute.completed', content);
    }

    const {
      executionId
    } = content;
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: `_api-${executionId}`,
      priority: 300
    });
    broker.subscribeTmp('api', '#.signal.*', onDelegatedApiMessage, {
      noAck: true,
      consumerTag: `_api-delegated-${executionId}`
    });
    broker.publish('event', 'activity.wait', { ...content,
      executionId,
      state: 'wait'
    });

    function onDelegatedApiMessage(routingKey, message) {
      if (!message.properties.delegate) return;
      const {
        content: delegateContent
      } = message;
      if (!delegateContent || !delegateContent.message) return;
      const {
        id: signalId,
        executionId: signalExecutionId
      } = delegateContent.message;
      if (signalId !== id && signalExecutionId !== executionId) return;
      const {
        type: messageType,
        correlationId
      } = message.properties;
      broker.publish('event', 'activity.consumed', (0, _messageHelper.cloneContent)(content, {
        message: { ...delegateContent.message
        }
      }), {
        correlationId,
        type: messageType
      });
      return onApiMessage(routingKey, message);
    }

    function onApiMessage(routingKey, message) {
      const {
        type: messageType,
        correlationId
      } = message.properties;

      switch (messageType) {
        case 'stop':
          return stop();

        case 'signal':
          stop();
          return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content, {
            output: message.content.message,
            state: 'signal'
          }), {
            correlationId
          });

        case 'discard':
          stop();
          return broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(content), {
            correlationId
          });
      }
    }

    function stop() {
      broker.cancel(`_api-${executionId}`);
      broker.cancel(`_api-delegated-${executionId}`);
    }
  }
}