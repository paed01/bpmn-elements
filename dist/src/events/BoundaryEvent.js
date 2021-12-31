"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.BoundaryEventBehaviour = BoundaryEventBehaviour;
exports.default = BoundaryEvent;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _EventDefinitionExecution = _interopRequireDefault(require("../eventDefinitions/EventDefinitionExecution"));

var _messageHelper = require("../messageHelper");

var _shared = require("../shared");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const attachedConsumersSymbol = Symbol.for('attachedConsumers');
const completeContentSymbol = Symbol.for('completeContent');
const executeMessageSymbol = Symbol.for('executeMessage');
const executionSymbol = Symbol.for('execution');
const shovelsSymbol = Symbol.for('shovels');

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
  this[executionSymbol] = activity.eventDefinitions && new _EventDefinitionExecution.default(activity, activity.eventDefinitions, 'execute.bound.completed');
  this[shovelsSymbol] = [];
  this[attachedConsumersSymbol] = [];
}

const proto = BoundaryEventBehaviour.prototype;
Object.defineProperty(proto, 'executionId', {
  get() {
    const message = this[executeMessageSymbol];
    return message && message.content.executionId;
  }

});
Object.defineProperty(proto, 'cancelActivity', {
  enumerable: true,

  get() {
    const behaviour = this.activity.behaviour || {};
    return 'cancelActivity' in behaviour ? behaviour.cancelActivity : true;
  }

});

proto.execute = function execute(executeMessage) {
  const {
    isRootScope,
    executionId
  } = executeMessage.content;
  const eventDefinitionExecution = this[executionSymbol];

  if (isRootScope) {
    this[executeMessageSymbol] = executeMessage;
    const broker = this.broker;

    if (eventDefinitionExecution && !this.environment.settings.strict) {
      broker.subscribeTmp('execution', 'execute.expect', this._onExpectMessage.bind(this), {
        noAck: true,
        consumerTag: '_expect-tag'
      });
    }

    const consumerTag = `_bound-listener-${executionId}`;
    this.attachedTo.broker.subscribeTmp('event', 'activity.leave', this._onAttachedLeave.bind(this), {
      noAck: true,
      consumerTag,
      priority: 300
    });
    this[attachedConsumersSymbol].push(consumerTag);
    broker.subscribeOnce('execution', 'execute.detach', this._onDetachMessage.bind(this), {
      consumerTag: '_detach-tag'
    });
    broker.subscribeOnce('api', `activity.#.${executionId}`, this._onApiMessage.bind(this), {
      consumerTag: `_api-${executionId}`
    });
    broker.subscribeOnce('execution', 'execute.bound.completed', this._onCompleted.bind(this), {
      consumerTag: `_execution-completed-${executionId}`
    });
  }

  if (eventDefinitionExecution) {
    return eventDefinitionExecution.execute(executeMessage);
  }
};

proto._onCompleted = function onCompleted(_, message) {
  if (!this.cancelActivity && !message.content.cancelActivity) {
    this._stop();

    return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(message.content));
  }

  this[completeContentSymbol] = message.content;
  const {
    inbound
  } = this[executeMessageSymbol].content;
  const attachedToContent = inbound && inbound[0];
  const attachedTo = this.attachedTo;
  this.activity.logger.debug(`<${this.executionId} (${this.id})> cancel ${attachedTo.status} activity <${attachedToContent.executionId} (${attachedToContent.id})>`);
  attachedTo.getApi({
    content: attachedToContent
  }).discard();
};

proto._onAttachedLeave = function onAttachedLeave(routingKey, message) {
  if (message.content.id !== this.attachedTo.id) return;

  this._stop();

  const completeContent = this[completeContentSymbol];
  if (!completeContent) return this.broker.publish('execution', 'execute.discard', this[executeMessageSymbol].content);
  return this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(completeContent));
};

proto._onExpectMessage = function onExpectMessage(_, message) {
  const {
    executionId,
    expectRoutingKey
  } = message.content;
  const attachedTo = this.attachedTo;
  const errorConsumerTag = `_bound-error-listener-${executionId}`;
  this[attachedConsumersSymbol].push(errorConsumerTag);
  attachedTo.broker.subscribeTmp('event', 'activity.error', (__, errorMessage) => {
    if (errorMessage.content.id !== attachedTo.id) return;
    this.broker.publish('execution', expectRoutingKey, (0, _messageHelper.cloneContent)(errorMessage.content));
  }, {
    noAck: true,
    consumerTag: errorConsumerTag,
    priority: 300
  });
};

proto._onDetachMessage = function onDetachMessage(_, {
  content
}) {
  const id = this.id,
        executionId = this.executionId,
        attachedTo = this.attachedTo;
  this.activity.logger.debug(`<${executionId} (${id})> detach from activity <${attachedTo.id}>`);

  this._stop(true);

  const {
    executionId: detachId,
    bindExchange,
    sourceExchange = 'execution',
    sourcePattern
  } = content;
  const shovelName = `_detached-${(0, _shared.brokerSafeId)(id)}_${detachId}`;
  this[shovelsSymbol].push(shovelName);
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
  broker.subscribeOnce('execution', 'execute.bound.completed', (__, message) => {
    this._stop();

    this.broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(message.content));
  }, {
    consumerTag: `_execution-completed-${executionId}`
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

proto._stop = function stop(detach) {
  const attachedTo = this.attachedTo,
        broker = this.broker,
        executionId = this.executionId;

  for (const tag of this[attachedConsumersSymbol].splice(0)) attachedTo.broker.cancel(tag);

  for (const shovelName of this[shovelsSymbol].splice(0)) attachedTo.broker.closeShovel(shovelName);

  broker.cancel('_expect-tag');
  broker.cancel('_detach-tag');
  broker.cancel(`_execution-completed-${executionId}`);
  if (detach) return;
  broker.cancel(`_api-${executionId}`);
};