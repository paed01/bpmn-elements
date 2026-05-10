"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Context;
var _BpmnIO = _interopRequireDefault(require("./io/BpmnIO.js"));
var _Environment = _interopRequireDefault(require("./Environment.js"));
var _shared = require("./shared.js");
var _constants = require("./constants.js");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const K_OWNER = Symbol.for('owner');

/**
 * Build a runtime Context from a parsed BPMN definition.
 * @param {import('moddle-context-serializer').SerializableContext} definitionContext
 * @param {import('types').Environment} [environment] Existing environment to clone; a fresh one is created when omitted
 */
function Context(definitionContext, environment) {
  environment = environment ? environment.clone() : new _Environment.default();
  return new ContextInstance(definitionContext, environment);
}

/**
 * Per-execution registry that lazily upserts activities, flows, and processes from the parsed BPMN definition.
 * @param {import('moddle-context-serializer').SerializableContext} definitionContext
 * @param {import('types').Environment} environment
 * @param {import('types').Process | import('types').Activity} [owner] Process or sub-process activity that owns this context
 */
function ContextInstance(definitionContext, environment, owner) {
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
  this.extensionsMapper = new ExtensionsMapper(this);
  this.refs = new Map([['activityRefs', new Map()], ['sequenceFlowRefs', new Map()], ['processRefs', new Map()], ['messageFlows', new Set()], ['associationRefs', new Map()], ['dataObjectRefs', new Map()], ['dataStoreRefs', new Map()]]);
  /** @private */
  this[K_OWNER] = owner;
}
Object.defineProperty(ContextInstance.prototype, 'owner', {
  /** @returns {import('types').Process | import('types').Activity | undefined} Process or sub-process activity that owns this context */
  get() {
    return this[K_OWNER];
  }
});

/**
 * Get or create the activity instance for the given id.
 * @param {string} activityId
 */
ContextInstance.prototype.getActivityById = function getActivityById(activityId) {
  const activityInstance = this.refs.get('activityRefs').get(activityId);
  if (activityInstance) return activityInstance;
  const activity = this.definitionContext.getActivityById(activityId);
  if (!activity) return null;
  return this.upsertActivity(activity);
};

/**
 * Return the cached activity instance, instantiating it the first time it is referenced.
 * @param {import('moddle-context-serializer').SerializableElement} activityDef
 */
ContextInstance.prototype.upsertActivity = function upsertActivity(activityDef) {
  let activityInstance = this.refs.get('activityRefs').get(activityDef.id);
  if (activityInstance) return activityInstance;
  activityInstance = new activityDef.Behaviour(activityDef, this);
  this.refs.get('activityRefs').set(activityDef.id, activityInstance);
  return activityInstance;
};

/**
 * Get or create the sequence flow instance for the given id.
 * @param {string} sequenceFlowId
 */
ContextInstance.prototype.getSequenceFlowById = function getSequenceFlowById(sequenceFlowId) {
  const flowInstance = this.refs.get('sequenceFlowRefs').get(sequenceFlowId);
  if (flowInstance) return flowInstance;
  const flowDef = this.definitionContext.getSequenceFlowById(sequenceFlowId);
  if (!flowDef) return null;
  return this.upsertSequenceFlow(flowDef);
};

/**
 * @param {string} activityId
 */
ContextInstance.prototype.getInboundSequenceFlows = function getInboundSequenceFlows(activityId) {
  return (this.definitionContext.getInboundSequenceFlows(activityId) || []).map(flow => this.upsertSequenceFlow(flow));
};

/**
 * @param {string} activityId
 */
ContextInstance.prototype.getOutboundSequenceFlows = function getOutboundSequenceFlows(activityId) {
  return (this.definitionContext.getOutboundSequenceFlows(activityId) || []).map(flow => this.upsertSequenceFlow(flow));
};

/**
 * @param {string} activityId
 */
ContextInstance.prototype.getInboundAssociations = function getInboundAssociations(activityId) {
  return (this.definitionContext.getInboundAssociations(activityId) || []).map(association => this.upsertAssociation(association));
};

/**
 * @param {string} activityId
 */
ContextInstance.prototype.getOutboundAssociations = function getOutboundAssociations(activityId) {
  return (this.definitionContext.getOutboundAssociations(activityId) || []).map(association => this.upsertAssociation(association));
};

/**
 * Get every activity in the definition, optionally narrowed to a parent scope.
 * @param {string} [scopeId] Process or sub-process id
 */
ContextInstance.prototype.getActivities = function getActivities(scopeId) {
  return (this.definitionContext.getActivities(scopeId) || []).map(activityDef => this.upsertActivity(activityDef));
};

/**
 * Get every sequence flow in the definition, optionally narrowed to a parent scope.
 * @param {string} [scopeId] Process or sub-process id
 */
ContextInstance.prototype.getSequenceFlows = function getSequenceFlows(scopeId) {
  return (this.definitionContext.getSequenceFlows(scopeId) || []).map(flow => this.upsertSequenceFlow(flow));
};

/**
 * Return the cached sequence flow, instantiating it the first time it is referenced.
 * @param {import('moddle-context-serializer').SerializableElement} flowDefinition
 */
ContextInstance.prototype.upsertSequenceFlow = function upsertSequenceFlow(flowDefinition) {
  const sequenceFlowRefs = this.refs.get('sequenceFlowRefs');
  let flowInstance = sequenceFlowRefs.get(flowDefinition.id);
  if (flowInstance) return flowInstance;
  flowInstance = new flowDefinition.Behaviour(flowDefinition, this);
  sequenceFlowRefs.set(flowDefinition.id, flowInstance);
  return flowInstance;
};

/**
 * @param {string} [scopeId] Process or sub-process id
 */
ContextInstance.prototype.getAssociations = function getAssociations(scopeId) {
  return (this.definitionContext.getAssociations(scopeId) || []).map(association => this.upsertAssociation(association));
};

/**
 * @param {import('moddle-context-serializer').SerializableElement} associationDefinition
 */
ContextInstance.prototype.upsertAssociation = function upsertAssociation(associationDefinition) {
  const associationRefs = this.refs.get('associationRefs');
  let instance = associationRefs.get(associationDefinition.id);
  if (instance) return instance;
  instance = new associationDefinition.Behaviour(associationDefinition, this);
  associationRefs.set(associationDefinition.id, instance);
  return instance;
};

/**
 * Create a new context that shares the parsed definition but optionally swaps environment and owner.
 * @param {import('types').Environment} [newEnvironment]
 * @param {import('types').Process | import('types').Activity} [newOwner]
 */
ContextInstance.prototype.clone = function clone(newEnvironment, newOwner) {
  return new ContextInstance(this.definitionContext, newEnvironment || this.environment, newOwner);
};

/**
 * Get or create the process instance for the given id. Each process gets its own cloned environment.
 * @param {string} processId
 */
ContextInstance.prototype.getProcessById = function getProcessById(processId) {
  const processRefs = this.refs.get('processRefs');
  let bp = processRefs.get(processId);
  if (bp) return bp;
  const processDefinition = this.definitionContext.getProcessById(processId);
  if (!processDefinition) return null;
  const bpContext = this.clone(this.environment.clone());
  bp = new processDefinition.Behaviour(processDefinition, bpContext);
  processRefs.set(processId, bp);
  bpContext[K_OWNER] = bp;
  return bp;
};

/**
 * Build a fresh, uncached process instance for the given id. Used by call activities.
 * @param {string} processId
 */
ContextInstance.prototype.getNewProcessById = function getNewProcessById(processId) {
  if (!this.getProcessById(processId)) return null;
  const bpDef = this.definitionContext.getProcessById(processId);
  const bpContext = this.clone(this.environment.clone());
  const bp = new bpDef.Behaviour(bpDef, bpContext);
  bpContext[K_OWNER] = bp;
  return bp;
};

/**
 * Get every process in the definition.
 */
ContextInstance.prototype.getProcesses = function getProcesses() {
  return this.definitionContext.getProcesses().map(({
    id: processId
  }) => this.getProcessById(processId));
};

/**
 * Get processes flagged executable in the definition.
 */
ContextInstance.prototype.getExecutableProcesses = function getExecutableProcesses() {
  return this.definitionContext.getExecutableProcesses().map(({
    id: processId
  }) => this.getProcessById(processId));
};

/**
 * Get message flows that originate from the given process id.
 * @param {string} sourceId Source process id
 */
ContextInstance.prototype.getMessageFlows = function getMessageFlows(sourceId) {
  const messageFlowRefs = this.refs.get('messageFlows');
  const result = [];
  if (!messageFlowRefs.size) {
    const msgFlows = this.definitionContext.getMessageFlows() || [];
    for (const msgFlow of msgFlows) {
      const flow = new msgFlow.Behaviour(msgFlow, this);
      messageFlowRefs.add(flow);
      if (flow.source.processId === sourceId) result.push(flow);
    }
  } else {
    for (const flow of messageFlowRefs) {
      if (flow.source.processId === sourceId) result.push(flow);
    }
  }
  return result;
};

/**
 * Get or create a data object instance for the given reference id.
 * @param {string} referenceId
 */
ContextInstance.prototype.getDataObjectById = function getDataObjectById(referenceId) {
  const dataObjectRefs = this.refs.get('dataObjectRefs');
  let dataObject;
  if (dataObject = dataObjectRefs.get(referenceId)) return dataObject;
  const dataObjectDef = this.definitionContext.getDataObjectById(referenceId);
  if (!dataObjectDef) return;
  dataObject = new dataObjectDef.Behaviour(dataObjectDef, this);
  dataObjectRefs.set(dataObjectDef.id, dataObject);
  return dataObject;
};

/**
 * Get or create a data store instance for the given reference id.
 * @param {string} referenceId
 */
ContextInstance.prototype.getDataStoreById = function getDataStoreById(referenceId) {
  const dataStoreRefs = this.refs.get('dataStoreRefs');
  let dataStore;
  if (dataStore = dataStoreRefs.get(referenceId)) return dataStore;
  const dataStoreDef = this.definitionContext.getDataStoreById(referenceId) || this.definitionContext.getDataStoreReferenceById(referenceId);
  if (!dataStoreDef) return;
  dataStore = new dataStoreDef.Behaviour(dataStoreDef, this);
  dataStoreRefs.set(dataStoreDef.id, dataStore);
  return dataStore;
};

/**
 * Get start activities, optionally filtered by referenced event definition or restricted to a parent scope.
 * @param {import('types').startActivityFilterOptions} [filterOptions]
 * @param {string} [scopeId] Process or sub-process id
 */
ContextInstance.prototype.getStartActivities = function getStartActivities(filterOptions, scopeId) {
  const referenceId = filterOptions?.referenceId;
  const referenceType = filterOptions?.referenceType || 'unknown';
  const result = [];
  for (const activity of this.getActivities()) {
    if (!activity.isStart) continue;
    if (scopeId && activity.parent.id !== scopeId) continue;
    if (!filterOptions) {
      result.push(activity);
      continue;
    }
    if (!activity.behaviour.eventDefinitions && !activity.behaviour.eventDefinitions) continue;
    const ref = activity.eventDefinitions.some(ed => {
      return ed.reference && ed.reference.id === referenceId && ed.reference.referenceType === referenceType;
    });
    if (ref) result.push(activity);
  }
  return result;
};

/**
 * Resolve user-registered extensions and the built-in BpmnIO extension for an activity.
 * Returns undefined when the activity has no extensions to attach.
 * @param {import('types').ElementBase} activity
 */
ContextInstance.prototype.loadExtensions = function loadExtensions(activity) {
  const io = new _BpmnIO.default(activity, this);
  const extensions = this.extensionsMapper.get(activity);
  if (io.hasIo) extensions.extensions.push(io);
  if (!extensions.extensions.length) return;
  return extensions;
};

/**
 * Resolve the parent process or sub-process activity that owns the given activity.
 * @param {string} activityId
 */
ContextInstance.prototype.getActivityParentById = function getActivityParentById(activityId) {
  const owner = this[K_OWNER];
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

/** @internal */
ExtensionsMapper.prototype._getExtensions = function getExtensions() {
  let extensions;
  if (!(extensions = this.context.environment.extensions)) return [];
  return Object.values(extensions);
};
function Extensions(activity, context, extensions) {
  const result = this.extensions = [];
  for (const Extension of extensions) {
    const extension = Extension(activity, context);
    if (extension) result.push(extension);
  }
  /** @private */
  this[_constants.K_ACTIVATED] = false;
}
Object.defineProperty(Extensions.prototype, 'count', {
  get() {
    return this.extensions.length;
  }
});
Extensions.prototype.activate = function activate(message) {
  if (this[_constants.K_ACTIVATED]) return;
  /** @private */
  this[_constants.K_ACTIVATED] = true;
  for (const extension of this.extensions) extension.activate(message);
};
Extensions.prototype.deactivate = function deactivate(message) {
  if (!this[_constants.K_ACTIVATED]) return;
  /** @private */
  this[_constants.K_ACTIVATED] = false;
  for (const extension of this.extensions) extension.deactivate(message);
};