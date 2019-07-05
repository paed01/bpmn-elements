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
    attachedTo,
    behaviour = {}
  } = activity;
  const attachedToId = attachedTo.id;
  const cancelActivity = 'cancelActivity' in behaviour ? behaviour.cancelActivity : true;
  const {
    eventDefinitions
  } = behaviour;
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
    let completeContent;

    if (isRootScope) {
      attachedTo.broker.subscribeTmp('event', 'activity.leave', onAttachedLeave, {
        noAck: true,
        consumerTag: `_bound-listener-${executionId}`,
        priority: 200
      });
      broker.subscribeOnce('api', `activity.stop.${executionId}`, stop, {
        noAck: true,
        consumerTag: `_api-stop-${executionId}`
      });
      broker.subscribeOnce('execution', 'execute.bound.completed', onCompleted, {
        noAck: true,
        consumerTag: `_execution-completed-${executionId}`
      });
    }

    if (eventDefinitionExecution) eventDefinitionExecution.execute(executeMessage);

    function onCompleted(_, message) {
      if (!cancelActivity) {
        stop();
        return broker.publish('execution', 'execute.completed', { ...message.content
        });
      }

      completeContent = (0, _messageHelper.cloneContent)(message.content);
      const attachedToContent = inbound && inbound[0];
      attachedTo.getApi({
        content: attachedToContent
      }).discard();
    }

    function onAttachedLeave(routingKey, attachMessage) {
      if (attachMessage.content.id !== attachedToId) return;
      if (!completeContent) return discard();
      stop();
      broker.publish('execution', 'execute.completed', { ...completeContent
      });
    }

    function discard() {
      stop();
      if (eventDefinitionExecution) eventDefinitionExecution.discard();
      return broker.publish('execution', 'execute.discard', { ...executeContent,
        state: 'discard'
      });
    }

    function stop() {
      attachedTo.broker.cancel(`_bound-listener-${executionId}`);
      broker.cancel(`_api-stop-${executionId}`);
      broker.cancel(`_execution-completed-${executionId}`);
    }
  }
}