"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ErrorEventDefinition;

var _Errors = require("../error/Errors");

var _messageHelper = require("../messageHelper");

function ErrorEventDefinition(activity, eventDefinition) {
  const {
    id,
    broker,
    environment,
    attachedTo,
    getErrorById,
    isThrowing
  } = activity;
  const {
    type = 'ErrorEventDefinition',
    behaviour = {}
  } = eventDefinition;
  const {
    debug
  } = environment.Logger(type.toLowerCase());
  const errorRef = behaviour.errorRef;
  let errorListener;
  const source = {
    type,
    errorRef,
    execute,

    get expect() {
      return errorRef;
    }

  };
  return source;

  function execute(executeMessage) {
    return isThrowing ? executeThrow(executeMessage) : executeCatch(executeMessage);
  }

  function executeCatch(executeMessage) {
    const attachedToBroker = attachedTo.broker;
    const messageContent = executeMessage.content;
    const {
      executionId,
      index,
      parent
    } = messageContent;
    const parentExecutionId = parent.executionId;
    const apiConsumerTag = `_api-${executionId}_${index}`;
    const errorConsumerTag = `_onerror-${executionId}_${index}`;
    let expect;

    if (executeMessage.fields.redelivered) {
      if (messageContent.expect) {
        expect = { ...messageContent.expect
        };
      }
    } else {
      expect = getErrorBehaviour(executeMessage);
    }

    broker.publish('execution', 'execute.try', { ...messageContent,
      expect: expect && { ...expect
      }
    });
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: apiConsumerTag
    });
    debug(`<${executionId} (${id})> listen for ${expect && expect.errorCode || 'any'} error from <${attachedTo.id}>`);
    attachedToBroker.subscribeTmp('execution', 'execute.error', onError, {
      priority: 200,
      consumerTag: errorConsumerTag
    });

    function onError(routingKey, {
      content
    }) {
      const {
        error
      } = content;
      if (expect && error.code !== expect.errorCode) return;
      stop();
      debug(`<${executionId} (${id})> caught ${expect && expect.errorCode || 'any'} error from <${content.executionId}>:`, error.message);
      broker.publish('event', 'activity.catch', { ...messageContent,
        executionId: parentExecutionId,
        parent: (0, _messageHelper.shiftParent)(executeMessage.content.parent),
        error
      });
      broker.publish('execution', 'execute.completed', { ...messageContent,
        expect: { ...expect
        },
        message: {
          error: { ...error
          }
        },
        output: { ...error
        }
      });
    }

    function onApiMessage(routingKey, message) {
      const apiMessageType = message.properties.type;

      if (apiMessageType === 'stop') {
        stop();
        if (errorListener) errorListener = errorListener.cancel();
        return debug(`<${executionId} (${id})> stopped`);
      }

      if (message.properties.type === 'discard') {
        stop();
        if (errorListener) errorListener = errorListener.cancel();
        debug(`<${executionId} (${id})> discarded`);
        return broker.publish('execution', 'execute.discard', { ...messageContent,
          state: 'discard'
        });
      }
    }

    function stop() {
      attachedToBroker.cancel(errorConsumerTag);
      broker.cancel(apiConsumerTag);
    }
  }

  function executeThrow(executeMessage) {
    const messageContent = executeMessage.content;
    const {
      executionId
    } = messageContent;
    const errorBehaviour = getErrorBehaviour(executeMessage);
    const error = createError();
    debug(`<${id}> throwing error <${error.code || 'unknown'}>`);
    broker.publish('execution', 'execute.error', { ...executeMessage.content,
      error
    }, {
      bubbles: true,
      mandatory: true
    });

    function createError() {
      const message = `<${executionId} (${id})> ${type}`;
      if (errorBehaviour) return new _Errors.BpmnError(message, errorBehaviour, executeMessage);
      return new _Errors.ActivityError(message, executeMessage);
    }
  }

  function getErrorBehaviour(message, inner) {
    if (!errorRef) return;
    const errorInstance = errorRef && getErrorById(errorRef.id);
    if (!errorInstance) return;
    return errorInstance.resolve(message, inner);
  }
}