export default function BpmnIO(activity, context) {
  this.activity = activity;
  this.context = context;
  this.type = 'bpmnio';

  const { ioSpecification: ioSpecificationDef, properties: propertiesDef } = activity.behaviour;

  this.specification = ioSpecificationDef && new ioSpecificationDef.Behaviour(activity, ioSpecificationDef, context);
  this.properties = propertiesDef && new propertiesDef.Behaviour(activity, propertiesDef, context);
}

Object.defineProperty(BpmnIO.prototype, 'hasIo', {
  get() {
    return this.specification || this.properties;
  },
});

BpmnIO.prototype.activate = function activate(message) {
  const properties = this.properties,
    specification = this.specification;
  if (properties) properties.activate(message);
  if (specification) specification.activate(message);
};

BpmnIO.prototype.deactivate = function deactivate(message) {
  const properties = this.properties,
    specification = this.specification;
  if (properties) properties.deactivate(message);
  if (specification) specification.deactivate(message);
};
