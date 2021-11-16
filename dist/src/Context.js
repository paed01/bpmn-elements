"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Context;

var _Environment = _interopRequireDefault(require("./Environment"));

var _ExtensionsMapper = _interopRequireDefault(require("./ExtensionsMapper"));

var _shared = require("./shared");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function Context(definitionContext, environment) {
  environment = environment ? environment.clone() : (0, _Environment.default)();
  return new ContextInstance(definitionContext, environment);
}

function ContextInstance(definitionContext, environment) {
  const {
    id = 'Def',
    name,
    type = 'context'
  } = definitionContext;
  const sid = (0, _shared.getUniqueId)(id);
  this.id = id;
  this.name = name;
  this.type = type;
  this.sid = sid;
  this.definitionContext = definitionContext;
  this.environment = environment;
  this.extensionsMapper = (0, _ExtensionsMapper.default)(this);
  this.refs = {
    activityRefs: {},
    associationRefs: [],
    dataObjectRefs: {},
    dataStoreRefs: {},
    messageFlows: [],
    processes: [],
    processRefs: {},
    sequenceFlowRefs: {},
    sequenceFlows: []
  };
} // const context = {
//   id,
//   name,
//   type,
//   sid,
//   definitionContext,
//   environment,
//   clone,
//   getActivities,
//   getActivityById,
//   getAssociations,
//   getExecutableProcesses,
//   getDataObjectById,
//   getDataStoreById,
//   getInboundAssociations,
//   getInboundSequenceFlows,
//   getMessageFlows,
//   getNewProcessById,
//   getOutboundSequenceFlows,
//   getOutboundAssociations,
//   getProcessById,
//   getProcesses,
//   getSequenceFlowById,
//   getSequenceFlows,
//   getStartActivities,
//   loadExtensions,
// };
// const extensionsMapper = ExtensionsMapper(context);
// return context;


ContextInstance.prototype.getActivityById = function getActivityById(activityId) {
  const activityInstance = this.refs.activityRefs[activityId];
  if (activityInstance) return activityInstance;
  const activity = this.definitionContext.getActivityById(activityId);
  if (!activity) return null;
  return this.upsertActivity(activity);
};

ContextInstance.prototype.upsertActivity = function upsertActivity(activityDef) {
  let activityInstance = this.refs.activityRefs[activityDef.id];
  if (activityInstance) return activityInstance;
  activityInstance = this.refs.activityRefs[activityDef.id] = activityDef.Behaviour(activityDef, this);
  return activityInstance;
};

ContextInstance.prototype.getSequenceFlowById = function getSequenceFlowById(sequenceFlowId) {
  const flowInstance = this.refs.sequenceFlowRefs[sequenceFlowId];
  if (flowInstance) return flowInstance;
  const flowDef = this.definitionContext.getSequenceFlowById(sequenceFlowId);
  if (!flowDef) return null;
  return this.upsertSequenceFlow(flowDef);
};

ContextInstance.prototype.getInboundSequenceFlows = function getInboundSequenceFlows(activityId) {
  return (this.definitionContext.getInboundSequenceFlows(activityId) || []).map(flow => this.upsertSequenceFlow(flow));
};

ContextInstance.prototype.getOutboundSequenceFlows = function getOutboundSequenceFlows(activityId) {
  return (this.definitionContext.getOutboundSequenceFlows(activityId) || []).map(flow => this.upsertSequenceFlow(flow));
};

ContextInstance.prototype.getInboundAssociations = function getInboundAssociations(activityId) {
  return (this.definitionContext.getInboundAssociations(activityId) || []).map(association => this.upsertAssociation(association));
};

ContextInstance.prototype.getOutboundAssociations = function getOutboundAssociations(activityId) {
  return (this.definitionContext.getOutboundAssociations(activityId) || []).map(association => this.upsertAssociation(association));
};

ContextInstance.prototype.getActivities = function getActivities(scopeId) {
  return (this.definitionContext.getActivities(scopeId) || []).map(activityDef => this.upsertActivity(activityDef));
};

ContextInstance.prototype.getSequenceFlows = function getSequenceFlows(scopeId) {
  return (this.definitionContext.getSequenceFlows(scopeId) || []).map(flow => this.upsertSequenceFlow(flow));
};

ContextInstance.prototype.upsertSequenceFlow = function upsertSequenceFlow(flowDefinition) {
  const refs = this.refs.sequenceFlowRefs;
  let flowInstance = refs[flowDefinition.id];
  if (flowInstance) return flowInstance;
  flowInstance = refs[flowDefinition.id] = new flowDefinition.Behaviour(flowDefinition, this);
  this.refs.sequenceFlows.push(flowInstance);
  return flowInstance;
};

ContextInstance.prototype.getAssociations = function getAssociations(scopeId) {
  return (this.definitionContext.getAssociations(scopeId) || []).map(association => this.upsertAssociation(association));
};

ContextInstance.prototype.upsertAssociation = function upsertAssociation(associationDefinition) {
  const refs = this.refs.associationRefs;
  let instance = refs[associationDefinition.id];
  if (instance) return instance;
  instance = refs[associationDefinition.id] = associationDefinition.Behaviour(associationDefinition, this);
  return instance;
};

ContextInstance.prototype.clone = function clone(newEnvironment) {
  return new ContextInstance(this.definitionContext, newEnvironment || this.environment);
};

ContextInstance.prototype.getProcessById = function getProcessById(processId) {
  const refs = this.refs.processRefs;
  let processInstance = this.refs.processRefs[processId];
  if (processInstance) return processInstance;
  const processDefinition = this.definitionContext.getProcessById(processId);
  if (!processDefinition) return null;
  processInstance = refs[processId] = processDefinition.Behaviour(processDefinition, this);
  this.refs.processes.push(processInstance);
  return processInstance;
};

ContextInstance.prototype.getNewProcessById = function getNewProcessById(processId, processOptions) {
  if (!this.getProcessById(processId)) return null;
  const processDefinition = this.definitionContext.getProcessById(processId);
  const processInstance = processDefinition.Behaviour(processDefinition, this.clone(this.environment.clone({
    output: {},
    ...processOptions
  })));
  return processInstance;
};

ContextInstance.prototype.getProcesses = function getProcesses() {
  return this.definitionContext.getProcesses().map(({
    id: processId
  }) => this.getProcessById(processId));
};

ContextInstance.prototype.getExecutableProcesses = function getExecutableProcesses() {
  return this.definitionContext.getExecutableProcesses().map(({
    id: processId
  }) => this.getProcessById(processId));
};

ContextInstance.prototype.getMessageFlows = function getMessageFlows(sourceId) {
  if (!this.refs.messageFlows.length) {
    const flows = this.definitionContext.getMessageFlows() || [];
    this.refs.messageFlows.push(...flows.map(flow => flow.Behaviour(flow, this)));
  }

  return this.refs.messageFlows.filter(flow => flow.source.processId === sourceId);
};

ContextInstance.prototype.getDataObjectById = function getDataObjectById(referenceId) {
  let dataObject;
  if (dataObject = this.refs.dataObjectRefs[referenceId]) return dataObject;
  const dataObjectDef = this.definitionContext.getDataObjectById(referenceId);
  if (!dataObjectDef) return;
  dataObject = this.refs.dataObjectRefs[dataObjectDef.id] = dataObjectDef.Behaviour(dataObjectDef, this);
  return dataObject;
};

ContextInstance.prototype.getDataStoreById = function getDataStoreById(referenceId) {
  let dataStore;
  if (dataStore = this.refs.dataStoreRefs[referenceId]) return dataStore;
  const dataStoreDef = this.definitionContext.getDataStoreById(referenceId) || this.definitionContext.getDataStoreReferenceById(referenceId);
  if (!dataStoreDef) return;
  dataStore = this.refs.dataStoreRefs[dataStoreDef.id] = dataStoreDef.Behaviour(dataStoreDef, this);
  return dataStore;
};

ContextInstance.prototype.getStartActivities = function getStartActivities(filterOptions, scopeId) {
  const {
    referenceId,
    referenceType = 'unknown'
  } = filterOptions || {};
  return this.getActivities().filter(activity => {
    if (!activity.isStart) return false;
    if (scopeId && activity.parent.id !== scopeId) return false;
    if (!filterOptions) return true;
    if (!activity.behaviour.eventDefinitions && !activity.behaviour.eventDefinitions) return false;
    return activity.eventDefinitions.some(ed => {
      return ed.reference && ed.reference.id === referenceId && ed.reference.referenceType === referenceType;
    });
  });
};

ContextInstance.prototype.loadExtensions = function loadExtensions(activity) {
  return this.extensionsMapper.get(activity);
};