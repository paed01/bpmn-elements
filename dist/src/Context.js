"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Context;

var _Environment = _interopRequireDefault(require("./Environment"));

var _ExtensionsMapper = _interopRequireDefault(require("./ExtensionsMapper"));

var _SequenceFlow = _interopRequireDefault(require("./flows/SequenceFlow"));

var _MessageFlow = _interopRequireDefault(require("./flows/MessageFlow"));

var _shared = require("./shared");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function Context(definitionContext, environment) {
  environment = environment ? environment.clone() : (0, _Environment.default)();
  return ContextInstance(definitionContext, environment);
}

function ContextInstance(definitionContext, environment) {
  const {
    id = 'Def',
    name,
    type = 'context'
  } = definitionContext;
  const sid = (0, _shared.getUniqueId)(id);
  const activityRefs = {},
        dataObjectRefs = {},
        messageFlows = [],
        processes = [],
        processRefs = {},
        sequenceFlowRefs = {},
        sequenceFlows = [];
  const context = {
    id,
    name,
    type,
    sid,
    definitionContext,
    environment,
    clone,
    getActivities,
    getActivityById,
    getExecutableProcesses,
    getDataObjectById,
    getInboundSequenceFlows,
    getMessageFlows,
    getOutboundSequenceFlows,
    getProcessById,
    getProcesses,
    getSequenceFlowById,
    getSequenceFlows,
    getStartActivities,
    loadExtensions
  };
  const extensionsMapper = (0, _ExtensionsMapper.default)(context);
  return context;

  function getActivityById(activityId) {
    const activityInstance = activityRefs[activityId];
    if (activityInstance) return activityInstance;
    const activity = definitionContext.getActivityById(activityId);
    if (!activity) return null;
    return upsertActivity(activity);
  }

  function upsertActivity(activityDef) {
    let activityInstance = activityRefs[activityDef.id];
    if (activityInstance) return activityInstance;
    activityInstance = activityRefs[activityDef.id] = activityDef.Behaviour(activityDef, context);
    return activityInstance;
  }

  function getSequenceFlowById(sequenceFlowId) {
    let flowInstance = sequenceFlowRefs[sequenceFlowId];
    if (flowInstance) return flowInstance;
    const flow = definitionContext.getSequenceFlowById(sequenceFlowId);
    if (!flow) return null;
    flowInstance = sequenceFlowRefs[sequenceFlowId] = (0, _SequenceFlow.default)(flow, context);
    sequenceFlows.push(flow);
    return flowInstance;
  }

  function getInboundSequenceFlows(activityId) {
    return definitionContext.getInboundSequenceFlows(activityId).map(flow => upsertSequenceFlow(flow));
  }

  function getOutboundSequenceFlows(activityId) {
    return definitionContext.getOutboundSequenceFlows(activityId).map(flow => upsertSequenceFlow(flow));
  }

  function getActivities(scopeId) {
    const activities = definitionContext.getActivities(scopeId);
    return activities.map(activityDef => upsertActivity(activityDef));
  }

  function getSequenceFlows(scopeId) {
    return definitionContext.getSequenceFlows(scopeId).map(flow => upsertSequenceFlow(flow));
  }

  function upsertSequenceFlow(flowDefinition) {
    let flowInstance = sequenceFlowRefs[flowDefinition.id];
    if (flowInstance) return flowInstance;
    flowInstance = sequenceFlowRefs[flowDefinition.id] = flowDefinition.Behaviour(flowDefinition, context);
    sequenceFlows.push(flowInstance);
    return flowInstance;
  }

  function clone(newEnvironment) {
    return ContextInstance(definitionContext, newEnvironment || environment);
  }

  function getProcessById(processId) {
    let processInstance = processRefs[processId];
    if (processInstance) return processInstance;
    const processDefinition = definitionContext.getProcessById(processId);
    if (!processDefinition) return null;
    processInstance = processRefs[processId] = processDefinition.Behaviour(processDefinition, context);
    processes.push(processInstance);
    return processInstance;
  }

  function getProcesses() {
    return definitionContext.getProcesses().map(({
      id: processId
    }) => getProcessById(processId));
  }

  function getExecutableProcesses() {
    return definitionContext.getExecutableProcesses().map(({
      id: processId
    }) => getProcessById(processId));
  }

  function getMessageFlows(sourceId) {
    if (!messageFlows.length) {
      const flows = definitionContext.getMessageFlows();
      messageFlows.push(...flows.map(flow => (0, _MessageFlow.default)(flow, context)));
    }

    return messageFlows.filter(flow => flow.source.processId === sourceId);
  }

  function getDataObjectById(dataObjectId) {
    let dataObject;
    if (dataObject = dataObjectRefs[dataObjectId]) return dataObject;
    const dataObjectDef = definitionContext.getDataObjectById(dataObjectId);
    if (!dataObjectDef) return;
    dataObject = dataObjectRefs[dataObjectDef.id] = dataObjectDef.Behaviour(dataObjectDef, context);
    return dataObject;
  }

  function getStartActivities(filterOptions, scopeId) {
    const {
      referenceId,
      referenceType = 'unknown'
    } = filterOptions || {};
    return getActivities().filter(activity => {
      if (!activity.isStart) return false;
      if (scopeId && activity.parent.id !== scopeId) return false;
      if (!filterOptions) return true;
      if (!activity.behaviour.eventDefinitions && !activity.behaviour.eventDefinitions) return false;
      return activity.eventDefinitions.some(ed => {
        return ed.reference && ed.reference.id === referenceId && ed.reference.referenceType === referenceType;
      });
    });
  }

  function loadExtensions(activity) {
    return extensionsMapper.get(activity);
  }
}