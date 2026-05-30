import { RunError } from '../error/Errors.js';
import { cloneContent, cloneMessage, unshiftParent, cloneParent } from '../messageHelper.js';

/**
 * Loop characteristics
 * @param {import('#types').Activity} activity
 * @param {import('moddle-context-serializer').SerializableElement} loopCharacteristics
 */
export function LoopCharacteristics(activity, loopCharacteristics) {
  this.activity = activity;
  this.loopCharacteristics = loopCharacteristics;
  const { type = 'LoopCharacteristics', behaviour = {} } = loopCharacteristics;
  this.type = type;
  const { isSequential = false, collection } = behaviour;
  /** @type {boolean} */
  this.isSequential = isSequential;
  /** @type {string | undefined} */
  this.collection = collection;

  let completionCondition, startCondition, loopCardinality;
  if ('loopCardinality' in behaviour) loopCardinality = behaviour.loopCardinality;
  else if ('loopMaximum' in behaviour) loopCardinality = behaviour.loopMaximum;
  /** @type {number | undefined} */
  this.loopCardinality = loopCardinality;

  if (behaviour.loopCondition) {
    if (behaviour.testBefore) startCondition = behaviour.loopCondition;
    else completionCondition = behaviour.loopCondition;
  }
  if (behaviour.completionCondition) {
    completionCondition = behaviour.completionCondition;
  }

  if (collection) {
    this.loopType = 'collection';
    /** @type {string | undefined} */
    this.elementVariable = behaviour.elementVariable || 'item';
  } else if (completionCondition) this.loopType = 'complete condition';
  else if (startCondition) this.loopType = 'start condition';
  else if (loopCardinality) this.loopType = 'cardinality';

  /** @type {Characteristics} */
  this.characteristics = null;
  this.execution = null;
}

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
LoopCharacteristics.prototype.execute = function execute(executeMessage) {
  if (!executeMessage) throw new TypeError('LoopCharacteristics execution requires message');
  const chr = (this.characteristics = this.characteristics || new Characteristics(this.activity, this.loopCharacteristics, executeMessage));
  if (chr.cardinality === 0) return chr.complete();

  const execution = this.isSequential
    ? new SequentialLoopCharacteristics(this.activity, chr)
    : new ParallelLoopCharacteristics(this.activity, chr);
  return execution.execute(executeMessage);
};

/**
 * @param {import('#types').Activity} activity
 * @param {Characteristics} characteristics
 */
function SequentialLoopCharacteristics(activity, characteristics) {
  this.activity = activity;
  this.id = activity.id;
  this.characteristics = characteristics;
}

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
SequentialLoopCharacteristics.prototype.execute = function execute(executeMessage) {
  const { routingKey: executeRoutingKey, redelivered: isRedelivered } = executeMessage.fields || {};
  const chr = this.characteristics;
  if (!chr.cardinality && !chr.startCondition && !chr.completionCondition) {
    throw new RunError(`<${this.id}> cardinality, collection, or condition is required in sequential loops`, executeMessage);
  }

  let startIndex = 0;
  if (isRedelivered && executeRoutingKey === 'execute.iteration.next') {
    startIndex = executeMessage.content.index;
  }
  chr.subscribe(this._onCompleteMessage.bind(this));

  return this._startNext(startIndex, isRedelivered);
};

SequentialLoopCharacteristics.prototype._startNext = function startNext(index, ignoreIfExecuting) {
  const chr = this.characteristics;
  const content = chr.next(index);
  if (!content) return;

  if (chr.isStartConditionMet({ content })) {
    chr._debug('start condition met');
    return;
  }

  chr._debug(`${ignoreIfExecuting ? 'resume' : 'start'} sequential iteration index ${content.index}`);
  const broker = this.activity.broker;
  broker.publish('execution', 'execute.iteration.next', {
    ...content,
    ...chr.getContent(),
    index,
    preventComplete: true,
    output: chr.output.slice(),
    state: 'iteration.next',
  });

  broker.publish('execution', 'execute.start', { ...content, ignoreIfExecuting });
  return content;
};

SequentialLoopCharacteristics.prototype._onCompleteMessage = function onCompleteMessage(_, message) {
  const { content } = message;
  const chr = this.characteristics;
  const loopOutput = chr.output;

  if (content.output !== undefined) loopOutput[content.index] = content.output;

  this.activity.broker.publish('execution', 'execute.iteration.completed', {
    ...message.content,
    ...chr.getContent(),
    preventComplete: true,
    output: loopOutput.slice(),
    state: 'iteration.completed',
  });

  if (chr.isCompletionConditionMet(message, loopOutput)) {
    chr._debug('complete condition met');
  } else if (this._startNext(content.index + 1)) return;

  chr._debug('sequential loop completed');

  return chr.complete(content);
};

/**
 * @param {import('#types').Activity} activity
 * @param {Characteristics} characteristics
 */
function ParallelLoopCharacteristics(activity, characteristics) {
  this.activity = activity;
  this.id = activity.id;
  this.characteristics = characteristics;
  this.running = 0;
  this.index = 0;
  this.discarded = 0;
}

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
ParallelLoopCharacteristics.prototype.execute = function execute(executeMessage) {
  const chr = this.characteristics;
  if (!chr.cardinality) throw new RunError(`<${this.id}> cardinality or collection is required in parallel loops`, executeMessage);

  const isRedelivered = executeMessage.fields.redelivered;
  if (isRedelivered) {
    const { index, running, discarded } = executeMessage.content;
    if (!isNaN(index)) this.index = index;
    if (!isNaN(running)) this.running = running;
    if (!isNaN(discarded)) this.discarded = discarded;
  }
  chr.subscribe(this._onCompleteMessage.bind(this));

  if (isRedelivered) return;

  return this._startBatch();
};

ParallelLoopCharacteristics.prototype._startBatch = function startBatch() {
  const chr = this.characteristics;
  const cardinality = chr.cardinality;
  const batch = new Set();

  let startContent = chr.next(this.index);
  do {
    chr._debug(`start parallel iteration index ${this.index}`);
    batch.add(startContent);
    this.running++;
    this.index++;

    if (this.index >= cardinality || this.running >= chr.batchSize) {
      break;
    }
  } while ((startContent = chr.next(this.index)));

  const broker = this.activity.broker;
  broker.publish('execution', 'execute.iteration.batch', {
    ...chr.getContent(),
    index: this.index,
    running: this.running,
    discarded: this.discarded,
    output: chr.output,
    preventComplete: true,
  });

  for (const content of batch) {
    broker.publish('execution', 'execute.start', content);
  }
};

ParallelLoopCharacteristics.prototype._onCompleteMessage = function onCompleteMessage(routingKey, message) {
  const chr = this.characteristics;
  const { content } = message;
  if (content.output !== undefined) chr.output[content.index] = content.output;

  if (routingKey === 'execute.discard') {
    this.discarded++;
  }

  this.running--;

  this.activity.broker.publish('execution', 'execute.iteration.completed', {
    ...content,
    ...chr.getContent(),
    index: this.index,
    running: this.running,
    discarded: this.discarded,
    output: chr.output,
    state: 'iteration.completed',
    preventComplete: true,
  });

  if (this.running <= 0 && !chr.next(this.index)) {
    return chr.complete(content, this.discarded === this.index);
  }

  if (chr.isCompletionConditionMet(message)) {
    return chr.complete(content, this.discarded === this.index);
  }

  if (this.running <= 0) {
    this.running = 0;
    this._startBatch();
  }
};

/**
 * Per-execution snapshot of resolved loop characteristics (cardinality, collection, conditions).
 * @param {import('#types').Activity} activity
 * @param {import('moddle-context-serializer').SerializableElement} loopCharacteristics
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
function Characteristics(activity, loopCharacteristics, executeMessage) {
  this.activity = activity;
  const behaviour = (this.behaviour = loopCharacteristics.behaviour || {});
  this.message = executeMessage;

  const type = (this.type = loopCharacteristics.type || 'LoopCharacteristics');
  this.id = activity.id;
  this.broker = activity.broker;
  this.parentExecutionId = executeMessage.content.executionId;

  /** @type {boolean} */
  this.isSequential = behaviour.isSequential || false;
  this.output = executeMessage.content.output || [];
  this.parent = unshiftParent(executeMessage.content.parent, executeMessage.content);

  if ('loopCardinality' in behaviour) this.loopCardinality = /** @type {number} */ (behaviour.loopCardinality);
  else if ('loopMaximum' in behaviour) this.loopCardinality = /** @type {number} */ (behaviour.loopMaximum);

  if (behaviour.loopCondition) {
    if (behaviour.testBefore) this.startCondition = /** @type {string} */ (behaviour.loopCondition);
    else this.completionCondition = /** @type {string} */ (behaviour.loopCondition);
  }
  if (behaviour.completionCondition) {
    /** @type {string} */
    this.completionCondition = behaviour.completionCondition;
  }

  const collection = (this.collection = this.getCollection());
  if (collection) {
    /** @type {string} */
    this.elementVariable = behaviour.elementVariable || 'item';
  }
  this.cardinality = this.getCardinality(collection);

  /** @private */
  this.onApiMessage = this.onApiMessage.bind(this);

  const environment = activity.environment;
  this.logger = environment.Logger(type.toLowerCase());
  this.batchSize = environment.settings.batchSize || 50;
}

/** @returns {import('#types').ElementMessageContent} */
Characteristics.prototype.getContent = function getContent() {
  return {
    ...cloneContent(this.message.content),
    loopCardinality: this.cardinality,
    isSequential: this.isSequential,
    output: undefined,
  };
};

/**
 * @param {number} index
 * @returns {import('#types').ElementMessageContent}
 */
Characteristics.prototype.next = function next(index) {
  const cardinality = this.cardinality;
  if (cardinality > 0 && index >= cardinality) return;

  const collection = this.collection;
  if (collection && index >= collection.length) return;

  const content = {
    ...this.getContent(),
    isRootScope: undefined,
    executionId: `${this.parentExecutionId}_${index}`,
    isMultiInstance: true,
    parent: cloneParent(this.parent),
    index,
  };

  if (collection) {
    content[this.elementVariable] = collection[index];
  }

  return content;
};

/**
 * @param {any} [collection]
 * @returns {number | undefined} cardinality
 */
Characteristics.prototype.getCardinality = function getCardinality(collection) {
  const collectionLen = this.collection && Array.isArray(collection) ? collection.length : undefined;
  if (!this.loopCardinality) {
    return collectionLen;
  }
  const value = this.activity.environment.resolveExpression(this.loopCardinality, this.message);
  if ((value !== undefined && isNaN(value)) || value < 0) {
    throw new RunError(`<${this.id}> invalid loop cardinality >${value}<`, this.message);
  }
  if (value === undefined) return collectionLen;
  return Number(value);
};

/** @returns {Array | undefined} */
Characteristics.prototype.getCollection = function getCollection() {
  const collectionExpression = this.behaviour.collection;
  if (!collectionExpression) return;
  return this.activity.environment.resolveExpression(collectionExpression, this.message);
};

/**
 * @param {import('#types').ElementBrokerMessage} message
 */
Characteristics.prototype.isStartConditionMet = function isStartConditionMet(message) {
  if (!this.startCondition) return false;
  return this.activity.environment.resolveExpression(this.startCondition, cloneMessage(message));
};

/**
 * @param {import('#types').ElementBrokerMessage} message
 */
Characteristics.prototype.isCompletionConditionMet = function isCompletionConditionMet(message) {
  if (!this.completionCondition) return false;
  return this.activity.environment.resolveExpression(this.completionCondition, cloneMessage(message, { loopOutput: this.output }));
};

/**
 * @param {import('#types').ElementMessageContent} content
 * @param {boolean} [allDiscarded]
 * @returns {void}
 */
Characteristics.prototype.complete = function complete(content, allDiscarded) {
  this.stop();

  return this.broker.publish('execution', 'execute.' + (allDiscarded ? 'discard' : 'completed'), {
    ...content,
    ...this.getContent(),
    output: this.output,
  });
};

/**
 * @param {import('#types').ElementBrokerMessage} onIterationCompleteMessage
 */
Characteristics.prototype.subscribe = function subscribe(onIterationCompleteMessage) {
  this.broker.subscribeTmp(
    'api',
    `activity.*.${this.parentExecutionId}`,
    this.onApiMessage,
    { noAck: true, consumerTag: '_api-multi-instance-tag' },
    { priority: 400 }
  );
  this.broker.subscribeTmp('execution', 'execute.*', onComplete, {
    noAck: true,
    consumerTag: '_execute-q-multi-instance-tag',
    priority: 300,
  });

  function onComplete(routingKey, message, ...args) {
    if (!message.content.isMultiInstance) return;

    switch (routingKey) {
      case 'execute.discard':
      case 'execute.cancel':
      case 'execute.completed':
        return onIterationCompleteMessage(routingKey, message, ...args);
    }
  }
};

/** @internal */
Characteristics.prototype.onApiMessage = function onApiMessage(_, message) {
  switch (message.properties.type) {
    case 'stop':
    case 'discard':
      this.stop();
      break;
  }
};

Characteristics.prototype.stop = function stop() {
  this.broker.cancel('_execute-q-multi-instance-tag');
  this.broker.cancel('_api-multi-instance-tag');
};

/** @internal */
Characteristics.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.parentExecutionId} (${this.id})> ${msg}`);
};
