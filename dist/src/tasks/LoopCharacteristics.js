"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _Errors = require("../error/Errors");

var _messageHelper = require("../messageHelper");

var _default = LoopCharacteristics;
exports.default = _default;

function LoopCharacteristics(activity, loopCharacteristics) {
  if (!(this instanceof LoopCharacteristics)) return new LoopCharacteristics(activity, loopCharacteristics);
  this.activity = activity;
  this.loopCharacteristics = loopCharacteristics;
  const {
    type = 'LoopCharacteristics',
    behaviour = {}
  } = loopCharacteristics;
  this.type = type;
  const {
    isSequential = false,
    collection
  } = behaviour;
  this.isSequential = isSequential;
  this.collection = collection;
  let completionCondition, startCondition, loopCardinality;
  if ('loopCardinality' in behaviour) loopCardinality = behaviour.loopCardinality;else if ('loopMaximum' in behaviour) loopCardinality = behaviour.loopMaximum;
  this.loopCardinality = loopCardinality;

  if (behaviour.loopCondition) {
    if (behaviour.testBefore) startCondition = behaviour.loopCondition;else completionCondition = behaviour.loopCondition;
  }

  if (behaviour.completionCondition) {
    completionCondition = behaviour.completionCondition;
  }

  if (collection) {
    this.loopType = 'collection';
    this.elementVariable = behaviour.elementVariable || 'item';
  } else if (completionCondition) this.loopType = 'complete condition';else if (startCondition) this.loopType = 'start condition';else if (loopCardinality) this.loopType = 'cardinality';

  this.characteristics = null;
  this.execution = null;
}

LoopCharacteristics.prototype.execute = function execute(executeMessage) {
  if (!executeMessage) throw new TypeError('LoopCharacteristics execution requires message');
  const chr = this.characteristics = this.characteristics || new Characteristics(this.activity, this.loopCharacteristics, executeMessage);
  if (chr.cardinality === 0) return chr.complete();
  const execution = this.isSequential ? new SequentialLoopCharacteristics(this.activity, chr) : new ParallelLoopCharacteristics(this.activity, chr);
  return execution.execute(executeMessage);
};

function SequentialLoopCharacteristics(activity, characteristics) {
  this.activity = activity;
  this.id = activity.id;
  this.characteristics = characteristics;
}

SequentialLoopCharacteristics.prototype.execute = function execute(executeMessage) {
  const {
    routingKey: executeRoutingKey,
    redelivered: isRedelivered
  } = executeMessage.fields || {};
  const chr = this.characteristics;

  if (!chr.cardinality && !chr.startCondition && !chr.completionCondition) {
    throw new _Errors.RunError(`<${this.id}> cardinality, collection, or condition is required in sequential loops`, executeMessage);
  }

  let startIndex = 0;

  if (isRedelivered && executeRoutingKey === 'execute.iteration.next') {
    startIndex = executeMessage.content.index;
  }

  chr.subscribe(this.onCompleteMessage.bind(this));
  return this.startNext(startIndex, isRedelivered);
};

SequentialLoopCharacteristics.prototype.startNext = function startNext(index, ignoreIfExecuting) {
  const chr = this.characteristics;
  const content = chr.next(index);
  if (!content) return;

  if (chr.isStartConditionMet({
    content
  })) {
    chr.debug('start condition met');
    return;
  }

  chr.debug(`${ignoreIfExecuting ? 'resume' : 'start'} sequential iteration index ${content.index}`);
  const broker = this.activity.broker;
  broker.publish('execution', 'execute.iteration.next', { ...content,
    ...chr.getContent(),
    index,
    preventComplete: true,
    output: chr.output.slice(),
    state: 'iteration.next'
  });
  broker.publish('execution', 'execute.start', { ...content,
    ignoreIfExecuting
  });
  return content;
};

SequentialLoopCharacteristics.prototype.onCompleteMessage = function onCompleteMessage(_, message) {
  const {
    content
  } = message;
  const chr = this.characteristics;
  const loopOutput = chr.output;
  if (content.output !== undefined) loopOutput[content.index] = content.output;
  this.activity.broker.publish('execution', 'execute.iteration.completed', { ...message.content,
    ...chr.getContent(),
    preventComplete: true,
    output: loopOutput.slice(),
    state: 'iteration.completed'
  });

  if (chr.isCompletionConditionMet(message, loopOutput)) {
    chr.debug('complete condition met');
  } else if (this.startNext(content.index + 1)) return;

  chr.debug('sequential loop completed');
  return chr.complete(content);
};

function ParallelLoopCharacteristics(activity, characteristics) {
  this.activity = activity;
  this.id = activity.id;
  this.characteristics = characteristics;
  this.running = 0;
  this.index = 0;
}

ParallelLoopCharacteristics.prototype.execute = function execute(executeMessage) {
  const chr = this.characteristics;
  if (!chr.cardinality) throw new _Errors.RunError(`<${this.id}> cardinality or collection is required in parallel loops`, executeMessage);
  const isRedelivered = executeMessage.fields.redelivered;

  if (isRedelivered) {
    if (!isNaN(executeMessage.content.index)) this.index = executeMessage.content.index;
    if (!isNaN(executeMessage.content.running)) this.running = executeMessage.content.running;
  }

  chr.subscribe(this.onCompleteMessage.bind(this));
  if (isRedelivered) return;
  return this.startBatch();
};

ParallelLoopCharacteristics.prototype.startBatch = function startBatch() {
  const chr = this.characteristics;
  const cardinality = chr.cardinality;
  const batch = [];
  let startContent = chr.next(this.index);

  do {
    chr.debug(`start parallel iteration index ${this.index}`);
    batch.push(startContent);
    this.running++;
    this.index++;

    if (this.index >= cardinality || this.running >= chr.batchSize) {
      break;
    }
  } while (startContent = chr.next(this.index));

  const broker = this.activity.broker;
  broker.publish('execution', 'execute.iteration.batch', { ...chr.getContent(),
    index: this.index,
    running: this.running,
    output: chr.output,
    preventComplete: true
  });

  for (const content of batch) {
    broker.publish('execution', 'execute.start', content);
  }
};

ParallelLoopCharacteristics.prototype.onCompleteMessage = function onCompleteMessage(_, message) {
  const chr = this.characteristics;
  const {
    content
  } = message;
  if (content.output !== undefined) chr.output[content.index] = content.output;
  this.running--;
  this.activity.broker.publish('execution', 'execute.iteration.completed', { ...content,
    ...chr.getContent(),
    index: this.index,
    running: this.running,
    output: chr.output,
    state: 'iteration.completed',
    preventComplete: true
  });

  if (this.running <= 0 && !chr.next(this.index)) {
    return chr.complete(content);
  }

  if (chr.isCompletionConditionMet(message)) {
    return chr.complete(content);
  }

  if (this.running <= 0) {
    this.running = 0;
    this.startBatch();
  }
};

function Characteristics(activity, loopCharacteristics, executeMessage) {
  this.activity = activity;
  const behaviour = this.behaviour = loopCharacteristics.behaviour || {};
  this.message = executeMessage;
  const type = this.type = loopCharacteristics.type || 'LoopCharacteristics';
  this.id = activity.id;
  this.broker = activity.broker;
  this.parentExecutionId = executeMessage.content.executionId;
  this.isSequential = behaviour.isSequential || false;
  this.output = executeMessage.content.output || [];
  this.parent = (0, _messageHelper.unshiftParent)(executeMessage.content.parent, executeMessage.content);
  if ('loopCardinality' in behaviour) this.loopCardinality = behaviour.loopCardinality;else if ('loopMaximum' in behaviour) this.loopCardinality = behaviour.loopMaximum;

  if (behaviour.loopCondition) {
    if (behaviour.testBefore) this.startCondition = behaviour.loopCondition;else this.completionCondition = behaviour.loopCondition;
  }

  if (behaviour.completionCondition) {
    this.completionCondition = behaviour.completionCondition;
  }

  const collection = this.collection = this.getCollection();

  if (collection) {
    this.elementVariable = behaviour.elementVariable || 'item';
  }

  this.cardinality = this.getCardinality(collection);
  this.onApiMessage = this.onApiMessage.bind(this);
  const environment = activity.environment;
  this.logger = environment.Logger(type.toLowerCase());
  this.batchSize = environment.settings.batchSize || 50;
}

Characteristics.prototype.getContent = function getContent() {
  return { ...(0, _messageHelper.cloneContent)(this.message.content),
    loopCardinality: this.cardinality,
    isSequential: this.isSequential,
    output: undefined
  };
};

Characteristics.prototype.next = function next(index) {
  const cardinality = this.cardinality;
  if (cardinality > 0 && index >= cardinality) return;
  const collection = this.collection;
  if (collection && index >= collection.length) return;
  const content = { ...this.getContent(),
    isRootScope: undefined,
    executionId: `${this.parentExecutionId}_${index}`,
    isMultiInstance: true,
    parent: (0, _messageHelper.cloneParent)(this.parent),
    index
  };

  if (collection) {
    content[this.elementVariable] = collection[index];
  }

  return content;
};

Characteristics.prototype.getCardinality = function getCardinality(collection) {
  const collectionLen = this.collection && Array.isArray(collection) ? collection.length : undefined;

  if (!this.loopCardinality) {
    return collectionLen;
  }

  const value = this.activity.environment.resolveExpression(this.loopCardinality, this.message);

  if (value !== undefined && isNaN(value) || value < 0) {
    throw new _Errors.RunError(`<${this.id}> invalid loop cardinality >${value}<`, this.message);
  }

  if (value === undefined) return collectionLen;
  return Number(value);
};

Characteristics.prototype.getCollection = function getCollection() {
  const collectionExpression = this.behaviour.collection;
  if (!collectionExpression) return;
  return this.activity.environment.resolveExpression(collectionExpression, this.message);
};

Characteristics.prototype.isStartConditionMet = function isStartConditionMet(message) {
  if (!this.startCondition) return false;
  return this.activity.environment.resolveExpression(this.startCondition, (0, _messageHelper.cloneMessage)(message));
};

Characteristics.prototype.isCompletionConditionMet = function isCompletionConditionMet(message) {
  if (!this.completionCondition) return false;
  return this.activity.environment.resolveExpression(this.completionCondition, (0, _messageHelper.cloneMessage)(message, {
    loopOutput: this.output
  }));
};

Characteristics.prototype.complete = function complete(content) {
  this.stop();
  return this.broker.publish('execution', 'execute.completed', { ...content,
    ...this.getContent(),
    output: this.output
  });
};

Characteristics.prototype.subscribe = function subscribe(onIterationCompleteMessage) {
  this.broker.subscribeTmp('api', `activity.*.${this.parentExecutionId}`, this.onApiMessage, {
    noAck: true,
    consumerTag: '_api-multi-instance-tag'
  }, {
    priority: 400
  });
  this.broker.subscribeTmp('execution', 'execute.*', onComplete, {
    noAck: true,
    consumerTag: '_execute-q-multi-instance-tag',
    priority: 300
  });

  function onComplete(routingKey, message, ...args) {
    if (!message.content.isMultiInstance) return;

    switch (routingKey) {
      case 'execute.cancel':
      case 'execute.completed':
        return onIterationCompleteMessage(routingKey, message, ...args);
    }
  }
};

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

Characteristics.prototype.debug = function debug(msg) {
  this.logger.debug(`<${this.parentExecutionId} (${this.id})> ${msg}`);
};