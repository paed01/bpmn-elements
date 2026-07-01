"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EnvironmentDataStoreReference = EnvironmentDataStoreReference;
/**
 * Builtin data store reference. Reads from / writes to `environment.variables._data`.
 * @param {import('moddle-context-serializer').DataStore} dataObjectDef
 * @param {import('#types').ContextInstance} context
 * @satisfies {import('#types').IIOData}
 */
function EnvironmentDataStoreReference(dataObjectDef, {
  environment
}) {
  const {
    id,
    type,
    name,
    behaviour,
    parent
  } = dataObjectDef;
  this.id = id;
  this.type = type;
  this.name = name;
  /** @type {Record<string, any>} */
  this.behaviour = behaviour;
  /** @type {import('moddle-context-serializer').Parent | undefined} */
  this.parent = parent;
  this.environment = environment;
}

/**
 * @param {import('smqp').Broker} broker
 * @param {string} exchange
 * @param {string} routingKeyPrefix
 * @param {Record<string, any>} [messageProperties]
 */
EnvironmentDataStoreReference.prototype.read = function read(broker, exchange, routingKeyPrefix, messageProperties) {
  const environment = this.environment;
  const value = environment.variables._data?.[this.id];
  const content = this._createContent(value);
  broker.publish(exchange, `${routingKeyPrefix}response`, content, messageProperties);
};

/**
 * @param {import('smqp').Broker} broker
 * @param {string} exchange
 * @param {string} routingKeyPrefix
 * @param {any} value
 * @param {Record<string, any>} [messageProperties]
 */
EnvironmentDataStoreReference.prototype.write = function write(broker, exchange, routingKeyPrefix, value, messageProperties) {
  const environment = this.environment;
  environment.variables._data = environment.variables._data || {};
  environment.variables._data[this.id] = value;
  const content = this._createContent(value);
  broker.publish(exchange, `${routingKeyPrefix}response`, content, messageProperties);
};
EnvironmentDataStoreReference.prototype._createContent = function createContent(value) {
  return {
    id: this.id,
    type: this.type,
    name: this.name,
    value
  };
};