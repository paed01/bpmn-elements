"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = LinkEventDefinition;
var _shared = require("../shared.js");
var _messageHelper = require("../messageHelper.js");
var _constants = require("../constants.js");
function LinkEventDefinition(activity, eventDefinition) {
  const {
    id,
    broker,
    environment,
    isThrowing
  } = activity;
  const {
    type = 'LinkEventDefinition',
    behaviour
  } = eventDefinition;
  this.id = id;
  this.type = type;
  this.reference = {
    id: behaviour.name,
    linkName: behaviour.name,
    referenceType: 'link'
  };
  this.isThrowing = isThrowing;
  this.activity = activity;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());
  if (isThrowing) {
    broker.subscribeTmp('api', 'activity.shake.start', (_, msg) => {
      broker.publish('event', `activity.shake.${this.reference.referenceType}`, (0, _messageHelper.cloneContent)(msg.content, {
        sourceId: this.id,
        targetId: undefined,
        message: {
          ...this.reference
        }
      }), {
        type: 'shake'
      });
    }, {
      noAck: true,
      consumerTag: '_link-parent-shake',
      priority: 1000
    });
  } else {
    broker.subscribeTmp('api', `activity.shake.${this.reference.referenceType}`, this._onShakeMessage.bind(this), {
      noAck: true,
      consumerTag: '_link-catch-shake'
    });
    const queueName = `link-${(0, _shared.brokerSafeId)(id)}-${(0, _shared.brokerSafeId)(this.reference.linkName)}-q`;
    broker.assertQueue(queueName, {
      autoDelete: false,
      durable: true
    });
    broker.bindQueue(queueName, 'api', '*.link.#', {
      durable: true
    });
    broker.consume(queueName, this._onLinkApiMessage.bind(this), {
      noAck: true,
      consumerTag: '_link-catch-listener'
    });
  }
}
Object.defineProperty(LinkEventDefinition.prototype, 'executionId', {
  get() {
    return this[_constants.K_EXECUTE_MESSAGE]?.content.executionId;
  }
});
LinkEventDefinition.prototype.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};
LinkEventDefinition.prototype.executeCatch = function executeCatch(executeMessage) {
  /** @private */
  this[_constants.K_EXECUTE_MESSAGE] = executeMessage;
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  const parentExecutionId = parent.executionId;
  const linkMessage = executeContent.message ?? executeContent.input ?? {
    ...this.reference
  };
  this.logger.debug(`<${executionId} (${this.activity.id})> caught link ${this.reference.linkName}`);
  const broker = this.broker;
  const catchContent = (0, _messageHelper.cloneContent)(executeContent, {
    link: {
      ...this.reference
    },
    message: {
      ...linkMessage
    },
    executionId: parentExecutionId
  });
  catchContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.catch', catchContent, {
    type: 'catch'
  });
  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
    output: linkMessage,
    state: 'catch'
  }));
};
LinkEventDefinition.prototype.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  const parentExecutionId = parent && parent.executionId;
  this.logger.debug(`<${executionId} (${this.activity.id})> throw link ${this.reference.linkName}`);
  const broker = this.broker;
  const linkContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parentExecutionId,
    message: {
      ...this.reference
    },
    state: 'throw'
  });
  linkContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.link', linkContent, {
    type: 'link',
    delegate: true
  });
  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent));
};
LinkEventDefinition.prototype._onLinkApiMessage = function onLinkApiMessage(_, message) {
  if (message.properties.type !== 'link') return;
  if (message.content.message?.linkName !== this.reference.linkName) return;
  if (this.activity.isRunning) return;
  this.activity.run(message.content.message);
};
LinkEventDefinition.prototype._onShakeMessage = function onShakeMessage(_, message) {
  if (message.properties.type !== 'shake') return;
  if (message.content.message?.linkName !== this.reference.linkName) return;
  const content = (0, _messageHelper.cloneContent)(message.content, {
    targetId: this.id,
    isLinked: true
  });
  content.sequence = content.sequence || [];
  content.sequence.push({
    id: this.id,
    type: this.type
  });
  this.broker.publish('event', 'activity.shake.linked', content, {
    persistent: false,
    type: 'shake'
  });
  const outbound = this.activity.outbound;
  if (outbound?.length) {
    for (const flow of outbound) flow.shake({
      content: (0, _messageHelper.cloneContent)(content)
    });
  }
};