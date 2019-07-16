"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = BoundaryEvent;
exports.BoundaryEventBehaviour = BoundaryEventBehaviour;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _EventDefinitionExecution = _interopRequireDefault(require("../eventDefinitions/EventDefinitionExecution"));

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function BoundaryEvent(activityDef, context) {
  return (0, _Activity.default)(BoundaryEventBehaviour, activityDef, context);
}

function BoundaryEventBehaviour(activity) {
  const {
    id,
    type = 'BoundaryEvent',
    broker,
    environment,
    attachedTo,
    behaviour = {},
    eventDefinitions,
    logger
  } = activity;
  const attachedToId = attachedTo.id;
  const cancelActivity = 'cancelActivity' in behaviour ? behaviour.cancelActivity : true;
  const eventDefinitionExecution = eventDefinitions && (0, _EventDefinitionExecution.default)(activity, eventDefinitions, 'execute.bound.completed');
  return {
    id,
    type,
    attachedTo,
    cancelActivity,
    execute
  };

  function execute(executeMessage) {
    const executeContent = (0, _messageHelper.cloneContent)(executeMessage.content);
    const {
      isRootScope,
      executionId,
      inbound
    } = executeContent;
    let parentExecutionId, completeContent;
    const errorConsumerTags = [];

    if (isRootScope) {
      parentExecutionId = executionId;

      if (eventDefinitionExecution && !environment.settings.strict) {
        broker.subscribeTmp('execution', 'execute.expect', onExpectMessage, {
          noAck: true,
          consumerTag: '_expect-tag'
        });
      }

      attachedTo.broker.subscribeTmp('event', 'activity.leave', onAttachedLeave, {
        noAck: true,
        consumerTag: `_bound-listener-${parentExecutionId}`,
        priority: 300
      });
      broker.subscribeOnce('api', `activity.stop.${parentExecutionId}`, stop, {
        noAck: true,
        consumerTag: `_api-stop-${parentExecutionId}`
      });
      broker.subscribeOnce('execution', 'execute.bound.completed', onCompleted, {
        noAck: true,
        consumerTag: `_execution-completed-${parentExecutionId}`
      });
    }

    if (eventDefinitionExecution) eventDefinitionExecution.execute(executeMessage);

    function onCompleted(_, message) {
      if (!cancelActivity && !message.content.cancelActivity) {
        stop();
        return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(message.content));
      }

      completeContent = message.content;
      const attachedToContent = inbound && inbound[0];
      logger.debug(`<${executionId} (id)> cancel ${attachedTo.status} activity <${attachedToContent.executionId} (${attachedToContent.id})>`);
      attachedTo.getApi({
        content: attachedToContent
      }).discard();
    }

    function onAttachedLeave(routingKey, message) {
      if (message.content.id !== attachedToId) return;
      stop();
      if (!completeContent) return broker.publish('execution', 'execute.discard', executeContent);
      return broker.publish('execution', 'execute.completed', completeContent);
    }

    function onExpectMessage(_, message) {
      const errorConsumerTag = `_bound-error-listener-${message.content.executionId}`;
      errorConsumerTags.push(errorConsumerTag);
      attachedTo.broker.subscribeTmp('event', 'activity.error', attachedErrorHandler(message.content.expectRoutingKey), {
        noAck: true,
        consumerTag: errorConsumerTag,
        priority: 300
      });
    }

    function attachedErrorHandler(routingKey) {
      return function onAttachedError(_, message) {
        if (message.content.id !== attachedToId) return;
        broker.publish('execution', routingKey, (0, _messageHelper.cloneContent)(message.content));
      };
    }

    function stop() {
      attachedTo.broker.cancel(`_bound-listener-${parentExecutionId}`);
      attachedTo.broker.cancel(`_bound-error-listener-${parentExecutionId}`);
      errorConsumerTags.forEach(tag => attachedTo.broker.cancel(tag));
      broker.cancel('_expect-tag');
      broker.cancel(`_api-stop-${parentExecutionId}`);
      broker.cancel(`_execution-completed-${parentExecutionId}`);
    }
  }
}