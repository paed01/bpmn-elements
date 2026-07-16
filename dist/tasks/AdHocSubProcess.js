"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AdHocSubProcess = AdHocSubProcess;
exports.AdHocSubProcessBehaviour = void 0;
var _SubProcess = require("./SubProcess.js");
var _messageHelper = require("../messageHelper.js");
/**
 * Ad-hoc sub process behaviour. Reuses {@link SubProcessBehaviour} for execution and adds
 * ad-hoc policy — inner-activity ordering, completion condition and cancellation of remaining
 * instances. It subscribes to the sub process event topic and arms/cancels inner activities
 * through public API only, so it can be subclassed or replaced without execution internals.
 */
class AdHocSubProcessBehaviour extends _SubProcess.SubProcessBehaviour {
  /**
   * @param {import('#types').Activity} activity
   * @param {import('#types').ContextInstance} context
   */
  constructor(activity, context) {
    super(activity, context);
    const behaviour = activity.behaviour || {};
    this.sequential = behaviour.ordering === 'Sequential';
    this.cancelRemaining = behaviour.cancelRemainingInstances !== false;
    const completionCondition = behaviour.completionCondition;
    this.completionCondition = completionCondition ? typeof completionCondition === 'string' ? completionCondition : completionCondition.body : undefined;
    this._completing = new WeakSet();
    this._onInnerLeave = this._onInnerLeave.bind(this);
  }

  /**
   * @param {import('#types').ElementBrokerMessage} executeMessage
   */
  execute(executeMessage) {
    const {
      isRootScope,
      executionId
    } = executeMessage.content;
    if (isRootScope) {
      // React to every inner-activity leave. High priority so we arm the next start (or cancel
      // the rest) before the leave bubbles out of the sub process. Downstream activities have
      // already entered by the time their upstream leaves, so live `postponed` is authoritative.
      this.broker.subscribeTmp('event', 'activity.leave', this._onInnerLeave, {
        noAck: true,
        consumerTag: `_adhoc-inner-leave-${executionId}`,
        priority: 400
      });
    }
    const result = super.execute(executeMessage);

    // Arm the inner start activities once the execution is running: all of them in parallel, or the
    // first when sequential. On resume the running instances are restored, so only arm on the initial run.
    if (isRootScope && !executeMessage.fields.redelivered) this.startInner(this.execution);
    return result;
  }

  /**
   * Arm the inner start activities of the given execution — all in parallel, or the first when
   * sequential. Override to customise ad-hoc ordering.
   * @param {import('../process/ProcessExecution.js').ProcessExecution} [execution]
   */
  startInner(execution) {
    if (!execution) return;
    if (this.sequential) {
      this.armNext(execution);
      return;
    }
    const starts = execution.getStartActivities();
    for (const activity of starts) activity.init();
    for (const activity of starts) activity.consumeInbound();
  }

  /**
   * Sequential ordering: arm the next not-yet-run inner start activity. Returns whether one was armed.
   * @param {import('../process/ProcessExecution.js').ProcessExecution} [execution]
   * @returns {boolean}
   */
  armNext(execution) {
    if (!execution) return false;
    for (const activity of execution.getStartActivities()) {
      const counters = activity.counters;
      if (counters.taken || counters.discarded || activity.isRunning) continue;
      activity.init();
      activity.consumeInbound();
      return true;
    }
    return false;
  }

  /**
   * Evaluate the completion condition against the inner activity that just left. Override to
   * customise ad-hoc completion.
   * @param {import('#types').ElementBrokerMessage} message
   * @param {import('../process/ProcessExecution.js').ProcessExecution} execution
   * @returns {boolean}
   */
  completionMet(message, execution) {
    if (!this.completionCondition) return false;
    return !!execution.environment.resolveExpression(this.completionCondition, (0, _messageHelper.cloneMessage)(message));
  }

  /** @internal event-topic handler for inner-activity leaves */
  _onInnerLeave(_, message) {
    const content = message.content;
    // Only direct inner children of this ad-hoc sub process.
    if (content.id === this.id || content.parent?.id !== this.id) return;
    const execution = this.execution;
    if (!execution || this._completing.has(execution)) return;
    if (this.completionMet(message, execution)) {
      this._completing.add(execution);
      if (this.cancelRemaining) {
        for (const api of execution.getPostponed()) {
          if (api.content.executionId === content.executionId || api.content.isForCompensation) continue;
          api.discard();
        }
      }
      return;
    }
    if (!this.sequential) return;
    // Arm the next start only once the branch that just left has fully drained.
    const stillRunning = execution.getPostponed().some(api => api.content.executionId !== content.executionId);
    if (!stillRunning) this.armNext(execution);
  }

  /** @internal cancel the inner-leave subscription when the execution settles */
  _onExecutionCompleted(routingKey, message) {
    this.broker.cancel(`_adhoc-inner-leave-${message.content.executionId}`);
    return super._onExecutionCompleted(routingKey, message);
  }
}

/**
 * Ad-hoc sub process
 * @param {import('moddle-context-serializer').Activity} activityDef
 * @param {import('#types').ContextInstance} context
 */
exports.AdHocSubProcessBehaviour = AdHocSubProcessBehaviour;
function AdHocSubProcess(activityDef, context) {
  return (0, _SubProcess.SubProcess)({
    ...activityDef,
    isAdHoc: true
  }, context, AdHocSubProcessBehaviour);
}