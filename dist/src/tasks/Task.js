"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TaskBehaviour = TaskBehaviour;
exports.default = Task;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function Task(activityDef, context) {
  return new _Activity.default(TaskBehaviour, activityDef, context);
}

function TaskBehaviour(activity) {
  const {
    id,
    type,
    behaviour,
    broker
  } = activity;
  this.id = id;
  this.type = type;
  this.loopCharacteristics = behaviour.loopCharacteristics && new behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  this.broker = broker;
}

TaskBehaviour.prototype.execute = function execute(executeMessage) {
  const content = executeMessage.content;
  const loopCharacteristics = this.loopCharacteristics;

  if (loopCharacteristics && content.isRootScope) {
    return loopCharacteristics.execute(executeMessage);
  }

  return this.broker.publish('execution', 'execute.completed', { ...content
  });
};