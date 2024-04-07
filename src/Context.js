import BpmnIO from './io/BpmnIO.js';
import Environment from './Environment.js';
import { getUniqueId } from './shared.js';

const kOwner = Symbol.for('owner');
const kActivated = Symbol.for('activated');

export default function Context(definitionContext, environment) {
  environment = environment ? environment.clone() : new Environment();
  return new ContextInstance(definitionContext, environment);
}

function ContextInstance(definitionContext, environment, owner) {
  const { id = 'Def', name, type = 'context' } = definitionContext;
  const sid = getUniqueId(id);
  this.id = id;
  this.name = name;
  this.type = type;
  this.sid = sid;
  this.definitionContext = definitionContext;
  this.environment = environment;
  this.extensionsMapper = new ExtensionsMapper(this);
  this.refs = {
    activityRefs: {},
    associationRefs: [],
    dataObjectRefs: {},
    dataStoreRefs: {},
    messageFlows: [],
    processes: [],
    processRefs: {},
    sequenceFlowRefs: {},
    sequenceFlows: [],
  };
  this[kOwner] = owner;
}

Object.defineProperty(ContextInstance.prototype, 'owner', {
  get() {
    return this[kOwner];
  },
});

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

  activityInstance = this.refs.activityRefs[activityDef.id] = new activityDef.Behaviour(activityDef, this);

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
  return (this.definitionContext.getInboundSequenceFlows(activityId) || []).map((flow) => this.upsertSequenceFlow(flow));
};

ContextInstance.prototype.getOutboundSequenceFlows = function getOutboundSequenceFlows(activityId) {
  return (this.definitionContext.getOutboundSequenceFlows(activityId) || []).map((flow) => this.upsertSequenceFlow(flow));
};

ContextInstance.prototype.getInboundAssociations = function getInboundAssociations(activityId) {
  return (this.definitionContext.getInboundAssociations(activityId) || []).map((association) => this.upsertAssociation(association));
};

ContextInstance.prototype.getOutboundAssociations = function getOutboundAssociations(activityId) {
  return (this.definitionContext.getOutboundAssociations(activityId) || []).map((association) => this.upsertAssociation(association));
};

ContextInstance.prototype.getActivities = function getActivities(scopeId) {
  return (this.definitionContext.getActivities(scopeId) || []).map((activityDef) => this.upsertActivity(activityDef));
};

ContextInstance.prototype.getSequenceFlows = function getSequenceFlows(scopeId) {
  return (this.definitionContext.getSequenceFlows(scopeId) || []).map((flow) => this.upsertSequenceFlow(flow));
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
  return (this.definitionContext.getAssociations(scopeId) || []).map((association) => this.upsertAssociation(association));
};

ContextInstance.prototype.upsertAssociation = function upsertAssociation(associationDefinition) {
  const refs = this.refs.associationRefs;
  let instance = refs[associationDefinition.id];
  if (instance) return instance;

  instance = refs[associationDefinition.id] = new associationDefinition.Behaviour(associationDefinition, this);

  return instance;
};

ContextInstance.prototype.clone = function clone(newEnvironment, newOwner) {
  return new ContextInstance(this.definitionContext, newEnvironment || this.environment, newOwner);
};

ContextInstance.prototype.getProcessById = function getProcessById(processId) {
  const refs = this.refs.processRefs;
  let bp = this.refs.processRefs[processId];
  if (bp) return bp;

  const processDefinition = this.definitionContext.getProcessById(processId);
  if (!processDefinition) return null;

  const bpContext = this.clone(this.environment.clone());
  bp = refs[processId] = new processDefinition.Behaviour(processDefinition, bpContext);
  bpContext[kOwner] = bp;

  this.refs.processes.push(bp);

  return bp;
};

ContextInstance.prototype.getNewProcessById = function getNewProcessById(processId) {
  if (!this.getProcessById(processId)) return null;
  const bpDef = this.definitionContext.getProcessById(processId);

  const bpContext = this.clone(this.environment.clone());
  const bp = new bpDef.Behaviour(bpDef, bpContext);
  bpContext[kOwner] = bp;

  return bp;
};

ContextInstance.prototype.getProcesses = function getProcesses() {
  return this.definitionContext.getProcesses().map(({ id: processId }) => this.getProcessById(processId));
};

ContextInstance.prototype.getExecutableProcesses = function getExecutableProcesses() {
  return this.definitionContext.getExecutableProcesses().map(({ id: processId }) => this.getProcessById(processId));
};

ContextInstance.prototype.getMessageFlows = function getMessageFlows(sourceId) {
  if (!this.refs.messageFlows.length) {
    const flows = this.definitionContext.getMessageFlows() || [];
    this.refs.messageFlows.push(...flows.map((flow) => new flow.Behaviour(flow, this)));
  }

  return this.refs.messageFlows.filter((flow) => flow.source.processId === sourceId);
};

ContextInstance.prototype.getDataObjectById = function getDataObjectById(referenceId) {
  let dataObject;
  if ((dataObject = this.refs.dataObjectRefs[referenceId])) return dataObject;

  const dataObjectDef = this.definitionContext.getDataObjectById(referenceId);
  if (!dataObjectDef) return;

  dataObject = this.refs.dataObjectRefs[dataObjectDef.id] = new dataObjectDef.Behaviour(dataObjectDef, this);

  return dataObject;
};

ContextInstance.prototype.getDataStoreById = function getDataStoreById(referenceId) {
  let dataStore;
  if ((dataStore = this.refs.dataStoreRefs[referenceId])) return dataStore;

  const dataStoreDef =
    this.definitionContext.getDataStoreById(referenceId) || this.definitionContext.getDataStoreReferenceById(referenceId);
  if (!dataStoreDef) return;

  dataStore = this.refs.dataStoreRefs[dataStoreDef.id] = new dataStoreDef.Behaviour(dataStoreDef, this);

  return dataStore;
};

ContextInstance.prototype.getStartActivities = function getStartActivities(filterOptions, scopeId) {
  const { referenceId, referenceType = 'unknown' } = filterOptions || {};
  const result = [];
  for (const activity of this.getActivities()) {
    if (!activity.isStart) continue;
    if (scopeId && activity.parent.id !== scopeId) continue;
    if (!filterOptions) {
      result.push(activity);
      continue;
    }

    if (!activity.behaviour.eventDefinitions && !activity.behaviour.eventDefinitions) continue;

    const ref = activity.eventDefinitions.some((ed) => {
      return ed.reference && ed.reference.id === referenceId && ed.reference.referenceType === referenceType;
    });
    if (ref) result.push(activity);
  }
  return result;
};

ContextInstance.prototype.loadExtensions = function loadExtensions(activity) {
  const io = new BpmnIO(activity, this);
  const extensions = this.extensionsMapper.get(activity);
  if (io.hasIo) extensions.extensions.push(io);
  if (!extensions.extensions.length) return;
  return extensions;
};

ContextInstance.prototype.getActivityParentById = function getActivityParentById(activityId) {
  const owner = this[kOwner];
  if (owner) return owner;
  const activity = this.getActivityById(activityId);
  const parentId = activity.parent.id;
  return this.getProcessById(parentId) || this.getActivityById(parentId);
};

function ExtensionsMapper(context) {
  this.context = context;
}

ExtensionsMapper.prototype.get = function get(activity) {
  return new Extensions(activity, this.context, this._getExtensions());
};

ExtensionsMapper.prototype._getExtensions = function getExtensions() {
  let extensions;
  if (!(extensions = this.context.environment.extensions)) return [];
  return Object.values(extensions);
};

function Extensions(activity, context, extensions) {
  const result = (this.extensions = []);
  for (const Extension of extensions) {
    const extension = Extension(activity, context);
    if (extension) result.push(extension);
  }
  this[kActivated] = false;
}

Object.defineProperty(Extensions.prototype, 'count', {
  get() {
    return this.extensions.length;
  },
});

Extensions.prototype.activate = function activate(message) {
  if (this[kActivated]) return;
  this[kActivated] = true;
  for (const extension of this.extensions) extension.activate(message);
};

Extensions.prototype.deactivate = function deactivate(message) {
  if (!this[kActivated]) return;
  this[kActivated] = false;
  for (const extension of this.extensions) extension.deactivate(message);
};
