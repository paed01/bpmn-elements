export function ActivityTracker(parentId) {
  this.id = parentId;
  this.status = { wait: new Set(), execute: new Set(), timer: new Set() };
}

Object.defineProperty(ActivityTracker.prototype, 'activityStatus', {
  get() {
    const status = this.status;
    if (status.execute.size) return 'executing';
    if (status.timer.size) return 'timer';
    return status.wait.size ? 'wait' : 'idle';
  },
});

ActivityTracker.prototype.track = function track(routingKey, message) {
  const content = message.content;
  if (content.isAssociation) return;
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
    case 'activity.call':
    case 'activity.wait': {
      if (content.isMultiInstance) this._waiting(content.parent.executionId);
      else this._waiting(executionId);
      break;
    }
    case 'activity.timer':
      this._timer(content.parent.executionId);
      break;
    case 'activity.leave':
      this._leave(executionId);
      break;
  }
};

ActivityTracker.prototype._executing = function executing(id) {
  const { wait, execute } = this.status;
  wait.delete(id);
  execute.add(id);
};

ActivityTracker.prototype._waiting = function waiting(id) {
  const { wait, execute } = this.status;
  execute.delete(id);
  wait.add(id);
};

ActivityTracker.prototype._timer = function timerFn(id) {
  const { timer, execute } = this.status;
  execute.delete(id);
  timer.add(id);
};

ActivityTracker.prototype._leave = function leave(id) {
  const { wait, execute, timer } = this.status;
  execute.delete(id);
  timer.delete(id);
  wait.delete(id);
};
