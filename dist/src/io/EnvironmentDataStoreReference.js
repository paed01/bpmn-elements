"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = EnvironmentDataStoreReference;

function EnvironmentDataStoreReference(dataStoreRefDef, {
  environment
}) {
  const {
    id,
    type,
    name,
    behaviour,
    parent
  } = dataStoreRefDef;
  const source = {
    id,
    name,
    type,
    behaviour,
    parent,

    read(broker, exchange, routingKeyPrefix, messageProperties) {
      const value = environment.variables._data && environment.variables._data[id];
      return broker.publish(exchange, `${routingKeyPrefix}response`, {
        id,
        name,
        type,
        value
      }, messageProperties);
    },

    write(broker, exchange, routingKeyPrefix, value, messageProperties) {
      environment.variables._data = environment.variables._data || {};
      environment.variables._data[id] = value;
      return broker.publish(exchange, `${routingKeyPrefix}response`, {
        id,
        name,
        type,
        value
      }, messageProperties);
    }

  };
  return source;
}