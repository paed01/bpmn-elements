"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EscalationEventDefinition = EscalationEventDefinition;
var _shared = require("../shared.js");
var _messageHelper = require("../messageHelper.js");
var _constants = require("../constants.js");
/**
 * Escalation event definition
 * @param {import('#types').Activity} activity
 * @param {import('#types').SerializableElement} eventDefinition
 */
function EscalationEventDefinition(activity, eventDefinition) {
  const {
    id,
    broker,
    environment,
    isThrowing
  } = activity;
  const {
    type,
    behaviour = {}
  } = eventDefinition;
  this.id = id;
  this.type = type;

  /** @type {import('#types').EventReference} */
  this.reference = {
    name: 'anonymous',
    // @ts-ignore
    ...behaviour.escalationRef,
    referenceType: 'escalate'
  };
  this.isThrowing = isThrowing;
  this.activity = activity;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());

  /** @internal */
  this[_constants.K_REFERENCE_ELEMENT] = this.reference.id && activity.getActivityById(this.reference.id);
  const referenceElement = this[_constants.K_REFERENCE_ELEMENT];
  if (!isThrowing) {
    /** @internal */
    this[_constants.K_COMPLETED] = false;
    /** @internal */
    this[_constants.K_EXECUTE_MESSAGE] = undefined;
    /** @internal */
    this[_constants.K_REFERENCE_INFO] = undefined;
    const referenceId = referenceElement ? referenceElement.id : 'anonymous';
    const messageQueueName = `${this.reference.referenceType}-${(0, _shared.brokerSafeId)(id)}-${(0, _shared.brokerSafeId)(referenceId)}-q`;
    /** @internal */
    this[_constants.K_MESSAGE_Q] = broker.assertQueue(messageQueueName, {
      autoDelete: false,
      durable: true
    });
    broker.bindQueue(messageQueueName, 'api', `*.${this.reference.referenceType}.#`, {
      durable: true,
      priority: 400
    });
  }
}
Object.defineProperty(EscalationEventDefinition.prototype, 'executionId', {
  /** @returns {string} */
  get() {
    return this[_constants.K_EXECUTE_MESSAGE]?.content.executionId;
  }
});

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
EscalationEventDefinition.prototype.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
EscalationEventDefinition.prototype.executeCatch = function executeCatch(executeMessage) {
  this[_constants.K_EXECUTE_MESSAGE] = executeMessage;
  this[_constants.K_COMPLETED] = false;
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  const info = this[_constants.K_REFERENCE_INFO] = this._getReferenceInfo(executeMessage);
  const broker = this.broker;
  this[_constants.K_MESSAGE_Q].consume(this._onCatchMessage.bind(this), {
    noAck: true,
    consumerTag: `_onescalate-${executionId}`
  });
  if (this[_constants.K_COMPLETED]) return;
  broker.subscribeTmp('api', `activity.#.${executionId}`, this._onApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-${executionId}`
  });
  this._debug(`expect ${info.description}`);
  const waitContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parent.executionId,
    parent: (0, _messageHelper.shiftParent)(parent),
    escalation: {
      ...info.message
    },
    accepts: ['escalate']
  });
  waitContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.wait', waitContent);
};

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
EscalationEventDefinition.prototype.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  const info = this._getReferenceInfo(executeMessage);
  this.logger.debug(`<${executionId} (${this.activity.id})> escalate ${info.description}`);
  const broker = this.broker;
  const throwContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parent.executionId,
    message: info.message,
    state: 'throw'
  });
  throwContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.escalate', throwContent, {
    type: 'escalate',
    delegate: true
  });
  broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent));
};
EscalationEventDefinition.prototype._onCatchMessage = function onCatchMessage(_routingKey, message) {
  const info = this[_constants.K_REFERENCE_INFO];
  if (message.content?.message?.id !== info.message.id) return;
  const output = message.content.message;
  this[_constants.K_COMPLETED] = true;
  this._stop();
  this._debug(`caught ${info.description}`);
  const executeContent = this[_constants.K_EXECUTE_MESSAGE].content;
  const {
    parent,
    ...content
  } = executeContent;
  const catchContent = (0, _messageHelper.cloneContent)(content, {
    message: {
      ...output
    },
    executionId: parent.executionId
  });
  catchContent.parent = (0, _messageHelper.shiftParent)(parent);
  const broker = this.broker;
  broker.publish('event', 'activity.catch', catchContent, {
    type: 'catch'
  });
  broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
    output,
    state: 'catch'
  }));
};
EscalationEventDefinition.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  switch (message.properties.type) {
    case 'escalate':
      {
        return this._onCatchMessage(routingKey, message);
      }
    case 'discard':
      {
        this[_constants.K_COMPLETED] = true;
        this._stop();
        return this.broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(this[_constants.K_EXECUTE_MESSAGE].content));
      }
    case 'stop':
      {
        this._stop();
        break;
      }
  }
};
EscalationEventDefinition.prototype._stop = function stop() {
  const broker = this.broker,
    executionId = this.executionId;
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_onescalate-${executionId}`);
};
EscalationEventDefinition.prototype._getReferenceInfo = function getReferenceInfo(message) {
  const referenceElement = this[_constants.K_REFERENCE_ELEMENT];
  if (!referenceElement) {
    return {
      message: {
        ...this.reference
      },
      description: 'anonymous escalation'
    };
  }
  const result = {
    // @ts-ignore
    message: referenceElement.resolve(message)
  };
  result.description = `${result.message.name} <${result.message.id}>`;
  return result;
};
EscalationEventDefinition.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};