"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = EscalationEventDefinition;

var _messageHelper = require("../messageHelper");

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
  const {
    debug
  } = environment.Logger(type.toLowerCase());
  const reference = behaviour.escalationRef || {
    name: 'anonymous'
  };
  const source = {
    id,
    type,
    reference: { ...reference,
      referenceType: 'escalate'
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
    broker.subscribeTmp('api', '*.escalate.#', onEscalationApiMessage, {
      noAck: true,
      consumerTag: `_onescalate-${executionId}`,
      priority: 300
    });
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: `_api-${executionId}`
    });
    if (completed) return stop();
    const escalationMessage = getEscalation(executeMessage);
    debug(`<${executionId} (${id})>`, reference.id ? `waiting for escalation <${reference.id}> with name: ${escalationMessage.name}` : 'wait for anonymous escalation event');
    broker.publish('event', 'activity.wait', { ...messageContent,
      executionId: parentExecutionId,
      parent: (0, _messageHelper.shiftParent)(parent),
      escalation: { ...escalationMessage
      }
    });

    function onEscalationApiMessage(routingKey, message) {
      const output = message.content.message;
      if (output && output.id !== escalationMessage.id) return;
      completed = true;
      stop();
      debug(`<${executionId} (${id})> catch escalated`, reference.id ? `<${reference.id}> with name: ${escalationMessage.name}` : 'anonymous event');
      broker.publish('event', 'activity.catch', { ...messageContent,
        message: { ...output
        },
        executionId: parentExecutionId,
        parent: (0, _messageHelper.shiftParent)(executeMessage.content.parent)
      }, {
        type: 'catch'
      });
      return broker.publish('execution', 'execute.completed', { ...messageContent,
        output,
        state: 'catch'
      });
    }

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;

      switch (messageType) {
        case 'escalate':
          {
            return onEscalationApiMessage(routingKey, message);
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

    function stop() {
      broker.cancel(`_api-${executionId}`);
      broker.cancel(`_onescalate-${executionId}`);
    }
  }

  function executeThrow(executeMessage) {
    const messageContent = (0, _messageHelper.cloneContent)(executeMessage.content);
    const {
      executionId,
      parent
    } = messageContent;
    const parentExecutionId = parent && parent.executionId;
    const escalationMessage = getEscalation(executeMessage);
    debug(`<${executionId} (${id})> escalate`, reference.id ? `<${reference.id}> with name: ${escalationMessage.name}` : 'anonymous event');
    broker.publish('event', 'activity.escalate', { ...(0, _messageHelper.cloneContent)(messageContent),
      executionId: parentExecutionId,
      parent: (0, _messageHelper.shiftParent)(parent),
      message: { ...escalationMessage
      },
      state: 'throw'
    }, {
      type: 'escalate',
      delegate: true
    });
    return broker.publish('execution', 'execute.completed', { ...messageContent
    });
  }

  function getEscalation(message) {
    const result = { ...reference
    };
    if (result.name) result.name = environment.resolveExpression(reference.name, message);
    return result;
  }
}