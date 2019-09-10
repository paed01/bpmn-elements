import Activity from '../activity/Activity';
import { ActivityError } from '../error/Errors';
import {cloneMessage, cloneContent} from '../messageHelper';

export default function ServiceTask(activityDef, context) {
  return Activity(ServiceTaskBehaviour, activityDef, context);
}

export function ServiceTaskBehaviour(activity) {
  const {id, type, broker, logger, behaviour, environment, emitFatal} = activity;
  const loopCharacteristics = behaviour.loopCharacteristics && behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);

  const source = {
    id,
    type,
    loopCharacteristics,
    execute,
    getService,
  };

  return source;

  function execute(executeMessage) {
    const content = executeMessage.content;
    if (loopCharacteristics && content.isRootScope) {
      return loopCharacteristics.execute(executeMessage);
    }

    const {executionId} = content;
    const service = getService(executeMessage);
    if (!service) return emitFatal(new ActivityError(`<${id}> service not defined`, executeMessage), content);

    broker.subscribeTmp('api', `activity.#.${content.executionId}`, onApiMessage, {consumerTag: `_api-${executionId}`});

    return service.execute(executeMessage, (err, output) => {
      broker.cancel(`_api-${executionId}`);
      if (err) {
        logger.error(`<${content.executionId} (${id})>`, err);
        return broker.publish('execution', 'execute.error', cloneContent(content, {error: new ActivityError(err.message, executeMessage, err)}, {mandatory: true}));
      }

      return broker.publish('execution', 'execute.completed', cloneContent(content, {output, state: 'complete'}));
    });

    function onApiMessage(_, message) {
      if (message.properties.type === 'discard') {
        broker.cancel(`_api-${executionId}`);
        if (service && service.discard) service.discard(message);
        logger.debug(`<${content.executionId} (${id})> discarded`);
        return broker.publish('execution', 'execute.discard', cloneContent(content, {state: 'discard'}));
      }
      if (message.properties.type === 'stop') {
        broker.cancel(`_api-${executionId}`);
        if (service && service.stop) service.stop(message);
        return logger.debug(`<${content.executionId} (${id})> stopped`);
      }
    }
  }

  function getService(message) {
    const Service = behaviour.Service;
    if (!Service) {
      return environment.settings.enableDummyService ? DummyService(activity) : null;
    }
    return Service(activity, cloneMessage(message));
  }

  function DummyService() {
    logger.debug(`<${id}> returning dummy service`);

    return {
      type: 'dummyservice',
      execute: executeDummyService,
    };

    function executeDummyService(...args) {
      logger.debug(`<${id}> executing dummy service`);
      const next = args.pop();
      next();
    }
  }
}
