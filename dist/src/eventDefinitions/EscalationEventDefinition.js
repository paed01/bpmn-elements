"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = EscalationEventDefinition;

var _shared = require("../shared");

var _messageHelper = require("../messageHelper");

const completedSymbol = Symbol.for('completed');
const escalationQSymbol = Symbol.for('escalationQ');
const executeMessageSymbol = Symbol.for('executeMessage');
const referenceElementSymbol = Symbol.for('referenceElement');
const referenceSymbol = Symbol.for('reference');

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
  const reference = this.reference = behaviour.escalationRef || {
    name: 'anonymous'
  };
  this.id = id;
  this.type = type;
  this.reference = { ...reference,
    referenceType: 'escalate'
  };
  this.isThrowing = isThrowing;
  this.activity = activity;
  this.environment = activity.environment;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());
  this[completedSymbol] = false;
  const referenceElement = this[referenceElementSymbol] = reference.id && activity.getActivityById(reference.id);

  if (!isThrowing) {
    const escalationId = referenceElement ? referenceElement.id : 'anonymous';
    const escalationQueueName = `escalate-${(0, _shared.brokerSafeId)(id)}-${(0, _shared.brokerSafeId)(escalationId)}-q`;
    this[escalationQSymbol] = broker.assertQueue(escalationQueueName, {
      autoDelete: false,
      durable: true
    });
    broker.bindQueue(escalationQueueName, 'api', '*.escalate.#', {
      durable: true,
      priority: 400
    });
  }
}

const proto = EscalationEventDefinition.prototype;
Object.defineProperty(proto, 'executionId', {
  get() {
    const message = this[executeMessageSymbol];
    return message && message.content.executionId;
  }

});

proto.execute = function execute(executeMessage) {
  this[executeMessageSymbol] = executeMessage;
  this[completedSymbol] = false;
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};

proto.executeCatch = function executeCatch(executeMessage) {
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;

  const reference = this[referenceSymbol] = this._resolveReference(executeMessage);

  const broker = this.broker;
  this[escalationQSymbol].consume(this._onEscalationApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_onescalate-${executionId}`
  });
  if (this[completedSymbol]) return;
  broker.subscribeTmp('api', `activity.#.${executionId}`, this._onApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-${executionId}`
  });
  if (this[completedSymbol]) return this._stop();

  this._debug(`expect ${reference.description}`);

  const waitContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parent.executionId,
    parent: (0, _messageHelper.shiftParent)(parent),
    escalation: { ...reference.message
    }
  });
  waitContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.wait', waitContent);
};

proto.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const parent = executeContent.parent;

  const reference = this[referenceSymbol] = this._resolveReference(executeMessage);

  this._debug(`escalate ${reference.description}`);

  const broker = this.broker;
  const escalateContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parent.executionId,
    message: reference.message,
    state: 'throw'
  });
  escalateContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.escalate', escalateContent, {
    type: 'escalate',
    delegate: true
  });
  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent));
};

proto._onEscalationApiMessage = function onEscalationApiMessage(routingKey, message) {
  if ((message.content.message && message.content.message.id) !== this[referenceSymbol].message.id) return;
  const output = message.content.message;
  this[completedSymbol] = true;

  this._stop();

  this._debug(`caught ${this[referenceSymbol].description}`);

  const executeContent = this[executeMessageSymbol].content;
  const {
    parent,
    ...content
  } = executeContent;
  const catchContent = (0, _messageHelper.cloneContent)(content, {
    message: { ...output
    },
    executionId: parent.executionId
  });
  catchContent.parent = (0, _messageHelper.shiftParent)(parent);
  const broker = this.broker;
  broker.publish('event', 'activity.catch', catchContent, {
    type: 'catch'
  });
  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
    output,
    state: 'catch'
  }));
};

proto._onApiMessage = function onApiMessage(routingKey, message) {
  switch (message.properties.type) {
    case 'escalate':
      {
        return this._onEscalationApiMessage(routingKey, message);
      }

    case 'discard':
      {
        this[completedSymbol] = true;

        this._stop();

        return this.broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(this[executeMessageSymbol].content));
      }

    case 'stop':
      {
        this._stop();

        break;
      }
  }
};

proto._stop = function stop() {
  const broker = this.broker,
        executionId = this.executionId;
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_onescalate-${executionId}`);
};

proto._resolveReference = function resolveReference(message) {
  const referenceElement = this[referenceElementSymbol];

  if (!referenceElement) {
    return {
      message: { ...this.reference
      },
      description: 'anonymous escalation'
    };
  }

  const result = {
    message: referenceElement.resolve(message)
  };
  result.description = `${result.message.name} <${result.message.id}>`;
  return result;
};

proto._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};