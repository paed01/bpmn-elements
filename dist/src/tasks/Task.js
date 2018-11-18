"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Task;
exports.TaskBehaviour = TaskBehaviour;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function Task(activityDef, context) {
  return (0, _Activity.default)(TaskBehaviour, activityDef, context);
}

function TaskBehaviour(activity) {
  const {
    id,
    type,
    behaviour,
    broker
  } = activity;
  const loopCharacteristics = behaviour.loopCharacteristics && behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  const source = {
    id,
    type,
    loopCharacteristics,
    execute
  };
  return source;

  function execute(executeMessage) {
    const content = executeMessage.content;

    if (loopCharacteristics && content.isRootScope) {
      return loopCharacteristics.execute(executeMessage);
    }

    return broker.publish('execution', 'execute.completed', { ...content
    });
  }
}