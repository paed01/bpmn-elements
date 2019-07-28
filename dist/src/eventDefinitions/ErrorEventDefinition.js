"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ErrorEventDefinition;

var _shared = require("../shared");

var _messageHelper = require("../messageHelper");

function ErrorEventDefinition(activity, eventDefinition) {
  const {
    id,
    broker,
    environment,
    getActivityById,
    isThrowing
  } = activity;
  const {
    type = 'ErrorEventDefinition',
    behaviour = {}
  } = eventDefinition;
  const {
    debug
  } = environment.Logger(type.toLowerCase());
  const reference = behaviour.errorRef || {
    name: 'anonymous'
  };
  const referenceElement = reference.id && getActivityById(reference.id);
  const errorId = referenceElement ? referenceElement.id : 'anonymous';
  const errorQueueName = `error-${(0, _shared.brokerSafeId)(id)}-${(0, _shared.brokerSafeId)(errorId)}-q`;
  if (!isThrowing) setupCatch();
  const source = {
    type,
    reference: { ...reference,
      referenceType: 'throw'
    },
    execute: isThrowing ? executeThrow : executeCatch
  };
  return source;

  function executeCatch(executeMessage) {
    let completed;
    const messageContent = (0, _messageHelper.cloneContent)(executeMessage.content);
    const {
      executionId,
      parent
    } = messageContent;
    const parentExecutionId = parent && parent.executionId;
    const {
      message: referenceMessage,
      description
    } = resolveMessage(executeMessage);
    broker.consume(errorQueueName, onThrowApiMessage, {
      noAck: true,
      consumerTag: `_onthrow-${executionId}`
    });
    if (completed) return;
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: `_api-${executionId}`
    });

    if (!environment.settings.strict) {
      const expectRoutingKey = `execute.throw.${executionId}`;
      broker.publish('execution', 'execute.expect', { ...(0, _messageHelper.cloneContent)(messageContent),
        expectRoutingKey,
        expect: { ...referenceMessage
        }
      });
      broker.subscribeOnce('execution', expectRoutingKey, onErrorMessage, {
        consumerTag: `_onerror-${executionId}`
      });
    }

    if (completed) return stop();
    debug(`<${executionId} (${id})> expect ${description}`);
    broker.publish('event', 'activity.wait', { ...messageContent,
      executionId: parentExecutionId,
      parent: (0, _messageHelper.shiftParent)(parent),
      expect: { ...referenceMessage
      }
    });

    function onErrorMessage(routingKey, message) {
      const error = message.content.error;
      if (!referenceElement) return catchError(routingKey, message, error);
      if (!error) return;
      if ('' + error.code !== '' + referenceMessage.code) return;
      return catchError(routingKey, message, error);
    }

    function onThrowApiMessage(routingKey, message) {
      const error = message.content.message;
      if (!referenceElement) return catchError(routingKey, message, error);
      if (referenceMessage.id !== (error && error.id)) return;
      return catchError(routingKey, message, error);
    }

    function catchError(routingKey, message, error) {
      completed = true;
      stop();
      debug(`<${executionId} (${id})> caught ${description}`);
      broker.publish('event', 'activity.catch', { ...messageContent,
        source: {
          id: message.content.id,
          type: message.content.type,
          executionId: message.content.executionId
        },
        error,
        executionId: parentExecutionId,
        parent: (0, _messageHelper.shiftParent)(executeMessage.content.parent)
      }, {
        type: 'catch'
      });
      return broker.publish('execution', 'execute.completed', { ...messageContent,
        output: error,
        cancelActivity: true,
        state: 'catch'
      });
    }

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;

      switch (messageType) {
        case 'discard':
          {
            completed = true;
            stop();
            return broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(messageContent));
          }

        case 'stop':
          {
            stop();
            break;
          }
      }
    }

    function stop() {
      broker.cancel(`_onthrow-${executionId}`);
      broker.cancel(`_onerror-${executionId}`);
      broker.cancel(`_api-${executionId}`);
      broker.purgeQueue(errorQueueName);
    }
  }

  function executeThrow(executeMessage) {
    const messageContent = (0, _messageHelper.cloneContent)(executeMessage.content);
    const {
      executionId,
      parent
    } = messageContent;
    const parentExecutionId = parent && parent.executionId;
    const {
      message: referenceMessage,
      description
    } = resolveMessage(executeMessage);
    debug(`<${executionId} (${id})> throw ${description}`);
    broker.publish('event', 'activity.throw', { ...(0, _messageHelper.cloneContent)(messageContent),
      executionId: parentExecutionId,
      parent: (0, _messageHelper.shiftParent)(parent),
      message: { ...referenceMessage
      },
      state: 'throw'
    }, {
      type: 'throw',
      delegate: true
    });
    return broker.publish('execution', 'execute.completed', { ...messageContent,
      message: referenceMessage
    });
  }

  function resolveMessage(message) {
    if (!referenceElement) {
      return {
        message: { ...reference
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
  }

  function setupCatch() {
    broker.assertQueue(errorQueueName, {
      autoDelete: false,
      durable: true
    });
    broker.bindQueue(errorQueueName, 'api', '*.throw.#', {
      durable: true,
      priority: 300
    });
  }
}