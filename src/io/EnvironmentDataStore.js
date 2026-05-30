/**
 * Builtin data store. Reads from / writes to `environment.variables._data`.
 * @param {import('moddle-context-serializer').DataStore} dataStoreDef
 * @param {import('#types').ContextInstance} context
 * @satisfies {import('#types').IIOData}
 */
export function EnvironmentDataStore(dataStoreDef, { environment }) {
  const { id, type, name, behaviour, parent } = dataStoreDef;
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
EnvironmentDataStore.prototype.read = function read(broker, exchange, routingKeyPrefix, messageProperties) {
  const environment = this.environment;
  const value = environment.variables._data?.[this.id];
  const content = this._createContent(value);
  return broker.publish(exchange, `${routingKeyPrefix}response`, content, messageProperties);
};

/**
 * @param {import('smqp').Broker} broker
 * @param {string} exchange
 * @param {string} routingKeyPrefix
 * @param {any} value
 * @param {Record<string, any>} [messageProperties]
 */
EnvironmentDataStore.prototype.write = function write(broker, exchange, routingKeyPrefix, value, messageProperties) {
  const environment = this.environment;
  environment.variables._data = environment.variables._data || {};
  environment.variables._data[this.id] = value;
  const content = this._createContent(value);
  return broker.publish(exchange, `${routingKeyPrefix}response`, content, messageProperties);
};

EnvironmentDataStore.prototype._createContent = function createContent(value) {
  return {
    id: this.id,
    type: this.type,
    name: this.name,
    value,
  };
};
