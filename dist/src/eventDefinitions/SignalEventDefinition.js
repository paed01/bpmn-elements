"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = SignalEventDefinition;

var _getPropertyValue = _interopRequireDefault(require("../getPropertyValue"));

var _shared = require("../shared");

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function SignalEventDefinition(activity, eventDefinition) {
  const {
    id,
    broker,
    environment,
    isThrowing,
    getActivityById
  } = activity;
  const {
    type,
    behaviour = {}
  } = eventDefinition;
  const {
    debug
  } = environment.Logger(type.toLowerCase());
  const reference = behaviour.signalRef || {
    name: 'anonymous'
  };
  const referenceElement = reference.id && getActivityById(reference.id);
  const signalId = referenceElement ? referenceElement.id : 'anonymous';
  const signalQueueName = `signal-${(0, _shared.brokerSafeId)(id)}-${(0, _shared.brokerSafeId)(signalId)}-q`;
  if (!isThrowing) setupCatch();
  const source = {
    id,
    type,
    reference: { ...reference,
      referenceType: 'signal'
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
    broker.consume(signalQueueName, onSignalApiMessage, {
      noAck: true,
      consumerTag: `_api-signal-${executionId}`
    });
    if (completed) return;
    broker.subscribeTmp('api', `activity.stop.${parentExecutionId}`, onApiMessage, {
      noAck: true,
      consumerTag: `_api-parent-${parentExecutionId}`
    });
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: `_api-${executionId}`
    });
    debug(`<${executionId} (${id})> expect ${description}`);
    broker.publish('event', 'activity.wait', { ...messageContent,
      executionId: parentExecutionId,
      parent: (0, _messageHelper.shiftParent)(parent),
      signal: { ...referenceMessage
      }
    });

    function onSignalApiMessage(routingKey, message) {
      if ((0, _getPropertyValue.default)(message, 'content.message.id') !== referenceMessage.id) return;
      completed = true;
      stop();
      return signal(routingKey, {
        message: message.content.message
      });
    }

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;

      switch (messageType) {
        case 'signal':
          {
            return onSignalApiMessage(routingKey, message);
          }

        case 'discard':
          {
            completed = true;
            stop();
            return broker.publish('execution', 'execute.discard', { ...messageContent
            });
          }

        case 'stop':
          {
            stop();
            break;
          }
      }
    }

    function signal(_, {
      message
    }) {
      completed = true;
      debug(`<${executionId} (${id})> signaled with`, description);
      return broker.publish('execution', 'execute.completed', { ...messageContent,
        output: message,
        state: 'signal'
      });
    }

    function stop() {
      broker.cancel(`_api-signal-${executionId}`);
      broker.cancel(`_api-parent-${parentExecutionId}`);
      broker.cancel(`_api-${executionId}`);
      broker.purgeQueue(signalQueueName);
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
    broker.publish('event', 'activity.signal', { ...(0, _messageHelper.cloneContent)(messageContent),
      executionId: parentExecutionId,
      parent: (0, _messageHelper.shiftParent)(parent),
      message: { ...referenceMessage
      },
      state: 'throw'
    }, {
      type: 'signal'
    });
    return broker.publish('execution', 'execute.completed', messageContent);
  }

  function resolveMessage(message) {
    if (!referenceElement) {
      return {
        message: { ...reference
        },
        description: 'anonymous signal'
      };
    }

    const result = {
      message: referenceElement.resolve(message)
    };
    result.description = `${result.message.name} <${result.message.id}>`;
    return result;
  }

  function setupCatch() {
    broker.assertQueue(signalQueueName, {
      autoDelete: false,
      durable: true
    });
    broker.bindQueue(signalQueueName, 'api', '*.signal.#', {
      durable: true
    });
  }
}