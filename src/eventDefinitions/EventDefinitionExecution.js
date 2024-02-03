import {cloneContent, unshiftParent, shiftParent, cloneParent} from '../messageHelper.js';

const kCompleted = Symbol.for('completed');
const kExecuteMessage = Symbol.for('executeMessage');
const kStopped = Symbol.for('stopped');

export default function EventDefinitionExecution(activity, eventDefinitions, completedRoutingKey = 'execute.completed') {
  this.id = activity.id;
  this.activity = activity;
  this.broker = activity.broker;
  this.eventDefinitions = eventDefinitions;
  this.completedRoutingKey = completedRoutingKey;
  this[kCompleted] = false;
  this[kStopped] = false;
  this[kExecuteMessage] = null;
}

Object.defineProperties(EventDefinitionExecution.prototype, {
  completed: {
    get() {
      return this[kCompleted];
    },
  },
  stopped: {
    get() {
      return this[kStopped];
    },
  },
});

EventDefinitionExecution.prototype.execute = function execute(executeMessage) {
  const content = executeMessage.content;

  if (content.isDefinitionScope) return this._executeDefinition(executeMessage);
  if (!content.isRootScope) return;

  const broker = this.broker;

  this[kExecuteMessage] = executeMessage;
  const executionId = content.executionId;

  broker.subscribeTmp('execution', 'execute.#', this._onExecuteMessage.bind(this), {
    noAck: true,
    consumerTag: '_eventdefinition-execution-execute-tag',
    priority: 300,
  });
  broker.subscribeTmp('api', `activity.*.${executionId}`, this._onApiMessage.bind(this), {
    noAck: true,
    consumerTag: '_eventdefinition-execution-api-tag',
    priority: 300,
  });

  broker.publish('execution', 'execute.update', cloneContent(content, {preventComplete: true}));

  if (executeMessage.fields.redelivered) return;

  const parent = unshiftParent(content.parent, content);
  const eventDefinitions = this.eventDefinitions;

  for (let index = 0; index < eventDefinitions.length; ++index) {
    if (this[kCompleted]) break;
    if (this[kStopped]) break;

    const ed = eventDefinitions[index];
    const edExecutionId = `${executionId}_${index}`;

    this._debug(executionId, `start event definition ${ed.type}, index ${index}`);

    const edContent = cloneContent(content, {
      isRootScope: undefined,
      type: ed.type,
      executionId: edExecutionId,
      isDefinitionScope: true,
      index,
    });
    edContent.parent = cloneParent(parent);

    broker.publish('execution', 'execute.start', edContent);
  }
};

EventDefinitionExecution.prototype._onApiMessage = function onApiMessage(_, message) {
  const messageType = message.properties.type;
  switch (messageType) {
    case 'stop':
    case 'discard':
      return this._stop();
  }
};

EventDefinitionExecution.prototype._onExecuteMessage = function onExecuteMessage(routingKey, message) {
  switch (routingKey) {
    case 'execute.completed': {
      this._stop();
      if (message.content.isDefinitionScope) return this._complete(message);
      break;
    }
    case 'execute.discard': {
      const {executionId, isDefinitionScope} = message.content;
      if (isDefinitionScope) {
        this._debug(executionId, `event definition ${message.content.type} discarded, index ${message.content.index}`);
        break;
      }
      this._stop();
      this._debug(executionId, 'event definition parent execution discarded');
      break;
    }
  }
};

EventDefinitionExecution.prototype._complete = function complete(message) {
  const {executionId, type, index, parent} = message.content;
  this[kCompleted] = true;

  this._debug(executionId, `event definition ${type} completed, index ${index}`);

  const completeContent = cloneContent(message.content, {
    executionId: this[kExecuteMessage].content.executionId,
    isRootScope: true,
    isDefinitionScope: undefined,
  });
  completeContent.parent = shiftParent(parent);

  this.broker.publish('execution', this.completedRoutingKey, completeContent, {correlationId: message.properties.correlationId});
};

EventDefinitionExecution.prototype._executeDefinition = function executeDefinition(message) {
  const {executionId, index} = message.content;
  const ed = this.eventDefinitions[index];
  if (!ed) return this.activity.logger.warn(`<${executionId} (${this.id})> found no event definition on index ${index}`);
  this._debug(executionId, `execute event definition ${ed.type}, index ${index}`);
  ed.execute(message);
};

EventDefinitionExecution.prototype._stop = function stop() {
  this[kStopped] = true;
  this.broker.cancel('_eventdefinition-execution-execute-tag');
  this.broker.cancel('_eventdefinition-execution-api-tag');
};

EventDefinitionExecution.prototype._debug = function debug(executionId, msg) {
  this.activity.logger.debug(`<${executionId} (${this.id})> ${msg}`);
};
