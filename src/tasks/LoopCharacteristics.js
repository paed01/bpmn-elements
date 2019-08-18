import {ActivityError} from '../error/Errors';
import {cloneContent, cloneMessage, unshiftParent} from '../messageHelper';

export default function LoopCharacteristics(activity, loopCharacteristics) {
  const {id, broker, environment} = activity;
  const {type = 'LoopCharacteristics', behaviour = {}} = loopCharacteristics;
  const {isSequential = false, collection: collectionExpression, elementVariable = 'item'} = behaviour;

  let completionCondition, startCondition, loopCardinality;
  if ('loopCardinality' in behaviour) loopCardinality = behaviour.loopCardinality;
  if ('loopMaximum' in behaviour) loopCardinality = behaviour.loopMaximum;

  if (behaviour.loopCondition) {
    if (behaviour.testBefore) startCondition = behaviour.loopCondition;
    else completionCondition = behaviour.loopCondition;
  }
  if (behaviour.completionCondition) {
    completionCondition = behaviour.completionCondition;
  }

  const loopType = getLoopType();

  if (!loopType) return;

  const {debug} = environment.Logger(type.toLowerCase());
  const executeConsumerTag = '_execute-q-multi-instance-tag';
  broker.cancel(executeConsumerTag);

  const apiConsumerTag = '_api-multi-instance-tag';
  broker.cancel(apiConsumerTag);

  let loopSettings;

  const characteristicsApi = {
    type,
    loopType,
    collection: collectionExpression,
    elementVariable,
    isSequential,
    loopCardinality,
    execute,
  };

  return characteristicsApi;

  function getLoopType() {
    if (collectionExpression) return 'collection';
    if (completionCondition) return 'complete condition';
    if (startCondition) return 'start condition';
    if (loopCardinality) return 'cardinality';
  }

  function execute(executeMessage) {
    if (!executeMessage) throw new Error('LoopCharacteristics execution requires message');
    const {routingKey: executeRoutingKey, redelivered: isRedelivered} = executeMessage.fields || {};
    const {executionId: parentExecutionId} = executeMessage.content;
    getCharacteristics();

    return isSequential ? executeSequential() : executeParallel();

    function executeSequential() {
      let startIndex = 0;

      if (isRedelivered && executeRoutingKey === 'execute.iteration.next') {
        startIndex = executeMessage.content.index;
      }
      subscribe(onCompleteMessage);

      return startNext(startIndex, isRedelivered);

      function startNext(index, ignoreIfExecuting) {
        const content = next(index);
        if (!content) return;

        const characteristics = getCharacteristics();
        if (startCondition && isConditionMet(startCondition, {content})) {
          debug(`<${parentExecutionId} (${id})> start condition met`);
          return;
        }

        debug(`<${content.executionId} (${id})>`, ignoreIfExecuting ? 'resume' : 'start', `sequential iteration index ${content.index}`);
        broker.publish('execution', 'execute.iteration.next', {
          ...content,
          ...characteristics.getContent(),
          index,
          preventComplete: true,
          output: characteristics.output.slice(),
          state: 'iteration.next',
        });

        broker.publish('execution', 'execute.start', {...content, ignoreIfExecuting});
        return content;
      }

      function onCompleteMessage(_, message) {
        const {content} = message;

        if (content.isRootScope) return;
        if (!content.isMultiInstance) return;

        const loopOutput = getCharacteristics().output;
        if (content.output !== undefined) loopOutput[content.index] = content.output;

        broker.publish('execution', 'execute.iteration.completed', {
          ...message.content,
          ...getCharacteristics().getContent(),
          preventComplete: true,
          output: loopOutput.slice(),
          state: 'iteration.completed',
        });

        if (isConditionMet(completionCondition, message, loopOutput)) {
          debug(`<${parentExecutionId} (${id})> complete condition met`);
        } else if (startNext(content.index + 1)) return;

        debug(`<${parentExecutionId} (${id})> sequential loop completed`);

        stop();
        return broker.publish('execution', 'execute.completed', {
          ...message.content,
          ...getCharacteristics().getContent(),
          output: loopOutput,
        });
      }
    }

    function executeParallel() {
      subscribe(onCompleteMessage);
      if (isRedelivered) return;

      let index = 0, startContent;
      while ((startContent = next(index))) {
        debug(`<${parentExecutionId} (${id})> start parallel iteration index ${index}`);
        broker.publish('execution', 'execute.start', {...startContent, keep: true});
        index++;
      }

      function onCompleteMessage(_, message) {
        const {content} = message;
        if (content.isRootScope) return broker.cancel(executeConsumerTag);
        if (!content.isMultiInstance) return;

        const loopOutput = getCharacteristics().output;
        if (content.output !== undefined) loopOutput[content.index] = content.output;

        broker.publish('execution', 'execute.iteration.completed', {
          ...content,
          ...getCharacteristics().getContent(),
          index: content.index,
          output: loopOutput,
          state: 'iteration.completed',
        });

        if (isConditionMet(completionCondition, message)) {
          stop();

          return broker.publish('execution', 'execute.completed', {
            ...content,
            ...getCharacteristics().getContent(),
            output: getCharacteristics().output,
          });
        }
      }
    }

    function next(index) {
      const executionId = `${parentExecutionId}_${index}`;

      const {cardinality, collection, parent, getContent} = getCharacteristics();
      const content = {
        ...getContent(),
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

    function getCharacteristics() {
      if (loopSettings) return loopSettings;

      const cardinality = getCardinality();
      const collection = getCollection();

      const messageContent = {
        ...cloneContent(executeMessage.content),
        loopCardinality: cardinality,
        isSequential,
        output: undefined,
      };

      const output = executeMessage.content.output || [];

      const parent = unshiftParent(executeMessage.content.parent, executeMessage.content);

      loopSettings = {
        cardinality,
        collection,
        messageContent,
        output,
        parent,
        getContent() {
          return cloneContent(messageContent);
        },
      };

      return loopSettings;
    }

    function getCardinality() {
      if (!loopCardinality) return;
      let value = loopCardinality;
      if (!value) return;

      value = environment.resolveExpression(value, executeMessage);

      const nValue = Number(value);
      if (isNaN(nValue)) return activity.emitFatal(new ActivityError(`<${id}> loopCardinality is not a Number >${value}<`, executeMessage));

      return nValue;
    }

    function getCollection() {
      if (!collectionExpression) return;
      debug(`<${id}> has collection`);
      return environment.resolveExpression(collectionExpression, executeMessage);
    }

    function subscribe(onCompleteMessage) {
      broker.subscribeOnce('api', `activity.*.${parentExecutionId}`, onApiMessage, {consumerTag: apiConsumerTag}, {priority: 400});
      broker.subscribeTmp('execution', 'execute.completed', onCompleteMessage, {noAck: true, consumerTag: executeConsumerTag, priority: 300});
    }
  }

  function onApiMessage(_, message) {
    switch (message.properties.type) {
      case 'stop':
      case 'discard':
        stop();
        break;
    }
  }

  function stop() {
    broker.cancel(executeConsumerTag);
    broker.cancel(apiConsumerTag);
  }


  function isConditionMet(condition, message, loopOutput) {
    if (!condition) return false;
    const testContext = {...cloneMessage(message), loopOutput};
    return environment.resolveExpression(condition, testContext);
  }
}

