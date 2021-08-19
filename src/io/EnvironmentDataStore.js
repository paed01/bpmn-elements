export default function EnvironmentDataStore(dataStoreDef, {environment}) {
  const {id, type, name, behaviour, parent} = dataStoreDef;

  const source = {
    id,
    name,
    type,
    behaviour,
    parent,
    read(broker, exchange, routingKeyPrefix, messageProperties) {
      const value = environment.variables._data && environment.variables._data[id];
      return broker.publish(exchange, `${routingKeyPrefix}response`, {id, name, type, value}, messageProperties);
    },
    write(broker, exchange, routingKeyPrefix, value, messageProperties) {
      environment.variables._data = environment.variables._data || {};
      environment.variables._data[id] = value;
      return broker.publish(exchange, `${routingKeyPrefix}response`, {id, name, type, value}, messageProperties);
    },
  };

  return source;
}
