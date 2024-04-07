const kProcess = Symbol.for('process');

export default function Lane(process, laneDefinition) {
  const { broker, environment } = process;
  const { id, type, behaviour } = laneDefinition;

  this[kProcess] = process;

  this.id = id;
  this.type = type;
  this.name = behaviour.name;
  this.parent = {
    id: process.id,
    type: process.type,
  };
  this.behaviour = { ...behaviour };
  this.environment = environment;
  this.broker = broker;
  this.context = process.context;
  this.logger = environment.Logger(type.toLowerCase());
}

Object.defineProperty(Lane.prototype, 'process', {
  get() {
    return this[kProcess];
  },
});
