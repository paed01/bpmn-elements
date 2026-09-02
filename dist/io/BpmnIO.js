"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.BpmnIO = BpmnIO;
/**
 * Built-in IO extension. Composes the activity's ioSpecification and properties behaviours.
 * @param {import('#types').Activity | import('#types').ElementBase | import('../activity/Activity.js').Activity | import('../process/Process.js').Process} activity
 * @param {import('#types').ContextInstance} context
 * @satisfies {import('#types').IExtension}
 */
function BpmnIO(activity, context) {
  this.activity = activity;
  this.context = context;
  this.type = 'bpmnio';
  const {
    ioSpecification: ioSpecificationDef,
    properties: propertiesDef
  } = activity.behaviour;
  this.specification = ioSpecificationDef && new ioSpecificationDef.Behaviour(activity, ioSpecificationDef, context);
  this.properties = propertiesDef && new propertiesDef.Behaviour(activity, propertiesDef, context);
}
Object.defineProperty(BpmnIO.prototype, 'hasIo', {
  get() {
    return this.specification || this.properties;
  }
});

/**
 * @param {import('#types').ElementBrokerMessage} message
 */
BpmnIO.prototype.activate = function activate(message) {
  const properties = this.properties,
    specification = this.specification;
  if (properties) properties.activate(message);
  if (specification) specification.activate(message);
};

/**
 * @param {import('#types').ElementBrokerMessage} message
 */
BpmnIO.prototype.deactivate = function deactivate(message) {
  const properties = this.properties,
    specification = this.specification;
  if (properties) properties.deactivate(message);
  if (specification) specification.deactivate(message);
};