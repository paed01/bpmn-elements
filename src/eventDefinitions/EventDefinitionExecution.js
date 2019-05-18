import {cloneContent, unshiftParent, shiftParent} from '../messageHelper';

export default function EventDefinitionExecution(activity, eventDefinitions, completedRoutingKey = 'execute.completed') {
  const {id, broker, logger} = activity;
  const consumerTag = '_execute-event-definition-tag';
  const apiConsumerTag = '_api-event-definition-tag';

  let rootExecutionContent, parent, completed = false, stopped = false;

  return {
    execute,
    discard,
    get completed() {
      return completed;
    },
  };

  function execute(executeMessage) {
    const executeContent = executeMessage.content;
    const isRedelivered = executeMessage.fields.redelivered;
    const {isRootScope, isDefinitionScope, executionId: messageExecutionId} = executeContent;

    if (isDefinitionScope) return executeDefinition();

    if (isRootScope) {
      broker.subscribeOnce('api', `activity.stop.${messageExecutionId}`, stop, {noAck: true, consumerTag: apiConsumerTag});
      broker.subscribeTmp('execution', 'execute.completed', onExecuteCompleted, {noAck: true, consumerTag, priority: 200});
      rootExecutionContent = executeContent;

      parent = unshiftParent(rootExecutionContent.parent, rootExecutionContent);
      broker.publish('execution', 'execute.update', {...cloneContent(rootExecutionContent), preventComplete: true});
    }
    if (isRedelivered) return;

    for (let index = 0; index < eventDefinitions.length; ++index) {
      if (completed) break;
      if (stopped) break;

      const ed = eventDefinitions[index];
      const executionId = `${messageExecutionId}_${index}`;

      logger.debug(`<${messageExecutionId} (${id})> start event definition ${ed.type}, index ${index}`);

      broker.publish('execution', 'execute.start', {
        ...cloneContent(rootExecutionContent),
        isRootScope: undefined,
        type: ed.type,
        executionId,
        isDefinitionScope: true,
        index,
        parent,
      });
    }

    function onExecuteCompleted(_, {content}) {
      if (!content.isDefinitionScope) return;

      completed = true;
      stop();

      logger.debug(`<${messageExecutionId} (${id})> event definition ${content.type} completed, index ${content.index}`);

      broker.publish('execution', completedRoutingKey, {
        ...cloneContent(content),
        executionId: rootExecutionContent.executionId,
        isRootScope: true,
        parent: shiftParent(content.parent),
      });
    }

    function executeDefinition() {
      const ed = eventDefinitions[executeContent.index];
      if (!ed) return logger.warn(`<${messageExecutionId} (${id})> found no event definition on index ${executeContent.index}`);

      const behaviour = ed.Behaviour(activity, ed);

      logger.debug(`<${messageExecutionId} (${id})> execute event definition ${ed.type}, index ${executeContent.index}`);

      behaviour.execute(executeMessage);
    }
  }

  function discard() {
    stop();
  }

  function stop() {
    stopped = true;
    broker.cancel(consumerTag);
    broker.cancel(apiConsumerTag);
  }
}
