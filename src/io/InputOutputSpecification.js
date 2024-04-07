import getPropertyValue from '../getPropertyValue.js';
import { brokerSafeId } from '../shared.js';

const kConsuming = Symbol.for('consuming');

export default function IoSpecification(activity, ioSpecificationDef, context) {
  const { id, type = 'iospecification', behaviour = {} } = ioSpecificationDef;
  this.id = id;
  this.type = type;
  this.behaviour = behaviour;
  this.activity = activity;
  this.broker = activity.broker;
  this.context = context;
}

IoSpecification.prototype.activate = function activate(message) {
  if (this[kConsuming]) return;
  if (message && message.fields.redelivered && message.fields.routingKey === 'run.start') {
    this._onFormatEnter();
  }
  if (message && message.fields.redelivered && message.fields.routingKey === 'run.end') {
    this._onFormatComplete(message);
  }
  this[kConsuming] = this.broker.subscribeTmp('event', 'activity.#', this._onActivityEvent.bind(this), { noAck: true });
};

IoSpecification.prototype.deactivate = function deactivate() {
  if (this[kConsuming]) this[kConsuming] = this[kConsuming].cancel();
};

IoSpecification.prototype._onActivityEvent = function onActivityEvent(routingKey, message) {
  const { dataInputs, dataOutputs } = this.behaviour;
  if ((dataInputs || dataOutputs) && routingKey === 'activity.enter') {
    return this._onFormatEnter();
  }

  if (dataOutputs && routingKey === 'activity.execution.completed') {
    this._onFormatComplete(message);
  }
};

IoSpecification.prototype._onFormatEnter = function onFormatOnEnter() {
  const safeType = brokerSafeId(this.type).toLowerCase();
  const startRoutingKey = `run.onstart.${safeType}`;
  const { dataInputs, dataOutputs } = this.behaviour;
  const broker = this.broker;
  if (!dataInputs) {
    return broker.publish('format', startRoutingKey, {
      ioSpecification: {
        dataOutputs: this._getDataOutputs(dataOutputs),
      },
    });
  }

  const { dataObjects, sources } = dataInputs.reduce(
    (result, ioSource, index) => {
      const source = {
        id: ioSource.id,
        type: ioSource.type,
        name: ioSource.name,
      };
      result.sources.push(source);

      const dataObjectId = getPropertyValue(ioSource, 'behaviour.association.source.dataObject.id');
      if (!dataObjectId) return result;
      const dataObject = this.context.getDataObjectById(dataObjectId);
      if (!dataObject) return result;
      result.dataObjects.push({ index, dataObject });
      return result;
    },
    {
      dataObjects: [],
      sources: [],
    },
  );

  if (!dataObjects.length) {
    return broker.publish('format', startRoutingKey, {
      ioSpecification: {
        dataInputs: sources,
        dataOutputs: this._getDataOutputs(dataOutputs),
      },
    });
  }

  const endRoutingKey = `run.onstart.${safeType}.end`;
  broker.publish('format', `${startRoutingKey}.begin`, {
    endRoutingKey,
    ioSpecification: {
      dataInputs: sources.map((source) => {
        return { ...source };
      }),
      dataOutputs: this._getDataOutputs(dataOutputs),
    },
  });

  return read(broker, dataObjects, (_, responses) => {
    for (const response of responses) sources[response.index].value = response.value;

    broker.publish('format', endRoutingKey, {
      ioSpecification: {
        dataInputs: sources,
        dataOutputs: this._getDataOutputs(dataOutputs),
      },
    });
  });
};

IoSpecification.prototype._onFormatComplete = function formatOnComplete(message) {
  const safeType = brokerSafeId(this.type).toLowerCase();
  const messageInputs = getPropertyValue(message, 'content.ioSpecification.dataInputs');
  const messageOutputs = getPropertyValue(message, 'content.output.ioSpecification.dataOutputs') || [];
  const dataOutputs = this.behaviour.dataOutputs;
  const broker = this.broker;
  const context = this.context;

  const { dataObjects, sources } = dataOutputs.reduce(
    (result, ioSource, index) => {
      const { value } = messageOutputs.find((output) => output.id === ioSource.id) || {};
      const source = {
        id: ioSource.id,
        type: ioSource.type,
        name: ioSource.name,
        value,
      };
      result.sources.push(source);

      const dataObjectId = getPropertyValue(ioSource, 'behaviour.association.target.dataObject.id');
      if (!dataObjectId) return result;
      const dataObject = context.getDataObjectById(dataObjectId);
      if (!dataObject) return result;
      result.dataObjects.push({ index, dataObject, value });
      return result;
    },
    {
      dataObjects: [],
      sources: [],
    },
  );

  const startRoutingKey = `run.onend.${safeType}`;
  if (!dataObjects.length) {
    return broker.publish('format', startRoutingKey, {
      ioSpecification: {
        dataInputs: messageInputs,
        dataOutputs: sources,
      },
    });
  }

  const endRoutingKey = `run.onend.${safeType}.end`;
  broker.publish('format', `${startRoutingKey}.begin`, {
    endRoutingKey,
    ioSpecification: {
      ...(messageInputs && {
        dataInputs: messageInputs.map((input) => {
          return { ...input };
        }),
      }),
      dataOutputs: this._getDataOutputs(dataOutputs),
    },
  });

  return write(broker, dataObjects, (_, responses) => {
    for (const response of responses) sources[response.index].value = response.value;

    broker.publish('format', endRoutingKey, {
      ioSpecification: {
        ...(messageInputs && {
          dataInputs: messageInputs.map((input) => {
            return { ...input };
          }),
        }),
        dataOutputs: sources,
      },
    });
  });
};

IoSpecification.prototype._getDataOutputs = function getDataOutputs(dataOutputs) {
  if (!dataOutputs) return;
  return dataOutputs.map((dataOutput) => {
    return {
      id: dataOutput.id,
      type: dataOutput.type,
      name: dataOutput.name,
    };
  });
};

function read(broker, dataObjectRefs, callback) {
  const responses = [];
  let count = 0;
  const dataReadConsumer = broker.subscribeTmp('data', 'data.read.#', onDataObjectResponse, { noAck: true });

  for (const { dataObject } of dataObjectRefs) {
    dataObject.read(broker, 'data', 'data.read.');
  }

  function onDataObjectResponse(routingKey, message) {
    const { index } = dataObjectRefs.find(({ dataObject }) => dataObject.id === message.content.id);
    responses.push({ ...message.content, index });

    ++count;

    if (count < dataObjectRefs.length) return;

    dataReadConsumer.cancel();
    return callback(null, responses);
  }
}

function write(broker, dataObjectRefs, callback) {
  const responses = [];
  let count = 0;
  broker.subscribeTmp('data', 'data.write.#', onDataObjectResponse, { noAck: true });

  for (const { dataObject, value } of dataObjectRefs) {
    dataObject.write(broker, 'data', 'data.write.', value);
  }

  function onDataObjectResponse(routingKey, message) {
    const idx = dataObjectRefs.findIndex(({ dataObject }) => dataObject.id === message.content.id);
    responses[idx] = { index: idx, ...message.content };

    ++count;

    if (count < dataObjectRefs.length) return;

    broker.cancel(message.fields.consumerTag);
    return callback(null, responses);
  }
}
