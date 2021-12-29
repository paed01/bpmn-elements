"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = IoSpecification;

var _getPropertyValue = _interopRequireDefault(require("../getPropertyValue"));

var _shared = require("../shared");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function IoSpecification(activity, ioSpecificationDef, context) {
  const {
    id,
    type = 'iospecification',
    behaviour = {}
  } = ioSpecificationDef;
  const {
    broker
  } = activity;
  const safeType = (0, _shared.brokerSafeId)(type).toLowerCase();
  let activityConsumer;
  const {
    dataInputs,
    dataOutputs
  } = behaviour;
  const ioApi = {
    id,
    type,
    behaviour,
    activate,
    deactivate
  };
  return ioApi;

  function activate() {
    if (activityConsumer) return;
    activityConsumer = broker.subscribeTmp('event', 'activity.#', onActivityEvent, {
      noAck: true
    });
  }

  function deactivate() {
    if (activityConsumer) activityConsumer = activityConsumer.cancel();
  }

  function onActivityEvent(routingKey, message) {
    if ((dataInputs || dataOutputs) && routingKey === 'activity.enter') {
      return formatOnEnter();
    }

    if (dataOutputs && routingKey === 'activity.execution.completed') {
      formatOnComplete(message);
    }
  }

  function formatOnEnter() {
    const startRoutingKey = `run.onstart.${safeType}`;

    if (!dataInputs) {
      return broker.publish('format', startRoutingKey, {
        ioSpecification: {
          dataOutputs: getDataOutputs()
        }
      });
    }

    const {
      dataObjects,
      sources
    } = dataInputs.reduce((result, ioSource, index) => {
      const source = {
        id: ioSource.id,
        type: ioSource.type,
        name: ioSource.name
      };
      result.sources.push(source);
      const dataObjectId = (0, _getPropertyValue.default)(ioSource, 'behaviour.association.source.dataObject.id');
      if (!dataObjectId) return result;
      const dataObject = context.getDataObjectById(dataObjectId);
      if (!dataObject) return result;
      result.dataObjects.push({
        index,
        dataObject
      });
      return result;
    }, {
      dataObjects: [],
      sources: []
    });

    if (!dataObjects.length) {
      return broker.publish('format', startRoutingKey, {
        ioSpecification: {
          dataInputs: sources,
          dataOutputs: getDataOutputs()
        }
      });
    }

    const endRoutingKey = `run.onstart.${safeType}.end`;
    broker.publish('format', `${startRoutingKey}.begin`, {
      endRoutingKey,
      ioSpecification: {
        dataInputs: sources.map(source => {
          return { ...source
          };
        }),
        dataOutputs: getDataOutputs()
      }
    });
    return read(broker, dataObjects, (_, responses) => {
      for (const response of responses) sources[response.index].value = response.value;

      broker.publish('format', endRoutingKey, {
        ioSpecification: {
          dataInputs: sources,
          dataOutputs: getDataOutputs()
        }
      });
    });
  }

  function formatOnComplete(message) {
    const messageInputs = (0, _getPropertyValue.default)(message, 'content.ioSpecification.dataInputs');
    const messageOutputs = (0, _getPropertyValue.default)(message, 'content.output.ioSpecification.dataOutputs') || [];
    const {
      dataObjects,
      sources
    } = dataOutputs.reduce((result, ioSource, index) => {
      const {
        value
      } = messageOutputs.find(output => output.id === ioSource.id) || {};
      const source = {
        id: ioSource.id,
        type: ioSource.type,
        name: ioSource.name,
        value
      };
      result.sources.push(source);
      const dataObjectId = (0, _getPropertyValue.default)(ioSource, 'behaviour.association.target.dataObject.id');
      if (!dataObjectId) return result;
      const dataObject = context.getDataObjectById(dataObjectId);
      if (!dataObject) return result;
      result.dataObjects.push({
        index,
        dataObject,
        value
      });
      return result;
    }, {
      dataObjects: [],
      sources: []
    });
    const startRoutingKey = `run.onend.${safeType}`;

    if (!dataObjects.length) {
      return broker.publish('format', startRoutingKey, {
        ioSpecification: {
          dataInputs: messageInputs,
          dataOutputs: sources
        }
      });
    }

    const endRoutingKey = `run.onend.${safeType}.end`;
    broker.publish('format', `${startRoutingKey}.begin`, {
      endRoutingKey,
      ioSpecification: {
        dataInputs: sources.map(input => {
          return { ...input
          };
        }),
        dataOutputs: getDataOutputs()
      }
    });
    return write(broker, dataObjects, (_, responses) => {
      for (const response of responses) sources[response.index].value = response.value;

      broker.publish('format', endRoutingKey, {
        ioSpecification: {
          dataInputs: sources,
          dataOutputs: getDataOutputs()
        }
      });
    });
  }

  function getDataOutputs() {
    if (!dataOutputs) return;
    return dataOutputs.map(dataOutput => {
      return {
        id: dataOutput.id,
        type: dataOutput.type,
        name: dataOutput.name
      };
    });
  }
}

function read(broker, dataObjectRefs, callback) {
  const responses = [];
  let count = 0;
  const dataReadConsumer = broker.subscribeTmp('data', 'data.read.#', onDataObjectResponse, {
    noAck: true
  });

  for (const {
    dataObject
  } of dataObjectRefs) {
    dataObject.read(broker, 'data', 'data.read.');
  }

  function onDataObjectResponse(routingKey, message) {
    const {
      index
    } = dataObjectRefs.find(({
      dataObject
    }) => dataObject.id === message.content.id);
    responses.push({ ...message.content,
      index
    });
    ++count;
    if (count < dataObjectRefs.length) return;
    dataReadConsumer.cancel();
    return callback(null, responses);
  }
}

function write(broker, dataObjectRefs, callback) {
  const responses = [];
  let count = 0;
  const dataWriteConsumer = broker.subscribeTmp('data', 'data.write.#', onDataObjectResponse, {
    noAck: true
  });

  for (const {
    dataObject,
    value
  } of dataObjectRefs) {
    dataObject.write(broker, 'data', 'data.write.', value);
  }

  function onDataObjectResponse(routingKey, message) {
    const idx = dataObjectRefs.findIndex(dobj => dobj.id === message.content.id);
    responses[idx] = message.content;
    ++count;
    if (count < dataObjectRefs.length) return;
    dataWriteConsumer.cancel();
    return callback(null, responses);
  }
}