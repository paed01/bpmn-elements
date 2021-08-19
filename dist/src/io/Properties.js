"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Properties;

var _getPropertyValue = _interopRequireDefault(require("../getPropertyValue"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function Properties(activity, propertiesDef, context) {
  if (!propertiesDef || !propertiesDef.values || !propertiesDef.values.length) return;
  const {
    broker,
    environment
  } = activity;
  const formatQ = broker.getQueue('format-run-q');
  let activityConsumer;
  const {
    properties,
    dataInputObjects,
    dataOutputObjects
  } = propertiesDef.values.reduce((result, {
    id,
    ...def
  }) => {
    const source = {
      id,
      type: def.type,
      name: def.name
    };
    result.properties.push(source);
    const inputDataObjectId = (0, _getPropertyValue.default)(def, 'behaviour.dataInput.association.source.dataObject.id');
    const outputDataObjectId = (0, _getPropertyValue.default)(def, 'behaviour.dataOutput.association.target.dataObject.id');
    const inputDataStoreId = (0, _getPropertyValue.default)(def, 'behaviour.dataInput.association.source.dataStore.id');
    const outputDataStoreId = (0, _getPropertyValue.default)(def, 'behaviour.dataOutput.association.target.dataStore.id');

    if (inputDataObjectId) {
      const reference = context.getDataObjectById(inputDataObjectId);
      result.dataInputObjects.push({
        id,
        reference
      });
      source.input = {
        reference
      };
    }

    if (outputDataObjectId) {
      const reference = context.getDataObjectById(outputDataObjectId);
      result.dataOutputObjects.push({
        id,
        reference: reference
      });
      source.output = {
        reference
      };
    }

    if (inputDataStoreId) {
      const reference = context.getDataStoreById(inputDataStoreId);
      result.dataInputObjects.push({
        id,
        reference
      });
      source.input = {
        reference
      };
    }

    if (outputDataStoreId) {
      const reference = context.getDataStoreById(outputDataStoreId);
      result.dataOutputObjects.push({
        id,
        reference
      });
      source.output = {
        reference
      };
    }

    return result;
  }, {
    properties: [],
    dataInputObjects: [],
    dataOutputObjects: []
  });
  const propertiesApi = {
    type: 'properties',
    activate,
    deactivate
  };
  return propertiesApi;

  function activate(message) {
    if (activityConsumer) return;

    if (message.fields.redelivered && message.content.properties) {
      onActivityEvent('activity.extension.resume', message);
    }

    activityConsumer = broker.subscribeTmp('event', 'activity.#', onActivityEvent, {
      noAck: true
    });
  }

  function deactivate() {
    if (activityConsumer) activityConsumer = activityConsumer.cancel();
  }

  function onActivityEvent(routingKey, message) {
    if (routingKey === 'activity.enter') {
      return formatOnEnter(message);
    }

    if (routingKey === 'activity.extension.resume') {
      return formatOnEnter(message);
    }

    if (routingKey === 'activity.execution.completed') {
      return formatOnComplete(message);
    }
  }

  function formatOnEnter(message) {
    const startRoutingKey = 'run.enter.bpmn-properties';

    if (!dataInputObjects.length) {
      return formatQ.queueMessage({
        routingKey: startRoutingKey
      }, {
        properties: getProperties(message)
      });
    }

    const endRoutingKey = 'run.enter.bpmn-properties.end';
    formatQ.queueMessage({
      routingKey: startRoutingKey
    }, {
      endRoutingKey,
      properties: getProperties(message)
    });
    return read(broker, dataInputObjects, (_, responses) => {
      broker.publish('format', endRoutingKey, {
        properties: getProperties(message, responses)
      });
    });
  }

  function formatOnComplete(message) {
    const startRoutingKey = 'run.end.bpmn-properties';
    const messageOutput = (0, _getPropertyValue.default)(message, 'content.output.properties') || {};
    const outputProperties = getProperties(message, messageOutput);

    if (!dataOutputObjects.length) {
      return formatQ.queueMessage({
        routingKey: startRoutingKey
      }, {
        properties: outputProperties
      });
    }

    const endRoutingKey = 'run.end.bpmn-properties.end';
    formatQ.queueMessage({
      routingKey: startRoutingKey
    }, {
      endRoutingKey,
      properties: outputProperties
    });
    return write(broker, dataOutputObjects, outputProperties, (_, responses) => {
      broker.publish('format', endRoutingKey, {
        properties: getProperties(message, responses)
      });
    });
  }

  function getProperties(message, values) {
    let response = {};

    if (message.content.properties) {
      response = { ...message.content.properties
      };
    }

    return properties.reduce((result, {
      id,
      type,
      name,
      value
    }) => {
      if (!(id in result)) {
        result[id] = {
          id,
          type,
          name
        };
      }

      if (value !== undefined) result[id].value = environment.resolveExpression(value, message);
      if (!values || !(id in values)) return result;
      result[id].value = values[id].value;
      return result;
    }, response);
  }
}

function read(broker, dataReferences, callback) {
  const responses = {};
  let count = 0;
  const dataReadConsumer = broker.subscribeTmp('data', 'data.read.#', onDataReadResponse, {
    noAck: true
  });

  for (let i = 0; i < dataReferences.length; i++) {
    const {
      id: propertyId,
      reference
    } = dataReferences[i];
    reference.read(broker, 'data', 'data.read.', {
      correlationId: propertyId
    });
  }

  function onDataReadResponse(routingKey, message) {
    responses[message.properties.correlationId] = { ...message.content
    };
    if (++count < dataReferences.length) return;
    dataReadConsumer.cancel();
    return callback(null, responses);
  }
}

function write(broker, dataReferences, properties, callback) {
  const responses = [];
  let count = 0;
  const dataWriteConsumer = broker.subscribeTmp('data', 'data.write.#', onDataWriteResponse, {
    noAck: true
  });

  for (let i = 0; i < dataReferences.length; i++) {
    const {
      id: propertyId,
      reference
    } = dataReferences[i];
    const value = propertyId in properties ? properties[propertyId].value : undefined;
    reference.write(broker, 'data', 'data.write.', value, {
      correlationId: propertyId
    });
  }

  function onDataWriteResponse(routingKey, message) {
    responses[message.properties.correlationId] = { ...message.content
    };
    if (++count < dataReferences.length) return;
    dataWriteConsumer.cancel();
    return callback(null, responses);
  }
}