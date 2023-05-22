"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = TimerEventDefinition;
var _messageHelper = require("../messageHelper.js");
var _isoDuration = require("../iso-duration.js");
const kStopped = Symbol.for('stopped');
const kTimerContent = Symbol.for('timerContent');
const kTimer = Symbol.for('timer');
function TimerEventDefinition(activity, eventDefinition) {
  const type = this.type = eventDefinition.type || 'TimerEventDefinition.js';
  this.activity = activity;
  const environment = this.environment = activity.environment;
  this.eventDefinition = eventDefinition;
  const {
    timeDuration,
    timeCycle,
    timeDate
  } = eventDefinition.behaviour || {};
  if (timeDuration) this.timeDuration = timeDuration;
  if (timeCycle) this.timeCycle = timeCycle;
  if (timeDate) this.timeDate = timeDate;
  this.broker = activity.broker;
  this.logger = environment.Logger(type.toLowerCase());
  this[kStopped] = false;
  this[kTimer] = null;
}
Object.defineProperty(TimerEventDefinition.prototype, 'executionId', {
  get() {
    const content = this[kTimerContent];
    return content && content.executionId;
  }
});
Object.defineProperty(TimerEventDefinition.prototype, 'stopped', {
  enumerable: true,
  get() {
    return this[kStopped];
  }
});
Object.defineProperty(TimerEventDefinition.prototype, 'timer', {
  enumerable: true,
  get() {
    return this[kTimer];
  }
});
TimerEventDefinition.prototype.execute = function execute(executeMessage) {
  const {
    routingKey: executeKey,
    redelivered: isResumed
  } = executeMessage.fields;
  const timer = this[kTimer];
  if (timer && executeKey === 'execute.timer') {
    return;
  }
  if (timer) this[kTimer] = this.environment.timers.clearTimeout(timer);
  this[kStopped] = false;
  const content = executeMessage.content;
  const executionId = content.executionId;
  const startedAt = this.startedAt = 'startedAt' in content ? new Date(content.startedAt) : new Date();
  const resolvedTimer = this._getTimers(executeMessage);
  const timerContent = this[kTimerContent] = (0, _messageHelper.cloneContent)(content, {
    ...resolvedTimer,
    ...(isResumed && {
      isResumed
    }),
    startedAt,
    state: 'timer'
  });
  const broker = this.broker;
  broker.subscribeTmp('api', `activity.#.${executionId}`, this._onApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-${executionId}`,
    priority: 400
  });
  broker.subscribeTmp('api', '#.cancel.*', this._onDelegatedApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-delegated-${executionId}`
  });
  broker.publish('execution', 'execute.timer', (0, _messageHelper.cloneContent)(timerContent));
  broker.publish('event', 'activity.timer', (0, _messageHelper.cloneContent)(timerContent));
  if (this.stopped) return;
  if (timerContent.timeout === undefined) return this._debug(`waiting for ${timerContent.timerType || 'signal'}`);
  if (timerContent.timeout <= 0) return this._completed();
  const timers = this.environment.timers.register(timerContent);
  const delay = timerContent.timeout;
  this[kTimer] = timers.setTimeout(this._completed.bind(this), delay, {
    id: content.id,
    type: this.type,
    executionId,
    state: 'timeout'
  });
  this._debug(`set timeout with delay ${delay}`);
};
TimerEventDefinition.prototype.stop = function stopTimer() {
  const timer = this[kTimer];
  if (timer) this[kTimer] = this.environment.timers.clearTimeout(timer);
};
TimerEventDefinition.prototype._completed = function completed(completeContent, options) {
  this._stop();
  const stoppedAt = new Date();
  const runningTime = stoppedAt.getTime() - this.startedAt.getTime();
  this._debug(`completed in ${runningTime}ms`);
  const timerContent = this[kTimerContent];
  const content = {
    stoppedAt,
    runningTime,
    state: 'timeout',
    ...completeContent
  };
  const broker = this.broker;
  broker.publish('event', 'activity.timeout', (0, _messageHelper.cloneContent)(timerContent, content), options);
  if (timerContent.repeat > 1) {
    const repeat = timerContent.repeat - 1;
    broker.publish('execution', 'execute.repeat', (0, _messageHelper.cloneContent)(timerContent, {
      ...content,
      repeat
    }), options);
  }
  broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(timerContent, content), options);
};
TimerEventDefinition.prototype._onDelegatedApiMessage = function onDelegatedApiMessage(routingKey, message) {
  if (!message.properties.delegate) return;
  const content = message.content;
  if (!content.message) return;
  const {
    id: signalId,
    executionId: signalExecutionId
  } = content.message;
  const executionId = this.executionId;
  const id = this.activity.id;
  if (signalId !== id && signalExecutionId !== executionId) return;
  if (signalExecutionId && signalId === id && signalExecutionId !== executionId) return;
  const {
    type,
    correlationId
  } = message.properties;
  this.broker.publish('event', 'activity.consumed', (0, _messageHelper.cloneContent)(this[kTimerContent], {
    message: {
      ...content.message
    }
  }), {
    correlationId,
    type
  });
  return this._onApiMessage(routingKey, message);
};
TimerEventDefinition.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  const {
    type: messageType,
    correlationId
  } = message.properties;
  switch (messageType) {
    case 'cancel':
      {
        this._stop();
        return this._completed({
          state: 'cancel',
          ...(message.content.message && {
            message: message.content.message
          })
        }, {
          correlationId
        });
      }
    case 'stop':
      {
        this._stop();
        return this._debug('stopped');
      }
    case 'discard':
      {
        this._stop();
        this._debug('discarded');
        return this.broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(this[kTimerContent], {
          state: 'discard'
        }), {
          correlationId
        });
      }
  }
};
TimerEventDefinition.prototype._stop = function stop() {
  this[kStopped] = true;
  const timer = this[kTimer];
  if (timer) this[kTimer] = this.environment.timers.clearTimeout(timer);
  const broker = this.broker;
  broker.cancel(`_api-${this.executionId}`);
  broker.cancel(`_api-delegated-${this.executionId}`);
};
TimerEventDefinition.prototype._getTimers = function getTimers(executeMessage) {
  const content = executeMessage.content;
  const now = Date.now();
  const result = {
    ...('expireAt' in content && {
      expireAt: new Date(content.expireAt)
    })
  };
  let parseErr;
  for (const t of ['timeDuration', 'timeDate', 'timeCycle']) {
    if (t in content) result[t] = content[t];else if (t in this) result[t] = this.environment.resolveExpression(this[t], executeMessage);else continue;
    let expireAtDate, repeat;
    const timerStr = result[t];
    if (timerStr) {
      switch (t) {
        case 'timeCycle':
        case 'timeDuration':
          {
            try {
              const parsed = (0, _isoDuration.parse)(timerStr);
              if (parsed.repeat) repeat = parsed.repeat;
              const delay = (0, _isoDuration.toSeconds)(parsed) * 1000;
              if (delay !== undefined) expireAtDate = new Date(now + delay);
            } catch (err) {
              parseErr = err;
            }
            break;
          }
        case 'timeDate':
          {
            const dateStr = result[t];
            const ms = Date.parse(dateStr);
            if (!isNaN(ms)) {
              expireAtDate = new Date(ms);
            } else {
              parseErr = new TypeError(`invalid timeDate >${dateStr}<`);
            }
            break;
          }
      }
    } else {
      expireAtDate = new Date(now);
    }
    if (!expireAtDate) continue;
    if (!('expireAt' in result) || result.expireAt > expireAtDate) {
      result.timerType = t;
      result.expireAt = expireAtDate;
      if (repeat) result.repeat = repeat;
    }
  }
  if ('expireAt' in result) {
    result.timeout = result.expireAt - now;
  } else if ('timeout' in content) {
    result.timeout = content.timeout;
  } else if (!Object.keys(result).length) {
    result.timeout = 0;
  }
  if (!('timeout' in result) && parseErr) {
    this.logger.warn(`<${this.activity.id}> failed to parse timer: ${parseErr.message}`);
  }
  if (content.inbound && 'repeat' in content.inbound[0]) {
    result.repeat = content.inbound[0].repeat;
  }
  return result;
};
TimerEventDefinition.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};