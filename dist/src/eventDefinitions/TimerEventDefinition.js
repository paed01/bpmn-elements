"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = TimerEventDefinition;

var _messageHelper = require("../messageHelper");

var _iso8601Duration = require("iso8601-duration");

function TimerEventDefinition(activity, eventDefinition) {
  const {
    id,
    broker,
    environment
  } = activity;
  const {
    type = 'TimerEventDefinition',
    behaviour = {}
  } = eventDefinition;
  const {
    timeDuration,
    timeCycle,
    timeDate
  } = behaviour;
  const logger = environment.Logger(type.toLowerCase());
  let timer;
  const source = {
    type,
    ...(timeDuration ? {
      timeDuration
    } : undefined),
    ...(timeCycle ? {
      timeCycle
    } : undefined),
    ...(timeDate ? {
      timeDate
    } : undefined),
    execute,

    stop() {
      if (timer) timer = clearTimeout(timer);
    }

  };
  Object.defineProperty(source, 'timer', {
    get() {
      return timer;
    }

  });
  return source;

  function execute(startMessage) {
    if (timer) timer = clearTimeout(timer);
    const isResumed = startMessage.fields && startMessage.fields.redelivered;
    const messageContent = startMessage.content;
    const {
      executionId
    } = messageContent;

    if (isResumed && startMessage.fields.routingKey !== 'execute.timer') {
      return logger.debug(`<${executionId} (${id})> resumed, waiting for timer message`);
    }

    let startedAt = new Date();
    const timerContent = getTimers();
    let stopped;
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: `_api-${executionId}`,
      priority: 400
    });
    broker.subscribeTmp('api', '#.cancel.*', onDelegatedApiMessage, {
      noAck: true,
      consumerTag: `_api-delegated-${executionId}`
    });
    broker.publish('execution', 'execute.timer', (0, _messageHelper.cloneContent)(timerContent, { ...(isResumed ? {
        isResumed
      } : undefined)
    }));
    broker.publish('event', 'activity.timer', (0, _messageHelper.cloneContent)(timerContent, { ...(isResumed ? {
        isResumed
      } : undefined)
    }));
    if (stopped) return;
    if (timerContent.timeDate) executeTimeDate();
    if (timerContent.timeout >= 0) return executeTimer();

    if (!timerContent.timeDate && !timerContent.timeDuration && !timerContent.timeCycle) {
      return completed();
    }

    function getTimers() {
      let resolvedTimeDuration = timeDuration && environment.resolveExpression(timeDuration, startMessage);
      let resolvedTimeDate = timeDate && environment.resolveExpression(timeDate, startMessage);
      let resolvedTimeCycle = timeCycle && environment.resolveExpression(timeCycle, startMessage);

      if (isResumed) {
        startedAt = 'startedAt' in messageContent ? new Date(messageContent.startedAt) : startedAt;
        resolvedTimeDuration = messageContent.timeDuration || resolvedTimeDuration;
        resolvedTimeDate = messageContent.timeDate || resolvedTimeDate;
        resolvedTimeCycle = messageContent.timeCycle || resolvedTimeCycle;
      }

      const duration = resolveDuration();
      const timeDateDt = resolvedTimeDate && parseDate(resolvedTimeDate);
      return (0, _messageHelper.cloneContent)(messageContent, { ...(resolvedTimeDuration ? {
          timeDuration: resolvedTimeDuration
        } : undefined),
        ...(resolvedTimeCycle ? {
          timeCycle: resolvedTimeCycle
        } : undefined),
        ...(resolvedTimeDate ? {
          timeDate: timeDateDt || resolvedTimeDate
        } : undefined),
        ...duration,
        startedAt,
        state: 'timer'
      });

      function resolveDuration() {
        const {
          timeout: isoTimeout,
          isoDuration
        } = resolveIsoDuration(resolvedTimeDuration);
        const expireAt = resolvedTimeDate && parseDate(resolvedTimeDate);
        const {
          timeout: dateTimeout
        } = resolveDateDuration(expireAt);
        if (isoTimeout === undefined && dateTimeout === undefined) return;
        return {
          timeout: [isoTimeout, dateTimeout].filter(Boolean).sort().shift() || 0,
          ...(isoDuration ? isoDuration : undefined)
        };
      }

      function resolveIsoDuration(isoDuration) {
        if (!isoDuration) return {};

        try {
          var timeout = 'timeout' in messageContent ? messageContent.timeout : (0, _iso8601Duration.toSeconds)((0, _iso8601Duration.parse)(isoDuration)) * 1000; // eslint-disable-line no-var
        } catch (err) {
          logger.error(`<${id}> invalid ISO8601 >${isoDuration}<: ${err.message}`);
          return {};
        }

        if (isResumed) {
          const originalTimeout = timeout;
          timeout = originalTimeout - (new Date() - startedAt);
          if (timeout < 0) timeout = 0;
          logger.debug(`<${executionId} (${id})> resume timer ${originalTimeout}ms started at ${startedAt.toISOString()}, duration ${isoDuration}, remaining ${timeout}ms`);
        } else {
          logger.debug(`<${executionId} (${id})> duration timer ${timeout}ms, duration ${isoDuration}`);
        }

        return {
          timeout,
          isoDuration
        };
      }

      function resolveDateDuration(expireAt) {
        if (!expireAt) return {};
        let timeout = expireAt - new Date();
        if (timeout < 0) timeout = 0;
        return {
          timeout
        };
      }
    }

    function executeTimeDate() {
      if (timerContent.timeDate < Date.now()) {
        logger.debug(`<${executionId} (${id})> ${timerContent.timeDate.toISOString()} is due`);
        return completed();
      }
    }

    function executeTimer() {
      if (stopped) return;
      const {
        timeout
      } = timerContent;
      logger.debug(`<${executionId} (${id})> start timer ${timeout}ms`);
      timer = setTimeout(completeTimer, timeout);

      function completeTimer() {
        logger.debug(`<${executionId} (${id})> timed out`);
        return completed();
      }
    }

    function completed(completeContent, options) {
      stop();
      const stoppedAt = new Date();
      const runningTime = stoppedAt.getTime() - startedAt.getTime();
      logger.debug(`<${executionId} (${id})> completed in ${runningTime}ms`);
      const completedContent = { ...timerContent,
        stoppedAt,
        runningTime,
        state: 'timeout'
      };
      broker.publish('event', 'activity.timeout', (0, _messageHelper.cloneContent)(completedContent, completeContent), options);
      broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(completedContent, completeContent), options);
    }

    function onDelegatedApiMessage(routingKey, message) {
      if (!message.properties.delegate) return;
      const {
        content: delegateContent
      } = message;
      if (!delegateContent.message) return;
      const {
        id: signalId,
        executionId: signalExecutionId
      } = delegateContent.message;
      if (signalId !== id && signalExecutionId !== executionId) return;
      if (signalExecutionId && signalId === id && signalExecutionId !== executionId) return;
      const {
        type: messageType,
        correlationId
      } = message.properties;
      broker.publish('event', 'activity.consumed', (0, _messageHelper.cloneContent)(timerContent, {
        message: { ...delegateContent.message
        }
      }), {
        correlationId,
        type: messageType
      });
      return onApiMessage(routingKey, message);
    }

    function onApiMessage(routingKey, message) {
      const {
        type: messageType,
        correlationId
      } = message.properties;

      switch (messageType) {
        case 'cancel':
          {
            stop();
            return completed({
              state: 'cancel',
              ...(message.content.message ? {
                message: message.content.message
              } : undefined)
            }, {
              correlationId
            });
          }

        case 'stop':
          {
            stop();
            return logger.debug(`<${executionId} (${id})> stopped`);
          }

        case 'discard':
          {
            stop();
            logger.debug(`<${executionId} (${id})> discarded`);
            return broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(timerContent, {
              state: 'discard'
            }), {
              correlationId
            });
          }
      }
    }

    function stop() {
      stopped = true;
      timer = clearTimeout(timer);
      broker.cancel(`_api-${executionId}`);
      broker.cancel(`_api-delegated-${executionId}`);
    }
  }

  function parseDate(str) {
    const ms = Date.parse(str);
    if (isNaN(ms)) return logger.error(`<${id}> invalid date >${str}<`);
    return new Date(ms);
  }
}