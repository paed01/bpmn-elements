"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = MessageEventDefinition;

var _messageHelper = require("../messageHelper");

function MessageEventDefinition(activity, eventDefinition) {
  const {
    id,
    broker,
    environment,
    getActivityById
  } = activity;
  const {
    type = 'MessageEventDefinition',
    behaviour = {}
  } = eventDefinition;
  const {
    debug
  } = environment.Logger(type.toLowerCase());
  const reference = behaviour.messageRef || {
    name: 'anonymous'
  };
  const referenceElement = reference.id && getActivityById(reference.id);
  const source = {
    id,
    type,
    reference: { ...reference,
      referenceType: 'message'
    },
    execute
  };
  return source;

  function execute(executeMessage) {
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
    } = resolveReference(executeMessage);
    const messagesQ = broker.assertQueue('messages', {
      autoDelete: false,
      durable: true
    });
    messagesQ.consume(onMessage, {
      noAck: true,
      consumerTag: `_message-${executionId}`
    });
    if (completed) return;
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: `_api-${executionId}`,
      priority: 300
    });
    broker.subscribeOnce('api', `activity.signal.${parentExecutionId}`, onApiMessage, {
      consumerTag: `_parent-signal-${executionId}`
    });
    debug(`<${executionId} (${id})> expect ${description}`);
    broker.publish('event', 'activity.wait', { ...messageContent,
      executionId: parentExecutionId,
      parent: (0, _messageHelper.shiftParent)(parent),
      message: { ...referenceMessage
      }
    });

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;

      switch (messageType) {
        case 'signal':
          {
            completed = true;
            stop();
            return signal(routingKey, {
              message: message.content.message
            });
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
          }
      }
    }

    function signal(_, {
      message
    }) {
      completed = true;
      debug(`<${executionId} (${id})> caught ${description}`);
      broker.publish('event', 'activity.catch', { ...messageContent,
        executionId: parentExecutionId,
        parent: (0, _messageHelper.shiftParent)(executeMessage.content.parent)
      }, {
        type: 'catch'
      });
      return broker.publish('execution', 'execute.completed', { ...messageContent,
        output: message,
        state: 'signal'
      });
    }

    function stop() {
      broker.cancel(`_message-${executionId}`);
      broker.cancel(`_api-${executionId}`);
      broker.cancel(`_parent-signal-${executionId}`);
    }

    function onMessage(routingKey, {
      content
    }) {
      stop();
      signal(routingKey, {
        message: content
      });
    }
  }

  function resolveReference(message) {
    if (!referenceElement) {
      return {
        message: { ...reference
        },
        description: 'anonymous message'
      };
    }

    const result = {
      message: referenceElement.resolve(message)
    };
    result.description = `${result.message.name} <${result.message.id}>`;
    return result;
  }
}