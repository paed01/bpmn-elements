import {cloneContent, shiftParent} from '../messageHelper';

export default function MultiInstanceLoopCharacteristics(activity, loopCharacteristics) {
  const {id, broker, environment} = activity;
  const {type = 'MultiInstanceLoopCharacteristics', behaviour = {}} = loopCharacteristics;
  const {isSequential = false, collection: collectionExpression, completionCondition, elementVariable = 'item', loopCardinality} = behaviour;
  const loopType = getLoopType();

  if (!loopType) return;

  const {debug} = environment.Logger(type.toLowerCase());
  const consumerTag = '_execute-q-multi-instance-tag';
  broker.cancel(consumerTag);

  const apiConsumerTag = '_api-multi-instance-tag';
  broker.cancel(apiConsumerTag);

  let startIterationContent, cardinality, collection, loopOutput, parent;

  const characteristics = {
    type,
    loopType,
    collection: collectionExpression,
    elementVariable,
    isSequential,
    loopCardinality,
    execute,
  };

  return characteristics;

  function getLoopType() {
    if (collectionExpression) return 'collection';
    if (loopCardinality) return 'cardinality';
  }

  function execute(executeMessage) {
    const isRedelivered = executeMessage.fields && executeMessage.fields.redelivered;
    const executeRoutingKey = executeMessage.fields && executeMessage.fields.routingKey;
    const {isRootScope, executionId: parentExecutionId} = executeMessage.content;

    if (isRootScope) {
      cardinality = getCardinality();
      collection = getCollection();

      startIterationContent = {
        ...cloneContent(executeMessage.content),
        loopCardinality: cardinality,
        isSequential,
        output: undefined,
      };

      loopOutput = executeMessage.content.output || [];

      parent = shiftParent(executeMessage.content, executeMessage.content.parent);
    }

    return isSequential ? executeSequential() : executeParallel();

    function executeSequential() {
      if (isRedelivered && isRootScope && executeRoutingKey !== 'execute.start') {
        debug(`<${parentExecutionId} (${id})> resume sequential loop from`, executeRoutingKey);

        broker.publish('execution', 'execute.resume', {...executeMessage.content});

        broker.subscribeOnce('api', `activity.stop.${parentExecutionId}`, stop, {consumerTag: apiConsumerTag});
        broker.subscribeTmp('execution', 'execute.completed', onCompleteMessage, {noAck: true, consumerTag, priority: 200});
        return;
      } else if (executeRoutingKey === 'execute.resume') {
        return startNext(executeMessage.content.index, true);
      } else {
        broker.subscribeOnce('api', `activity.stop.${parentExecutionId}`, stop, {consumerTag: apiConsumerTag});
        broker.subscribeTmp('execution', 'execute.completed', onCompleteMessage, {noAck: true, consumerTag, priority: 200});
      }

      return startNext(0);

      function startNext(index, ignoreIfExecuting) {
        const content = next(index);
        if (!content) return;

        debug(`<${content.executionId} (${id})> start sequential iteration index ${content.index}`);
        broker.publish('execution', 'execute.iteration.next', {
          ...content,
          ...executeMessage.content,
          index,
          preventComplete: true,
          output: loopOutput,
          state: 'iteration.next',
        });

        broker.publish('execution', 'execute.start', {...content, ignoreIfExecuting});
        return content;
      }

      function onCompleteMessage(_, message) {
        const {content} = message;

        if (content.isRootScope) return;
        if (!content.isMultiInstance) return;

        if (content.output !== undefined) loopOutput[content.index] = content.output;

        broker.publish('execution', 'execute.iteration.completed', {
          ...message.content,
          ...executeMessage.content,
          preventComplete: true,
          output: loopOutput,
          state: 'iteration.completed',
        });

        if (completionCondition && environment.resolveExpression(completionCondition, message)) {
          debug(`<${startIterationContent.executionId} (${id})> complete condition met`);
        } else if (startNext(content.index + 1)) return;

        debug(`<${startIterationContent.executionId} (${id})> sequential loop completed`);

        broker.cancel(consumerTag);
        broker.cancel(apiConsumerTag);
        return broker.publish('execution', 'execute.completed', {
          ...message.content,
          ...executeMessage.content,
          output: loopOutput,
        });
      }
    }

    function executeParallel() {
      if (isRootScope) {
        broker.subscribeOnce('api', `activity.stop.${parentExecutionId}`, stop, {consumerTag: apiConsumerTag});
        broker.subscribeTmp('execution', 'execute.completed', onCompleteMessage, {noAck: true, consumerTag, priority: 200});
        if (isRedelivered) return;
      }

      let index = 0, startContent;
      while ((startContent = next(index))) {
        debug(`<${startContent.executionId} (${id})> start parallel iteration index ${index}`);
        broker.publish('execution', 'execute.start', {...startContent, keep: true});
        index++;
      }

      function onCompleteMessage(_, message) {
        const {content} = message;
        if (content.isRootScope) return broker.cancel(consumerTag);
        if (!content.isMultiInstance) return;

        if (content.output !== undefined) loopOutput[content.index] = content.output;

        broker.publish('execution', 'execute.iteration.completed', {
          ...content,
          ...executeMessage.content,
          index: content.index,
          output: loopOutput,
          state: 'iteration.completed',
        });

        if (environment.resolveExpression(completionCondition, message)) {
          stop();

          return broker.publish('execution', 'execute.completed', {
            ...content,
            ...startIterationContent,
            output: loopOutput,
          });
        }
      }
    }

    function next(index) {
      const executionId = `${parentExecutionId}_${index}`;
      const content = {
        ...startIterationContent,
        isRootScope: undefined,
        executionId,
        isMultiInstance: true,
        index,
        parent,
      };

      if (isComplete(content)) return;

      if (collection) {
        content[elementVariable] = collection[index];
      }

      return content;

      function isComplete() {
        if (cardinality > 0 && index >= cardinality) return true;
        if (collection && index >= collection.length) return true;
      }
    }

    function getCardinality() {
      if (!loopCardinality) return;
      let value = loopCardinality;
      if (!value) return;

      value = environment.resolveExpression(value, executeMessage);

      const nValue = Number(value);
      if (isNaN(nValue)) return nValue;

      return nValue;
    }

    function getCollection() {
      if (!collectionExpression) return;
      debug(`<${id}> has collection`);
      return environment.resolveExpression(collectionExpression, executeMessage);
    }
  }

  function stop() {
    debug(`<${id}> stop loop`);
    broker.cancel(consumerTag);
    broker.cancel(apiConsumerTag);
  }
}

