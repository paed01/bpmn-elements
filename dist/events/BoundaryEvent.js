"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.BoundaryEventBehaviour = BoundaryEventBehaviour;
exports.default = BoundaryEvent;
var _Activity = _interopRequireDefault(require("../activity/Activity.js"));
var _EventDefinitionExecution = _interopRequireDefault(require("../eventDefinitions/EventDefinitionExecution.js"));
var _messageHelper = require("../messageHelper.js");
var _shared = require("../shared.js");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const kAttachedTags = Symbol.for('attachedConsumers');
const kCompleteContent = Symbol.for('completeContent');
const kExecuteMessage = Symbol.for('executeMessage');
const kExecution = Symbol.for('execution');
const kShovels = Symbol.for('shovels');
function BoundaryEvent(activityDef, context) {
  return new _Activity.default(BoundaryEventBehaviour, activityDef, context);
}
function BoundaryEventBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.attachedTo = activity.attachedTo;
  this.activity = activity;
  this.environment = activity.environment;
  this.broker = activity.broker;
  this[kExecution] = activity.eventDefinitions && new _EventDefinitionExecution.default(activity, activity.eventDefinitions, 'execute.bound.completed');
  this[kShovels] = new Set();
  this[kAttachedTags] = new Set();
}
Object.defineProperties(BoundaryEventBehaviour.prototype, {
  executionId: {
    get() {
      const message = this[kExecuteMessage];
      return message && message.content.executionId;
    }
  },
  cancelActivity: {
    get() {
      const behaviour = this.activity.behaviour || {};
      return 'cancelActivity' in behaviour ? behaviour.cancelActivity : true;
    }
  }
});
BoundaryEventBehaviour.prototype.execute = function execute(executeMessage) {
  const {
    isRootScope,
    executionId
  } = executeMessage.content;
  const eventDefinitionExecution = this[kExecution];
  if (isRootScope && executeMessage.content.id === this.id) {
    this[kExecuteMessage] = executeMessage;
    const broker = this.broker;
    if (executeMessage.fields.routingKey === 'execute.bound.completed') {
      this._stop();
      return broker.publish('execution', 'execute.completed', executeMessage.content, executeMessage.properties);
    }
    const consumerTag = `_bound-listener-${executionId}`;
    this.attachedTo.broker.subscribeTmp('event', 'activity.leave', this._onAttachedLeave.bind(this), {
      noAck: true,
      consumerTag,
      priority: 300
    });
    this[kAttachedTags].add(consumerTag);
    broker.subscribeOnce('api', `activity.#.${executionId}`, this._onApiMessage.bind(this), {
      consumerTag: `_api-${executionId}`
    });
    const execQ = broker.assertQueue(`_bound-execution-${executionId}`, {
      durable: false,
      autoDelete: true
    });
    broker.bindQueue(execQ.name, 'execution', 'execute.detach');
    broker.bindQueue(execQ.name, 'execution', 'execute.bound.completed');
    if (!this.cancelActivity) {
      broker.bindQueue(execQ.name, 'execution', 'execute.repeat');
    }
    if (eventDefinitionExecution && !this.environment.settings.strict) {
      broker.bindQueue(execQ.name, 'execution', 'execute.expect');
    }
    execQ.consume(this._onExecutionMessage.bind(this), {
      consumerTag: '_execution-tag'
    });
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
BoundaryEventBehaviour.prototype._onCompleted = function onCompleted(_, {
  content
}) {
  if (content.cancelActivity === false || !this.cancelActivity && !content.cancelActivity) {
    this._stop();
    return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content, {
      isDefinitionScope: false,
      cancelActivity: false
    }));
  }
  this[kCompleteContent] = content;
  const {
    inbound,
    executionId
  } = this[kExecuteMessage].content;
  const attachedToContent = inbound && inbound[0];
  const attachedTo = this.attachedTo;
  this.activity.logger.debug(`<${executionId} (${this.id})> cancel ${attachedTo.status} activity <${attachedToContent.executionId} (${attachedToContent.id})>`);
  if (content.isRecovered && !attachedTo.isRunning) {
    const attachedExecuteTag = `_on-attached-execute-${executionId}`;
    this[kAttachedTags].add(attachedExecuteTag);
    attachedTo.broker.subscribeOnce('execution', '#', () => {
      attachedTo.getApi({
        content: attachedToContent
      }).discard();
    }, {
      consumerTag: attachedExecuteTag
    });
  } else {
    attachedTo.getApi({
      content: attachedToContent
    }).discard();
  }
};
BoundaryEventBehaviour.prototype._onAttachedLeave = function onAttachedLeave(_, {
  content
}) {
  if (content.id !== this.attachedTo.id) return;
  this._stop();
  const completeContent = this[kCompleteContent];
  if (!completeContent) return this.broker.publish('execution', 'execute.discard', this[kExecuteMessage].content);
  return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(completeContent));
};
BoundaryEventBehaviour.prototype._onExpectMessage = function onExpectMessage(_, {
  content
}) {
  const {
    executionId,
    expectRoutingKey,
    pattern,
    exchange
  } = content;
  const attachedTo = this.attachedTo;
  const errorConsumerTag = `_bound-error-listener-${executionId}`;
  this[kAttachedTags].add(errorConsumerTag);
  attachedTo.broker.subscribeTmp('event', pattern, (__, message) => {
    if (message.content.id !== attachedTo.id) return;
    this.broker.publish(exchange, expectRoutingKey, (0, _messageHelper.cloneContent)(message.content, {
      attachedTo: attachedTo.id
    }), {
      ...message.properties,
      mandatory: false
    });
  }, {
    noAck: true,
    consumerTag: errorConsumerTag,
    priority: 400
  });
};
BoundaryEventBehaviour.prototype._onDetachMessage = function onDetachMessage(_, message) {
  const content = message.content;
  const {
    executionId,
    parent
  } = this[kExecuteMessage].content;
  const id = this.id,
    attachedTo = this.attachedTo;
  this.activity.logger.debug(`<${executionId} (${id})> detach from activity <${attachedTo.id}>`);
  this._stop(true);
  const {
    executionId: detachId,
    bindExchange,
    sourceExchange,
    sourcePattern
  } = content;
  const shovelName = `_detached-${(0, _shared.brokerSafeId)(id)}_${detachId}`;
  this[kShovels].add(shovelName);
  const broker = this.broker;
  attachedTo.broker.createShovel(shovelName, {
    exchange: sourceExchange,
    pattern: sourcePattern
  }, {
    broker,
    exchange: bindExchange
  }, {
    cloneMessage: _messageHelper.cloneMessage
  });
  const detachContent = (0, _messageHelper.cloneContent)(content, {
    executionId
  });
  detachContent.parent = parent;
  this.activity.removeInboundListeners();
  broker.publish('event', 'activity.detach', detachContent);
  broker.subscribeOnce('execution', 'execute.bound.completed', (__, {
    content: completeContent
  }) => {
    this._stop();
    this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(completeContent));
  }, {
    consumerTag: `_execution-completed-${executionId}`
  });
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
  const executeMessage = this[kExecuteMessage];
  const repeat = message.content.repeat;
  this.broker.getQueue('inbound-q').queueMessage({
    routingKey: 'activity.restart'
  }, (0, _messageHelper.cloneContent)(executeMessage.content.inbound[0], {
    repeat
  }));
};
BoundaryEventBehaviour.prototype._stop = function stop(detach) {
  const attachedTo = this.attachedTo,
    broker = this.broker,
    executionId = this.executionId;
  for (const tag of this[kAttachedTags]) attachedTo.broker.cancel(tag);
  this[kAttachedTags].clear();
  for (const shovelName of this[kShovels]) attachedTo.broker.closeShovel(shovelName);
  this[kShovels].clear();
  broker.cancel('_execution-tag');
  broker.cancel(`_execution-completed-${executionId}`);
  if (detach) return;
  broker.cancel(`_api-${executionId}`);
};