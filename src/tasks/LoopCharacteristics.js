import {ActivityError} from '../error/Errors';
import {cloneContent, cloneMessage, unshiftParent} from '../messageHelper';

export default function LoopCharacteristics(activity, loopCharacteristics) {
  const {id, broker, environment} = activity;
  const {batchSize = 50} = environment.settings;
  const {type = 'LoopCharacteristics', behaviour = {}} = loopCharacteristics;
  const {isSequential = false, collection: collectionExpression, elementVariable = 'item'} = behaviour;

  let completionCondition, startCondition, loopCardinality;
  if ('loopCardinality' in behaviour) loopCardinality = behaviour.loopCardinality;
  else if ('loopMaximum' in behaviour) loopCardinality = behaviour.loopMaximum;

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
    if (!getCharacteristics()) return;

    try {
      return isSequential ? executeSequential() : executeParallel();
    } catch (err) {
      return activity.emitFatal(new ActivityError(err.message, executeMessage, err), executeMessage.content);
    }

    function executeSequential() {
      const {cardinality, getContent: getStartContent} = getCharacteristics();
      if (cardinality === 0) return complete();
      if (!cardinality && !startCondition && !completionCondition) return activity.emitFatal(new ActivityError(`<${id}> cardinality, collection, or condition is required in sequential loops`, executeMessage), getStartContent());

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

        return complete(content);
      }

      function complete(content) {
        stop();

        const {getContent, output} = getCharacteristics();

        return broker.publish('execution', 'execute.completed', {
          ...content,
          ...getContent(),
          output,
        });
      }
    }

    function executeParallel() {
      const {cardinality, getContent: getStartContent} = getCharacteristics();

      if (cardinality === 0) return complete();
      if (!cardinality) return activity.emitFatal(new ActivityError(`<${id}> cardinality or collection is required in parallel loops`, executeMessage), getStartContent());

      let index = 0, running = 0;
      if (isRedelivered) {
        if (!isNaN(executeMessage.content.index)) index = executeMessage.content.index;
        if (!isNaN(executeMessage.content.running)) running = executeMessage.content.running;
      }
      subscribe(onCompleteMessage);

      if (isRedelivered) return;

      return startBatch();

      function startBatch() {
        const {output: loopOutput, getContent} = getCharacteristics();
        const batch = [];

        let startContent = next(index);
        do {
          debug(`<${parentExecutionId} (${id})> start parallel iteration index ${index}`);
          batch.push(startContent);
          running++;
          index++;

          if (index >= cardinality || running >= batchSize) {
            break;
          }
        } while ((startContent = next(index)));

        broker.publish('execution', 'execute.iteration.batch', {
          ...getContent(),
          index,
          running,
          output: loopOutput,
          preventComplete: true,
        });

        for (const content of batch) {
          broker.publish('execution', 'execute.start', content);
        }
      }

      function onCompleteMessage(_, message) {
        const {content} = message;
        const {output: loopOutput} = getCharacteristics();
        if (content.output !== undefined) loopOutput[content.index] = content.output;

        running--;

        broker.publish('execution', 'execute.iteration.completed', {
          ...content,
          ...getCharacteristics().getContent(),
          index,
          running,
          output: loopOutput,
          state: 'iteration.completed',
          preventComplete: true,
        });

        if (running <= 0 && !next(index)) {
          return complete(content);
        }

        if (isConditionMet(completionCondition, message)) {
          return complete(content);
        }

        if (running <= 0) {
          running = 0;
          startBatch();
        }
      }

      function complete(content) {
        stop();

        const {getContent, output} = getCharacteristics();

        return broker.publish('execution', 'execute.completed', {
          ...content,
          ...getContent(),
          output,
        });
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

      const collection = getCollection();
      const cardinality = getCardinality(collection);

      const messageContent = {
        ...cloneContent(executeMessage.content),
        loopCardinality: cardinality,
        isSequential,
        output: undefined,
      };

      if (cardinality !== undefined && isNaN(cardinality) || cardinality < 0) {
        return activity.emitFatal(new ActivityError(`<${id}> invalid loop cardinality >${cardinality}<`, executeMessage), messageContent);
      }

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

    function getCardinality(collection) {
      const collectionLen = Array.isArray(collection) ? collection.length : undefined;
      if (!loopCardinality) {
        return collectionLen;
      }
      const value = environment.resolveExpression(loopCardinality, executeMessage);
      if (value === undefined) return collectionLen;
      return Number(value);
    }

    function getCollection() {
      if (!collectionExpression) return;
      debug(`<${id}> has collection`);
      return environment.resolveExpression(collectionExpression, executeMessage);
    }

    function subscribe(onIterationCompleteMessage) {
      broker.subscribeTmp('api', `activity.*.${parentExecutionId}`, onApiMessage, {noAck: true, consumerTag: apiConsumerTag}, {priority: 400});
      broker.subscribeTmp('execution', 'execute.*', onComplete, {noAck: true, consumerTag: executeConsumerTag, priority: 300});

      function onComplete(routingKey, message, ...args) {
        if (!message.content.isMultiInstance) return;
        switch (routingKey) {
          case 'execute.cancel':
          case 'execute.completed':
            return onIterationCompleteMessage(routingKey, message, ...args);
        }
      }
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
    const testContext = cloneMessage(message, {loopOutput});
    return environment.resolveExpression(condition, testContext);
  }
}

