"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TimerEventDefinition = TimerEventDefinition;
var _piso = require("@0dep/piso");
var _messageHelper = require("../messageHelper.js");
var _Errors = require("../error/Errors.js");
var _constants = require("../constants.js");
const K_TIMER_CONTENT = Symbol.for('timerContent');
const K_TIMER = Symbol.for('timer');
const timerTypes = new Set(['timeDuration', 'timeDate', 'timeCycle']);

/**
 * Timer event definition
 * @param {import('#types').Activity} activity
 * @param {import('#types').SerializableElement} eventDefinition
 */
function TimerEventDefinition(activity, eventDefinition) {
  const type = this.type = eventDefinition.type || 'TimerEventDefinition';
  this.activity = activity;
  const environment = this.environment = activity.environment;
  this.eventDefinition = eventDefinition;
  const {
    timeDuration,
    timeCycle,
    timeDate
  } = eventDefinition.behaviour || {};
  if (timeDuration) this.timeDuration = /** @type {string} */timeDuration;
  if (timeCycle) this.timeCycle = /** @type {string} */timeCycle;
  if (timeDate) this.timeDate = /** @type {string} */timeDate;
  this.broker = activity.broker;
  this.logger = environment.Logger(type.toLowerCase());

  /** @internal */
  this[_constants.K_STOPPED] = false;
  /** @internal */
  this[K_TIMER] = null;
  /** @internal */
  this[K_TIMER_CONTENT] = undefined;
}
Object.defineProperty(TimerEventDefinition.prototype, 'executionId', {
  /** @returns {string} */
  get() {
    return this[K_TIMER_CONTENT]?.executionId;
  }
});
Object.defineProperty(TimerEventDefinition.prototype, 'stopped', {
  /** @returns {boolean} */
  get() {
    return this[_constants.K_STOPPED];
  }
});
Object.defineProperty(TimerEventDefinition.prototype, 'timer', {
  /** @returns {import('#types').Timer | null} */
  get() {
    return this[K_TIMER];
  }
});

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
TimerEventDefinition.prototype.execute = function execute(executeMessage) {
  const {
    routingKey: executeKey,
    redelivered: isResumed
  } = executeMessage.fields;
  const timer = this[K_TIMER];
  if (timer && executeKey === 'execute.timer') {
    return;
  }
  if (timer) this[K_TIMER] = this.environment.timers.clearTimeout(timer);
  this[_constants.K_STOPPED] = false;
  const content = executeMessage.content;
  const executionId = content.executionId;
  const startedAt = this.startedAt = 'startedAt' in content ? new Date(content.startedAt) : new Date();
  try {
    // eslint-disable-next-line no-var
    var resolvedTimer = this._getTimers(executeMessage);
  } catch (err) {
    this.logger.error(`<${executionId} (${this.activity.id})> failed to get timeout delay: ${err}`);
    // @ts-ignore
    throw new _Errors.RunError(err.message, executeMessage, err);
  }
  const timerContent = this[K_TIMER_CONTENT] = (0, _messageHelper.cloneContent)(content, {
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
  if (timerContent.timeout <= 0) return this._completed();
  const timers = this.environment.timers.register(timerContent);
  const delay = timerContent.timeout;
  this[K_TIMER] = timers.setTimeout(this._completed.bind(this), delay, {
    id: content.id,
    type: this.type,
    executionId,
    state: 'timeout'
  });
  this._debug(`set timeout with delay ${delay}`);
};
TimerEventDefinition.prototype.stop = function stopTimer() {
  const timer = this[K_TIMER];
  if (timer) this[K_TIMER] = this.environment.timers.clearTimeout(timer);
};
TimerEventDefinition.prototype._completed = function completed(completeContent, options) {
  this._stop();
  const stoppedAt = new Date();
  const runningTime = stoppedAt.getTime() - this.startedAt.getTime();
  this._debug(`completed in ${runningTime}ms`);
  const timerContent = this[K_TIMER_CONTENT];
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
  } else if (timerContent.repeat === -1) {
    broker.publish('execution', 'execute.repeat', (0, _messageHelper.cloneContent)(timerContent, content), options);
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
  this.broker.publish('event', 'activity.consumed', (0, _messageHelper.cloneContent)(this[K_TIMER_CONTENT], {
    message: {
      ...content.message
    }
  }), {
    correlationId,
    type
  });
  return this._onApiMessage(routingKey, message);
};
TimerEventDefinition.prototype._onApiMessage = function onApiMessage(_routingKey, message) {
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
        return this.broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(this[K_TIMER_CONTENT], {
          state: 'discard'
        }), {
          correlationId
        });
      }
  }
};

/** @internal */
TimerEventDefinition.prototype._stop = function stop() {
  this[_constants.K_STOPPED] = true;
  const timer = this[K_TIMER];
  if (timer) this[K_TIMER] = this.environment.timers.clearTimeout(timer);
  const broker = this.broker;
  broker.cancel(`_api-${this.executionId}`);
  broker.cancel(`_api-delegated-${this.executionId}`);
};

/**
 * Parse timer
 * @param {import('#types').TimerType} timerType
 * @param {string} value
 * @returns {import('#types').parsedTimer}
 */
TimerEventDefinition.prototype.parse = function parse(timerType, value) {
  let repeat, delay, expireAt;
  const now = new Date();
  switch (timerType) {
    case 'timeCycle':
    case 'timeDuration':
      {
        const parsed = new _piso.ISOInterval(value).parse();
        if (parsed.repeat) repeat = parsed.repeat;
        expireAt = parsed.getExpireAt(now, now);
        delay = expireAt.getTime() - now.getTime();
        break;
      }
    case 'timeDate':
      {
        expireAt = (0, _piso.getDate)(value);
        // @ts-ignore
        delay = now.getTime() - expireAt;
        break;
      }
  }
  return {
    expireAt,
    repeat,
    delay
  };
};
TimerEventDefinition.prototype._getTimers = function getTimers(executeMessage) {
  const content = executeMessage.content;
  const result = {
    ...('expireAt' in content && {
      expireAt: new Date(content.expireAt)
    })
  };
  const now = new Date();
  for (const timerType of timerTypes) {
    if (timerType in content) result[timerType] = content[timerType];else if (timerType in this) result[timerType] = this.environment.resolveExpression(this[timerType], executeMessage);else continue;
    let expireAtDate, repeat;
    const timerStr = result[timerType];
    if (timerStr) {
      const {
        repeat: parsedRepeat,
        expireAt: parsedExpireAt
      } = this.parse(
      // @ts-ignore
      timerType, timerStr);
      repeat = parsedRepeat;
      if (!parsedExpireAt || !parsedExpireAt.getTime) {
        throw new TypeError(`Parsed ${timerType} "${timerStr}" expireAt failed to resolve to a date`);
      }
      expireAtDate = parsedExpireAt;
    } else {
      expireAtDate = now;
    }
    if (!('expireAt' in result) || result.expireAt > expireAtDate) {
      // @ts-ignore
      result.timerType = timerType;
      result.expireAt = expireAtDate;
      // @ts-ignore
      result.repeat = repeat;
    }
  }
  if ('expireAt' in result) {
    // @ts-ignore
    result.timeout = result.expireAt - now.getTime();
  } else if ('timeout' in content) {
    // @ts-ignore
    result.timeout = content.timeout;
  } else if (!Object.keys(result).length) {
    // @ts-ignore
    result.timeout = 0;
  }
  if (content.inbound?.[0] && 'repeat' in content.inbound[0]) {
    // @ts-ignore
    result.repeat = content.inbound[0].repeat;
  }
  return result;
};
TimerEventDefinition.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};