export default function EnvironmentDataStore(dataStoreDef, {environment}) {
  const {id, type, name, behaviour, parent} = dataStoreDef;
  this.id = id;
  this.type = type;
  this.name = name;
  this.behaviour = behaviour;
  this.parent = parent;
  this.environment = environment;
}

EnvironmentDataStore.prototype.read = function read(broker, exchange, routingKeyPrefix, messageProperties) {
  const environment = this.environment;
  const value = environment.variables._data && environment.variables._data[this.id];
  const content = this._createContent(value);
  return broker.publish(exchange, `${routingKeyPrefix}response`, content, messageProperties);
};

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
