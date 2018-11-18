import {cloneContent, shiftParent} from '../messageHelper';
import {getUniqueId} from '../shared';

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
    const {isRootScope, isDefinitionScope, executionId: msgExecutionId} = executeContent;

    if (isDefinitionScope) return executeDefinition();

    if (isRootScope) {
      broker.subscribeOnce('api', `activity.stop.${msgExecutionId}`, stop, {noAck: true, consumerTag: apiConsumerTag});
      broker.subscribeTmp('execution', 'execute.completed', onExecuteCompleted, {noAck: true, consumerTag, priority: 200});
      rootExecutionContent = cloneContent(executeContent);

      parent = shiftParent(rootExecutionContent, rootExecutionContent.parent);

      broker.publish('execution', 'execute.update', {...rootExecutionContent, preventComplete: true});
    }
    if (isRedelivered) return;

    for (let index = 0; index < eventDefinitions.length; index++) {
      if (completed) break;
      if (stopped) break;

      const ed = eventDefinitions[index];
      const executionId = getUniqueId(id);

      logger.debug(`<${rootExecutionContent.executionId} (${id})> start event definition ${ed.type}, index ${index}`);

      broker.publish('execution', 'execute.start', {
        ...rootExecutionContent,
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

      logger.debug(`<${rootExecutionContent.executionId} (${id})> event definition ${content.type} completed, index ${content.index}`);

      broker.publish('execution', completedRoutingKey, {
        ...content,
        executionId: rootExecutionContent.executionId,
        isRootScope: true,
      });
    }

    function executeDefinition() {
      const ed = eventDefinitions[executeContent.index];
      if (!ed) return logger.warn(`<${rootExecutionContent.executionId} (${id})> found no event definition on index ${executeContent.index}`);

      const behaviour = ed.Behaviour(activity, ed);

      logger.debug(`<${rootExecutionContent.executionId} (${id})> execute event definition ${ed.type}, index ${executeContent.index}`);

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
