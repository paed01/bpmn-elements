"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ErrorEventDefinition;

var _shared = require("../shared");

var _messageHelper = require("../messageHelper");

const completedSymbol = Symbol.for('completed');
const messageQSymbol = Symbol.for('messageQ');
const executeMessageSymbol = Symbol.for('executeMessage');
const referenceElementSymbol = Symbol.for('referenceElement');
const referenceInfoSymbol = Symbol.for('referenceInfo');

function ErrorEventDefinition(activity, eventDefinition) {
  const {
    id,
    broker,
    environment,
    isThrowing
  } = activity;
  const {
    type = 'ErrorEventDefinition',
    behaviour = {}
  } = eventDefinition;
  this.id = id;
  this.type = type;
  const reference = this.reference = {
    name: 'anonymous',
    ...behaviour.errorRef,
    referenceType: 'throw'
  };
  this.isThrowing = isThrowing;
  this.activity = activity;
  this.environment = environment;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());
  const referenceElement = this[referenceElementSymbol] = reference.id && activity.getActivityById(reference.id);

  if (!isThrowing) {
    this[completedSymbol] = false;
    const referenceId = referenceElement ? referenceElement.id : 'anonymous';
    const messageQueueName = `${reference.referenceType}-${(0, _shared.brokerSafeId)(id)}-${(0, _shared.brokerSafeId)(referenceId)}-q`;
    this[messageQSymbol] = broker.assertQueue(messageQueueName, {
      autoDelete: false,
      durable: true
    });
    broker.bindQueue(messageQueueName, 'api', `*.${reference.referenceType}.#`, {
      durable: true,
      priority: 300
    });
  }
}

const proto = ErrorEventDefinition.prototype;
Object.defineProperty(proto, 'executionId', {
  get() {
    const message = this[executeMessageSymbol];
    return message && message.content.executionId;
  }

});

proto.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};

proto.executeCatch = function executeCatch(executeMessage) {
  this[executeMessageSymbol] = executeMessage;
  this[completedSymbol] = false;
  const executeContent = (0, _messageHelper.cloneContent)(executeMessage.content);
  const {
    executionId,
    parent
  } = executeContent;
  const parentExecutionId = parent && parent.executionId;

  const info = this[referenceInfoSymbol] = this._getReferenceInfo(executeMessage);

  this[messageQSymbol].consume(this._onThrowApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_onthrow-${executionId}`
  });
  if (this[completedSymbol]) return;

  this._debug(`expect ${info.description}`);

  const broker = this.broker;
  broker.subscribeTmp('api', `activity.#.${executionId}`, this._onApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-${executionId}`
  });

  if (!this.environment.settings.strict) {
    const expectRoutingKey = `execute.throw.${executionId}`;
    broker.subscribeTmp('execution', expectRoutingKey, this._onErrorMessage.bind(this), {
      noAck: true,
      consumerTag: `_onerror-${executionId}`
    });
    broker.publish('execution', 'execute.expect', (0, _messageHelper.cloneContent)(executeContent, {
      expectRoutingKey,
      expect: { ...info.message
      }
    }));
    if (this[completedSymbol]) return this._stop();
  }

  const waitContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parentExecutionId,
    expect: { ...info.message
    }
  });
  waitContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.wait', waitContent);
};

proto.executeThrow = function executeThrow(executeMessage) {
  const executeContent = (0, _messageHelper.cloneContent)(executeMessage.content);
  const {
    executionId,
    parent
  } = executeContent;

  const info = this._getReferenceInfo(executeMessage);

  this.logger.debug(`<${executionId} (${this.activity.id})> throw ${info.description}`);
  const broker = this.broker;
  const throwContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parent.executionId,
    message: { ...info.message
    },
    state: 'throw'
  });
  throwContent.parent = (0, _messageHelper.shiftParent)(parent);
  this.broker.publish('event', 'activity.throw', throwContent, {
    type: 'throw',
    delegate: true
  });
  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
    message: { ...info.message
    }
  }));
};

proto._onErrorMessage = function onErrorMessage(routingKey, message) {
  const error = message.content.error;
  if (!this[referenceElementSymbol]) return this._catchError(routingKey, message, error);
  if (!error) return;
  const info = this[referenceInfoSymbol];
  if ('' + error.code !== '' + info.message.code) return;
  return this._catchError(routingKey, message, error);
};

proto._onThrowApiMessage = function onThrowApiMessage(routingKey, message) {
  const error = message.content.message;
  if (!this[referenceElementSymbol]) return this._catchError(routingKey, message, error);
  const info = this[referenceInfoSymbol];
  if (info.message.id !== (error && error.id)) return;
  return this._catchError(routingKey, message, error);
};

proto._catchError = function catchError(routingKey, message, error) {
  this[completedSymbol] = true;

  this._stop();

  this._debug(`caught ${this[referenceInfoSymbol].description}`);

  const executeContent = this[executeMessageSymbol].content;
  const parent = executeContent.parent;
  const catchContent = (0, _messageHelper.cloneContent)(executeContent, {
    source: {
      id: message.content.id,
      type: message.content.type,
      executionId: message.content.executionId
    },
    error,
    executionId: parent.executionId
  });
  catchContent.parent = (0, _messageHelper.shiftParent)(parent);
  const broker = this.broker;
  broker.publish('event', 'activity.catch', catchContent, {
    type: 'catch'
  });
  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
    output: error,
    cancelActivity: true,
    state: 'catch'
  }));
};

proto._onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;

  switch (messageType) {
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
  broker.cancel(`_onthrow-${executionId}`);
  broker.cancel(`_onerror-${executionId}`);
  broker.cancel(`_api-${executionId}`);
  this[messageQSymbol].purge();
};

proto._getReferenceInfo = function getReferenceInfo(message) {
  const referenceElement = this[referenceElementSymbol];

  if (!referenceElement) {
    return {
      message: { ...this.reference
      },
      description: 'anonymous error'
    };
  }

  const result = {
    message: referenceElement.resolve(message)
  };
  result.description = `${result.message.name} <${result.message.id}>`;
  if (result.message.code) result.description += ` code ${result.message.code}`;
  return result;
};

proto._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};