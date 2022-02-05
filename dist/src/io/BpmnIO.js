"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = BpmnIO;

function BpmnIO(activity, context) {
  this.activity = activity;
  this.context = context;
  const {
    ioSpecification: ioSpecificationDef,
    properties: propertiesDef
  } = activity.behaviour;
  this.specification = ioSpecificationDef && new ioSpecificationDef.Behaviour(activity, ioSpecificationDef, context);
  this.properties = propertiesDef && new propertiesDef.Behaviour(activity, propertiesDef, context);
}

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