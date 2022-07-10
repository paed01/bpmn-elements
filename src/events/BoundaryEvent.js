import Activity from '../activity/Activity';
import EventDefinitionExecution from '../eventDefinitions/EventDefinitionExecution';
import {cloneContent, cloneMessage} from '../messageHelper';
import {brokerSafeId} from '../shared';

const kAttachedTags = Symbol.for('attachedConsumers');
const kCompleteContent = Symbol.for('completeContent');
const kExecuteMessage = Symbol.for('executeMessage');
const kExecution = Symbol.for('execution');
const kShovels = Symbol.for('shovels');

export default function BoundaryEvent(activityDef, context) {
  return new Activity(BoundaryEventBehaviour, activityDef, context);
}

export function BoundaryEventBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.attachedTo = activity.attachedTo;
  this.activity = activity;
  this.environment = activity.environment;
  this.broker = activity.broker;
  this[kExecution] = activity.eventDefinitions && new EventDefinitionExecution(activity, activity.eventDefinitions, 'execute.bound.completed');
  this[kShovels] = [];
  this[kAttachedTags] = [];
}

const proto = BoundaryEventBehaviour.prototype;

Object.defineProperty(proto, 'executionId', {
  get() {
    const message = this[kExecuteMessage];
    return message && message.content.executionId;
  },
});

Object.defineProperty(proto, 'cancelActivity', {
  enumerable: true,
  get() {
    const behaviour = this.activity.behaviour || {};
    return 'cancelActivity' in behaviour ? behaviour.cancelActivity : true;
  },
});

proto.execute = function execute(executeMessage) {
  const {isRootScope, executionId} = executeMessage.content;

  const eventDefinitionExecution = this[kExecution];
  if (isRootScope) {
    this[kExecuteMessage] = executeMessage;

    const broker = this.broker;
    const consumerTag = `_bound-listener-${executionId}`;
    this.attachedTo.broker.subscribeTmp('event', 'activity.leave', this._onAttachedLeave.bind(this), {
      noAck: true,
      consumerTag,
      priority: 300,
    });
    this[kAttachedTags].push(consumerTag);

    broker.subscribeOnce('api', `activity.#.${executionId}`, this._onApiMessage.bind(this), {
      consumerTag: `_api-${executionId}`,
    });

    const execQ = broker.assertQueue(`_bound-execution-${executionId}`, {durable: false, autoDelete: true});
    broker.bindQueue(execQ.name, 'execution', 'execute.detach');
    broker.bindQueue(execQ.name, 'execution', 'execute.bound.completed');
    broker.bindQueue(execQ.name, 'execution', 'execute.repeat');
    if (eventDefinitionExecution && !this.environment.settings.strict) {
      broker.bindQueue(execQ.name, 'execution', 'execute.expect');
    }

    execQ.consume(this._onExecutionMessage.bind(this), {consumerTag: '_execution-tag'});
  }

  if (eventDefinitionExecution) {
    return eventDefinitionExecution.execute(executeMessage);
  }
};

proto._onExecutionMessage = function onExecutionMessage(routingKey, message) {
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

proto._onCompleted = function onCompleted(_, {content}) {
  if (!this.cancelActivity && !content.cancelActivity) {
    this._stop();
    return this.broker.publish('execution', 'execute.completed', cloneContent(content, {cancelActivity: false}));
  }

  this[kCompleteContent] = content;

  const inbound = this[kExecuteMessage].content.inbound;
  const attachedToContent = inbound && inbound[0];
  const attachedTo = this.attachedTo;
  this.activity.logger.debug(`<${this.executionId} (${this.id})> cancel ${attachedTo.status} activity <${attachedToContent.executionId} (${attachedToContent.id})>`);

  attachedTo.getApi({content: attachedToContent}).discard();
};

proto._onAttachedLeave = function onAttachedLeave(_, {content}) {
  if (content.id !== this.attachedTo.id) return;
  this._stop();
  const completeContent = this[kCompleteContent];
  if (!completeContent) return this.broker.publish('execution', 'execute.discard', this[kExecuteMessage].content);
  return this.broker.publish('execution', 'execute.completed', cloneContent(completeContent));
};

proto._onExpectMessage = function onExpectMessage(_, {content}) {
  const {executionId, expectRoutingKey} = content;
  const attachedTo = this.attachedTo;

  const errorConsumerTag = `_bound-error-listener-${executionId}`;
  this[kAttachedTags].push(errorConsumerTag);

  attachedTo.broker.subscribeTmp('event', 'activity.error', (__, errorMessage) => {
    if (errorMessage.content.id !== attachedTo.id) return;
    this.broker.publish('execution', expectRoutingKey, cloneContent(errorMessage.content));
  }, {
    noAck: true,
    consumerTag: errorConsumerTag,
    priority: 300,
  });
};

proto._onDetachMessage = function onDetachMessage(_, {content}) {
  const id = this.id, executionId = this.executionId, attachedTo = this.attachedTo;
  this.activity.logger.debug(`<${executionId} (${id})> detach from activity <${attachedTo.id}>`);
  this._stop(true);

  const {executionId: detachId, bindExchange, sourceExchange, sourcePattern} = content;

  const shovelName = `_detached-${brokerSafeId(id)}_${detachId}`;
  this[kShovels].push(shovelName);

  const broker = this.broker;
  attachedTo.broker.createShovel(shovelName, {
    exchange: sourceExchange,
    pattern: sourcePattern,
  }, {
    broker,
    exchange: bindExchange,
  }, {
    cloneMessage,
  });

  broker.subscribeOnce('execution', 'execute.bound.completed', (__, {content: completeContent}) => {
    this._stop();
    this.broker.publish('execution', 'execute.completed', cloneContent(completeContent));
  }, {
    consumerTag: `_execution-completed-${executionId}`,
  });
};

proto._onApiMessage = function onApiMessage(_, message) {
  switch (message.properties.type) {
    case 'discard':
    case 'stop':
      this._stop();
      break;
  }
};

proto._onRepeatMessage = function onRepeatMessage(_, message) {
  if (this.cancelActivity) return;
  const executeMessage = this[kExecuteMessage];
  const repeat = message.content.repeat;
  this.broker.getQueue('inbound-q').queueMessage({routingKey: 'activity.restart'}, cloneContent(executeMessage.content.inbound[0], {repeat}));
};

proto._stop = function stop(detach) {
  const attachedTo = this.attachedTo, broker = this.broker, executionId = this.executionId;
  for (const tag of this[kAttachedTags].splice(0)) attachedTo.broker.cancel(tag);
  for (const shovelName of this[kShovels].splice(0)) attachedTo.broker.closeShovel(shovelName);

  broker.cancel('_execution-tag');
  broker.cancel(`_execution-completed-${executionId}`);

  if (detach) return;

  broker.cancel(`_api-${executionId}`);
};
