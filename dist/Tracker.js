"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ActivityTracker = ActivityTracker;
function ActivityTracker(parentId) {
  this.id = parentId;
  this.status = {
    wait: [],
    execute: [],
    timer: []
  };
}
Object.defineProperty(ActivityTracker.prototype, 'activityStatus', {
  get() {
    const status = this.status;
    if (status.execute.length) return 'executing';
    if (status.timer.length) return 'timer';
    return status.wait.length ? 'wait' : 'idle';
  }
});
ActivityTracker.prototype.track = function track(routingKey, message) {
  const content = message.content;
  if (content.isSequenceFlow) return;
  if (content.isSubProcess) return;
  const executionId = content.executionId;
  switch (routingKey) {
    case 'activity.enter':
    case 'activity.discard':
    case 'activity.start':
    case 'activity.execution.completed':
    case 'activity.execution.error':
    case 'activity.end':
      this._executing(executionId);
      break;
    case 'activity.execution.outbound.take':
    case 'activity.detach':
    case 'activity.wait':
      {
        if (content.isMultiInstance) this._waiting(content.parent.executionId);else this._waiting(executionId);
        break;
      }
    case 'activity.timer':
      this._timer(content.parent.executionId);
      break;
    case 'activity.leave':
      this._leave(executionId);
      break;
  }

  // console.log({[routingKey]: executionId, status: this.status})
};

ActivityTracker.prototype._executing = function executing(id) {
  const {
    wait,
    execute
  } = this.status;
  if (execute.indexOf(id) === -1) execute.push(id);
  let idx;
  if ((idx = wait.indexOf(id)) !== -1) wait.splice(idx, 1);
};
ActivityTracker.prototype._waiting = function waiting(id) {
  const {
    wait,
    execute
  } = this.status;
  if (wait.indexOf(id) === -1) wait.push(id);
  let idx;
  if ((idx = execute.indexOf(id)) !== -1) execute.splice(idx, 1);
};
ActivityTracker.prototype._timer = function timerFn(id) {
  const {
    timer,
    execute
  } = this.status;
  if (timer.indexOf(id) === -1) timer.push(id);
  let idx;
  if ((idx = execute.indexOf(id)) !== -1) execute.splice(idx, 1);
};
ActivityTracker.prototype._leave = function leave(id) {
  const {
    wait,
    execute,
    timer
  } = this.status;
  let idx;
  if ((idx = wait.indexOf(id)) !== -1) wait.splice(idx, 1);
  if ((idx = execute.indexOf(id)) !== -1) execute.splice(idx, 1);
  if ((idx = timer.indexOf(id)) !== -1) timer.splice(idx, 1);
};