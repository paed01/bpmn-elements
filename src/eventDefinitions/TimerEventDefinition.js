import { ISOInterval, getDate } from '@0dep/piso';
import { cloneContent } from '../messageHelper.js';
import { RunError } from '../error/Errors.js';
import { K_STOPPED } from '../constants.js';

const K_TIMER_CONTENT = Symbol.for('timerContent');
const K_TIMER = Symbol.for('timer');

const timerTypes = new Set(['timeDuration', 'timeDate', 'timeCycle']);

/**
 * Timer event definition
 * @param {import('#types').Activity} activity
 * @param {import('moddle-context-serializer').EventDefinition} eventDefinition
 */
export function TimerEventDefinition(activity, eventDefinition) {
  const type = (this.type = eventDefinition.type || 'TimerEventDefinition');
  this.activity = activity;
  const environment = (this.environment = activity.environment);
  this.eventDefinition = eventDefinition;

  const { timeDuration, timeCycle, timeDate } = eventDefinition.behaviour || {};
  if (timeDuration) this.timeDuration = /** @type {string} */ (timeDuration);
  if (timeCycle) this.timeCycle = /** @type {string} */ (timeCycle);
  if (timeDate) this.timeDate = /** @type {string} */ (timeDate);

  this.broker = activity.broker;
  this.logger = environment.Logger(type.toLowerCase());

  /** @internal */
  this[K_STOPPED] = false;
  /** @internal */
  this[K_TIMER] = null;
  /** @internal */
  this[K_TIMER_CONTENT] = undefined;
}

Object.defineProperty(TimerEventDefinition.prototype, 'executionId', {
  /** @returns {string} */
  get() {
    return this[K_TIMER_CONTENT]?.executionId;
  },
});

Object.defineProperty(TimerEventDefinition.prototype, 'stopped', {
  /** @returns {boolean} */
  get() {
    return this[K_STOPPED];
  },
});

Object.defineProperty(TimerEventDefinition.prototype, 'timer', {
  /** @returns {import('#types').Timer | null} */
  get() {
    return this[K_TIMER];
  },
});

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
TimerEventDefinition.prototype.execute = function execute(executeMessage) {
  const { routingKey: executeKey, redelivered: isResumed } = executeMessage.fields;
  const timer = this[K_TIMER];
  if (timer && executeKey === 'execute.timer') {
    return;
  }

  if (timer) this[K_TIMER] = this.environment.timers.clearTimeout(timer);
  this[K_STOPPED] = false;

  const content = executeMessage.content;
  const executionId = content.executionId;
  const startedAt = (this.startedAt = 'startedAt' in content ? new Date(content.startedAt) : new Date());

  try {
    // eslint-disable-next-line no-var
    var resolvedTimer = this._getTimers(executeMessage);
  } catch (err) {
    this.logger.error(`<${executionId} (${this.activity.id})> failed to get timeout delay: ${err}`);
    throw new RunError(err.message, executeMessage, err);
  }

  const timerContent = (this[K_TIMER_CONTENT] = cloneContent(content, {
    ...resolvedTimer,
    ...(isResumed && { isResumed }),
    startedAt,
    state: 'timer',
  }));

  const broker = this.broker;
  broker.subscribeTmp('api', `activity.#.${executionId}`, this._onApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-${executionId}`,
    priority: 400,
  });
  broker.subscribeTmp('api', '#.cancel.*', this._onDelegatedApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-delegated-${executionId}`,
  });

  broker.publish('execution', 'execute.timer', cloneContent(timerContent));
  broker.publish('event', 'activity.timer', cloneContent(timerContent));

  if (this.stopped) return;

  if (timerContent.timeout <= 0) return this._completed();

  const timers = this.environment.timers.register(timerContent);
  const delay = timerContent.timeout;
  this[K_TIMER] = timers.setTimeout(this._completed.bind(this), delay, {
    id: content.id,
    type: this.type,
    executionId,
    state: 'timeout',
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
  const content = { stoppedAt, runningTime, state: 'timeout', ...completeContent };

  const broker = this.broker;
  broker.publish('event', 'activity.timeout', cloneContent(timerContent, content), options);

  if (timerContent.repeat > 1) {
    const repeat = timerContent.repeat - 1;
    broker.publish('execution', 'execute.repeat', cloneContent(timerContent, { ...content, repeat }), options);
  } else if (timerContent.repeat === -1) {
    broker.publish('execution', 'execute.repeat', cloneContent(timerContent, content), options);
  }

  broker.publish('execution', 'execute.completed', cloneContent(timerContent, content), options);
};

TimerEventDefinition.prototype._onDelegatedApiMessage = function onDelegatedApiMessage(routingKey, message) {
  if (!message.properties.delegate) return;

  const content = message.content;
  if (!content.message) return;

  const { id: signalId, executionId: signalExecutionId } = content.message;

  const executionId = this.executionId;
  const id = this.activity.id;
  if (signalId !== id && signalExecutionId !== executionId) return;
  if (signalExecutionId && signalId === id && signalExecutionId !== executionId) return;

  const { type, correlationId } = message.properties;
  this.broker.publish(
    'event',
    'activity.consumed',
    cloneContent(this[K_TIMER_CONTENT], {
      message: {
        ...content.message,
      },
    }),
    { correlationId, type }
  );

  return this._onApiMessage(routingKey, message);
};

TimerEventDefinition.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  const { type: messageType, correlationId } = message.properties;

  switch (messageType) {
    case 'cancel': {
      this._stop();
      return this._completed(
        {
          state: 'cancel',
          ...(message.content.message && { message: message.content.message }),
        },
        { correlationId }
      );
    }
    case 'stop': {
      this._stop();
      return this._debug('stopped');
    }
    case 'discard': {
      this._stop();
      this._debug('discarded');
      return this.broker.publish('execution', 'execute.discard', cloneContent(this[K_TIMER_CONTENT], { state: 'discard' }), {
        correlationId,
      });
    }
  }
};

/** @private */
TimerEventDefinition.prototype._stop = function stop() {
  this[K_STOPPED] = true;
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
    case 'timeDuration': {
      const parsed = new ISOInterval(value).parse();
      if (parsed.repeat) repeat = parsed.repeat;
      expireAt = parsed.getExpireAt(now, now);
      delay = expireAt.getTime() - now.getTime();
      break;
    }
    case 'timeDate': {
      expireAt = getDate(value);
      delay = now.getTime() - expireAt;
      break;
    }
  }

  return {
    expireAt,
    repeat,
    delay,
  };
};

TimerEventDefinition.prototype._getTimers = function getTimers(executeMessage) {
  const content = executeMessage.content;

  const result = {
    ...('expireAt' in content && { expireAt: new Date(content.expireAt) }),
  };

  const now = new Date();

  for (const timerType of timerTypes) {
    if (timerType in content) result[timerType] = content[timerType];
    else if (timerType in this) result[timerType] = this.environment.resolveExpression(this[timerType], executeMessage);
    else continue;

    let expireAtDate, repeat;
    const timerStr = result[timerType];
    if (timerStr) {
      const { repeat: parsedRepeat, expireAt: parsedExpireAt } = this.parse(timerType, timerStr);
      repeat = parsedRepeat;
      if (!parsedExpireAt || !parsedExpireAt.getTime) {
        throw new TypeError(`Parsed ${timerType} "${timerStr}" expireAt failed to resolve to a date`);
      }
      expireAtDate = parsedExpireAt;
    } else {
      expireAtDate = now;
    }

    if (!('expireAt' in result) || result.expireAt > expireAtDate) {
      result.timerType = timerType;
      result.expireAt = expireAtDate;
      result.repeat = repeat;
    }
  }

  if ('expireAt' in result) {
    result.timeout = result.expireAt - now.getTime();
  } else if ('timeout' in content) {
    result.timeout = content.timeout;
  } else if (!Object.keys(result).length) {
    result.timeout = 0;
  }

  if (content.inbound?.[0] && 'repeat' in content.inbound[0]) {
    result.repeat = content.inbound[0].repeat;
  }

  return result;
};

TimerEventDefinition.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};
