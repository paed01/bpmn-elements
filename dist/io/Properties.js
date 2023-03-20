"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Properties;
var _getPropertyValue = _interopRequireDefault(require("../getPropertyValue.js"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const kProperties = Symbol.for('properties');
const kConsuming = Symbol.for('consuming');
function Properties(activity, propertiesDef, context) {
  this.activity = activity;
  this.broker = activity.broker;
  const props = this[kProperties] = {
    properties: [],
    dataInputObjects: [],
    dataOutputObjects: []
  };
  for (const {
    id,
    ...def
  } of propertiesDef.values) {
    const source = {
      id,
      type: def.type,
      name: def.behaviour && def.behaviour.name
    };
    props.properties.push(source);
    const inputDataObjectId = (0, _getPropertyValue.default)(def, 'behaviour.dataInput.association.source.dataObject.id');
    const outputDataObjectId = (0, _getPropertyValue.default)(def, 'behaviour.dataOutput.association.target.dataObject.id');
    const inputDataStoreId = (0, _getPropertyValue.default)(def, 'behaviour.dataInput.association.source.dataStore.id');
    const outputDataStoreId = (0, _getPropertyValue.default)(def, 'behaviour.dataOutput.association.target.dataStore.id');
    if (inputDataObjectId) {
      const reference = context.getDataObjectById(inputDataObjectId);
      props.dataInputObjects.push({
        id,
        reference
      });
      source.input = {
        reference
      };
    }
    if (outputDataObjectId) {
      const reference = context.getDataObjectById(outputDataObjectId);
      props.dataOutputObjects.push({
        id,
        reference: reference
      });
      source.output = {
        reference
      };
    }
    if (inputDataStoreId) {
      const reference = context.getDataStoreById(inputDataStoreId);
      props.dataInputObjects.push({
        id,
        reference
      });
      source.input = {
        reference
      };
    }
    if (outputDataStoreId) {
      const reference = context.getDataStoreById(outputDataStoreId);
      props.dataOutputObjects.push({
        id,
        reference
      });
      source.output = {
        reference
      };
    }
  }
}
Properties.prototype.activate = function activate(message) {
  if (this[kConsuming]) return;
  if (message.fields.redelivered && message.fields.routingKey === 'run.start') {
    this._onActivityEvent('activity.enter', message);
  }
  if (message.fields.redelivered && message.content.properties) {
    this._onActivityEvent('activity.extension.resume', message);
  }
  this[kConsuming] = this.broker.subscribeTmp('event', 'activity.#', this._onActivityEvent.bind(this), {
    noAck: true
  });
};
Properties.prototype.deactivate = function deactivate() {
  if (this[kConsuming]) this[kConsuming] = this[kConsuming].cancel();
};
Properties.prototype._onActivityEvent = function onActivityEvent(routingKey, message) {
  switch (routingKey) {
    case 'activity.enter':
    case 'activity.extension.resume':
      return this._formatOnEnter(message);
    case 'activity.execution.completed':
      return this._formatOnComplete(message);
  }
};
Properties.prototype._formatOnEnter = function formatOnEnter(message) {
  const startRoutingKey = 'run.enter.bpmn-properties';
  const dataInputObjects = this[kProperties].dataInputObjects;
  const broker = this.broker;
  if (!dataInputObjects.length) {
    return broker.getQueue('format-run-q').queueMessage({
      routingKey: startRoutingKey
    }, {
      properties: this._getProperties(message)
    });
  }
  const endRoutingKey = 'run.enter.bpmn-properties.end';
  broker.getQueue('format-run-q').queueMessage({
    routingKey: startRoutingKey
  }, {
    endRoutingKey,
    properties: this._getProperties(message)
  });
  return read(broker, dataInputObjects, (_, responses) => {
    broker.publish('format', endRoutingKey, {
      properties: this._getProperties(message, responses)
    });
  });
};
Properties.prototype._formatOnComplete = function formatOnComplete(message) {
  const startRoutingKey = 'run.end.bpmn-properties';
  const messageOutput = (0, _getPropertyValue.default)(message, 'content.output.properties') || {};
  const outputProperties = this._getProperties(message, messageOutput);
  const dataOutputObjects = this[kProperties].dataOutputObjects;
  const broker = this.broker;
  if (!dataOutputObjects.length) {
    return broker.getQueue('format-run-q').queueMessage({
      routingKey: startRoutingKey
    }, {
      properties: outputProperties
    });
  }
  const endRoutingKey = 'run.end.bpmn-properties.end';
  broker.getQueue('format-run-q').queueMessage({
    routingKey: startRoutingKey
  }, {
    endRoutingKey,
    properties: outputProperties
  });
  return write(broker, dataOutputObjects, outputProperties, (_, responses) => {
    broker.publish('format', endRoutingKey, {
      properties: this._getProperties(message, responses)
    });
  });
};
Properties.prototype._getProperties = function getProperties(message, values) {
  let response = {};
  if (message.content.properties) {
    response = {
      ...message.content.properties
    };
  }
  for (const {
    id,
    type,
    name
  } of this[kProperties].properties) {
    if (!(id in response)) {
      response[id] = {
        id,
        type,
        name
      };
    }
    if (!values || !(id in values)) continue;
    response[id].value = values[id].value;
  }
  return response;
};
function read(broker, dataReferences, callback) {
  const responses = {};
  let count = 0;
  const dataReadConsumer = broker.subscribeTmp('data', 'data.read.#', onDataReadResponse, {
    noAck: true
  });
  for (const {
    id: propertyId,
    reference
  } of dataReferences) {
    reference.read(broker, 'data', 'data.read.', {
      correlationId: propertyId
    });
  }
  function onDataReadResponse(routingKey, message) {
    responses[message.properties.correlationId] = {
      ...message.content
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
  for (const {
    id: propertyId,
    reference
  } of dataReferences) {
    const value = propertyId in properties ? properties[propertyId].value : undefined;
    reference.write(broker, 'data', 'data.write.', value, {
      correlationId: propertyId
    });
  }
  function onDataWriteResponse(routingKey, message) {
    responses[message.properties.correlationId] = {
      ...message.content
    };
    if (++count < dataReferences.length) return;
    dataWriteConsumer.cancel();
    return callback(null, responses);
  }
}