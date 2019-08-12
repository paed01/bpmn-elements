import {cloneContent} from '../messageHelper';
import {toSeconds, parse} from 'iso8601-duration';

export default function TimerEventDefinition(activity, eventDefinition) {
  const {id, broker, environment} = activity;
  const {type = 'TimerEventDefinition', behaviour = {}} = eventDefinition;
  const {timeDuration} = behaviour;
  const {debug} = environment.Logger(type.toLowerCase());

  let timer;

  const source = {
    type,
    timeDuration,
    execute,
    stop() {
      if (timer) timer = clearTimeout(timer);
    },
  };

  Object.defineProperty(source, 'timer', {
    get() {
      return timer;
    },
  });

  return source;

  function execute(startMessage) {
    if (timer) timer = clearTimeout(timer);

    const messageContent = startMessage.content;
    const {executionId} = messageContent;
    const isResumed = startMessage.fields && startMessage.fields.redelivered;

    if (isResumed && startMessage.fields.routingKey !== 'execute.timer') {
      return debug(`<${executionId} (${id})> resumed, waiting for timer message`);
    }

    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {noAck: true, consumerTag: `_api-${executionId}`, priority: 400});

    let timerContent;

    return isResumed ? resumeTimer() : executeTimer();

    function executeTimer() {
      const isoDuration = timeDuration && environment.resolveExpression(timeDuration, startMessage);
      const timeout = isoDuration ? toSeconds(parse(isoDuration)) * 1000 : 0;

      const startedAt = new Date();
      debug(`<${executionId} (${id})> start timer ${timeout}ms, duration ${isoDuration || 'none'}`);
      timerContent = {...messageContent, isoDuration, timeout, startedAt, state: 'timer'};

      broker.publish('execution', 'execute.timer', cloneContent(timerContent));
      broker.publish('event', 'activity.timer', cloneContent(timerContent));

      timer = setTimeout(completed, timeout);
    }

    function resumeTimer() {
      timerContent = startMessage.content;

      const {startedAt, isoDuration, timeout: originalTimeout} = timerContent;
      const startDate = new Date(startedAt);
      let timeout = originalTimeout - (new Date() - startDate);
      if (timeout < 0) timeout = 0;

      debug(`<${executionId} (${id})> resume timer ${originalTimeout}ms started at ${startDate.toISOString()}, duration ${isoDuration || 'none'}, remaining ${timeout}ms`);

      broker.publish('execution', 'execute.timer', cloneContent(timerContent));
      broker.publish('event', 'activity.timer', cloneContent(timerContent));

      timer = setTimeout(completed, timeout);
    }

    function completed() {
      broker.cancel(`_api-${executionId}`);
      timer = undefined;

      const startedAt = new Date(timerContent.startedAt);
      const stoppedAt = new Date();

      const runningTime = stoppedAt.getTime() - startedAt.getTime();
      debug(`<${executionId} (${id})> completed in ${runningTime}ms, duration ${timerContent.isoDuration || 'none'}`);

      const completedContent = {...timerContent, stoppedAt, runningTime, state: 'timeout'};

      broker.publish('event', 'activity.timeout', cloneContent(completedContent));
      broker.publish('execution', 'execute.completed', cloneContent(completedContent));
    }

    function onApiMessage(routingKey, message) {
      const apiMessageType = message.properties.type;

      switch (apiMessageType) {
        case 'stop': {
          broker.cancel(`_api-${executionId}`);
          timer = clearTimeout(timer);
          return debug(`<${executionId} (${id})> stopped`);
        }
        case 'discard': {
          broker.cancel(`_api-${executionId}`);
          timer = clearTimeout(timer);
          debug(`<${executionId} (${id})> discarded`);

          return broker.publish('execution', 'execute.discard', {...messageContent, state: 'discard'});
        }
      }
    }
  }
}
