import { Activity } from '../activity/Activity.js';
import { EventDefinitionExecution } from '../eventDefinitions/EventDefinitionExecution.js';
import { cloneContent, cloneMessage } from '../messageHelper.js';
import { brokerSafeId } from '../shared.js';
import { K_EXECUTE_MESSAGE, K_EXECUTION } from '../constants.js';

const K_ATTACHED_TAGS = Symbol.for('attachedConsumers');
const K_COMPLETE_CONTENT = Symbol.for('completeContent');
const K_SHOVELS = Symbol.for('shovels');

/**
 * Boundary event
 * @param {import('moddle-context-serializer').Activity} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function BoundaryEvent(activityDef, context) {
  return new Activity(BoundaryEventBehaviour, activityDef, context);
}

/**
 * Boundary event behaviour
 * @param {import('#types').Activity} activity
 */
export function BoundaryEventBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.attachedTo = activity.attachedTo;
  this.activity = activity;
  this.environment = activity.environment;
  this.broker = activity.broker;
  /** @internal */
  this[K_EXECUTION] =
    activity.eventDefinitions && new EventDefinitionExecution(activity, activity.eventDefinitions, 'execute.bound.completed');
  /** @internal */
  this[K_SHOVELS] = new Set();
  /** @internal */
  this[K_ATTACHED_TAGS] = new Set();
  /** @internal */
  this[K_EXECUTE_MESSAGE] = undefined;
  /** @internal */
  this[K_COMPLETE_CONTENT] = undefined;
}

Object.defineProperty(BoundaryEventBehaviour.prototype, 'executionId', {
  /** @returns {string | undefined} */
  get() {
    return this[K_EXECUTE_MESSAGE]?.content.executionId;
  },
});

Object.defineProperty(BoundaryEventBehaviour.prototype, 'cancelActivity', {
  /** @returns {boolean} */
  get() {
    return this.activity.behaviour?.cancelActivity ?? true;
  },
});

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
BoundaryEventBehaviour.prototype.execute = function execute(executeMessage) {
  const { isRootScope, executionId } = executeMessage.content;

  const eventDefinitionExecution = this[K_EXECUTION];
  if (isRootScope && executeMessage.content.id === this.id) {
    this[K_EXECUTE_MESSAGE] = executeMessage;

    const broker = this.broker;
    if (executeMessage.fields.routingKey === 'execute.bound.completed') {
      this._stop();
      return broker.publish('execution', 'execute.completed', executeMessage.content, executeMessage.properties);
    }

    const consumerTag = `_bound-listener-${executionId}`;
    this.attachedTo.broker.subscribeTmp('event', 'activity.leave', this._onAttachedLeave.bind(this), {
      noAck: true,
      consumerTag,
      priority: 300,
    });
    this[K_ATTACHED_TAGS].add(consumerTag);

    broker.subscribeOnce('api', `activity.#.${executionId}`, this._onApiMessage.bind(this), {
      consumerTag: `_api-${executionId}`,
    });

    const execQ = broker.assertQueue(`_bound-execution-${executionId}`, { durable: false, autoDelete: true });
    broker.bindQueue(execQ.name, 'execution', 'execute.detach');
    broker.bindQueue(execQ.name, 'execution', 'execute.bound.completed');

    if (!this.cancelActivity) {
      broker.bindQueue(execQ.name, 'execution', 'execute.repeat');
    }

    if (eventDefinitionExecution && !this.environment.settings.strict) {
      broker.bindQueue(execQ.name, 'execution', 'execute.expect');
    }

    execQ.consume(this._onExecutionMessage.bind(this), { consumerTag: '_execution-tag' });
  }

  if (eventDefinitionExecution) {
    return eventDefinitionExecution.execute(executeMessage);
  }
};

BoundaryEventBehaviour.prototype._onExecutionMessage = function onExecutionMessage(routingKey, message) {
  message.ack();
  switch (routingKey) {
    case 'execute.detach':
      return this._onDetachMessage(routingKey, message);
    case 'execute.bound.completed':
      return this._onCompleted(routingKey, message);
    case 'execute.repeat':
      return this._onRepeatMessage(routingKey, message);
    case 'execute.expect':
      return this._onExpectMessage(routingKey, message);
  }
};

BoundaryEventBehaviour.prototype._onCompleted = function onCompleted(_, { content }) {
  if (content.cancelActivity === false || (!this.cancelActivity && !content.cancelActivity)) {
    this._stop();
    return this.broker.publish(
      'execution',
      'execute.completed',
      cloneContent(content, { isDefinitionScope: false, cancelActivity: false })
    );
  }

  this[K_COMPLETE_CONTENT] = content;

  const { inbound, executionId } = this[K_EXECUTE_MESSAGE].content;
  const attachedToContent = inbound?.[0];
  const attachedTo = this.attachedTo;

  this.activity.logger.debug(
    `<${executionId} (${this.id})> cancel ${attachedTo.status} activity <${attachedToContent.executionId} (${attachedToContent.id})>`
  );

  if (content.isRecovered && !attachedTo.isRunning) {
    const attachedExecuteTag = `_on-attached-execute-${executionId}`;
    this[K_ATTACHED_TAGS].add(attachedExecuteTag);
    attachedTo.broker.subscribeOnce(
      'execution',
      '#',
      () => {
        attachedTo.getApi({ content: attachedToContent }).discard();
      },
      { consumerTag: attachedExecuteTag }
    );
  } else {
    attachedTo.getApi({ content: attachedToContent }).discard();
  }
};

BoundaryEventBehaviour.prototype._onAttachedLeave = function onAttachedLeave(_, { content }) {
  if (content.id !== this.attachedTo.id) return;

  this._stop();
  const completeContent = this[K_COMPLETE_CONTENT];
  if (!completeContent) return this.broker.publish('execution', 'execute.discard', this[K_EXECUTE_MESSAGE].content);
  return this.broker.publish('execution', 'execute.completed', cloneContent(completeContent));
};

BoundaryEventBehaviour.prototype._onExpectMessage = function onExpectMessage(_, { content }) {
  const { executionId, expectRoutingKey, pattern, exchange } = content;
  const attachedTo = this.attachedTo;

  const errorConsumerTag = `_bound-error-listener-${executionId}`;
  this[K_ATTACHED_TAGS].add(errorConsumerTag);

  attachedTo.broker.subscribeTmp(
    'event',
    pattern,
    (__, message) => {
      if (message.content.id !== attachedTo.id) return;
      this.broker.publish(exchange, expectRoutingKey, cloneContent(message.content, { attachedTo: attachedTo.id }), {
        ...message.properties,
        mandatory: false,
      });
    },
    {
      noAck: true,
      consumerTag: errorConsumerTag,
      priority: 400,
    }
  );
};

BoundaryEventBehaviour.prototype._onDetachMessage = function onDetachMessage(_, message) {
  const content = message.content;
  const { executionId, parent } = this[K_EXECUTE_MESSAGE].content;
  const id = this.id,
    attachedTo = this.attachedTo;
  this.activity.logger.debug(`<${executionId} (${id})> detach from activity <${attachedTo.id}>`);
  this._stop(true);

  const { executionId: detachId, bindExchange, sourceExchange, sourcePattern } = content;

  const shovelName = `_detached-${brokerSafeId(id)}_${detachId}`;
  this[K_SHOVELS].add(shovelName);

  const broker = this.broker;
  attachedTo.broker.createShovel(
    shovelName,
    {
      exchange: sourceExchange,
      pattern: sourcePattern,
    },
    {
      broker,
      exchange: bindExchange,
    },
    {
      cloneMessage,
    }
  );

  const detachContent = cloneContent(content, {
    executionId,
  });
  detachContent.parent = parent;

  this.activity.removeInboundListeners();
  broker.publish('event', 'activity.detach', detachContent);

  broker.subscribeOnce(
    'execution',
    'execute.bound.completed',
    (__, { content: completeContent }) => {
      this._stop();
      this.broker.publish('execution', 'execute.completed', cloneContent(completeContent));
    },
    {
      consumerTag: `_execution-completed-${executionId}`,
    }
  );
};

BoundaryEventBehaviour.prototype._onApiMessage = function onApiMessage(_, message) {
  switch (message.properties.type) {
    case 'discard':
    case 'stop':
      this._stop();
      break;
  }
};

BoundaryEventBehaviour.prototype._onRepeatMessage = function onRepeatMessage(_, message) {
  const executeMessage = this[K_EXECUTE_MESSAGE];
  const repeat = message.content.repeat;
  this.broker
    .getQueue('inbound-q')
    .queueMessage({ routingKey: 'activity.restart' }, cloneContent(executeMessage.content.inbound[0], { repeat }));
};

BoundaryEventBehaviour.prototype._stop = function stop(detach) {
  const attachedTo = this.attachedTo,
    broker = this.broker,
    executionId = this.executionId;
  for (const tag of this[K_ATTACHED_TAGS]) attachedTo.broker.cancel(tag);
  this[K_ATTACHED_TAGS].clear();
  for (const shovelName of this[K_SHOVELS]) attachedTo.broker.closeShovel(shovelName);
  this[K_SHOVELS].clear();

  broker.cancel('_execution-tag');
  broker.cancel(`_execution-completed-${executionId}`);

  if (detach) return;

  broker.cancel(`_api-${executionId}`);
};
