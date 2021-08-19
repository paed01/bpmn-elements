import Environment from './Environment';
import ExtensionsMapper from './ExtensionsMapper';
import {getUniqueId} from './shared';

export default function Context(definitionContext, environment) {
  environment = environment ? environment.clone() : Environment();
  return ContextInstance(definitionContext, environment);
}

function ContextInstance(definitionContext, environment) {
  const {id = 'Def', name, type = 'context'} = definitionContext;
  const sid = getUniqueId(id);

  const activityRefs = {}, dataObjectRefs = {}, dataStoreRefs = {}, messageFlows = [], processes = [], processRefs = {}, sequenceFlowRefs = {}, sequenceFlows = [], associationRefs = [];

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
    getAssociations,
    getExecutableProcesses,
    getDataObjectById,
    getDataStoreById,
    getInboundAssociations,
    getInboundSequenceFlows,
    getMessageFlows,
    getOutboundSequenceFlows,
    getOutboundAssociations,
    getProcessById,
    getProcesses,
    getSequenceFlowById,
    getSequenceFlows,
    getStartActivities,
    loadExtensions,
  };

  const extensionsMapper = ExtensionsMapper(context);

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
    const flowInstance = sequenceFlowRefs[sequenceFlowId];
    if (flowInstance) return flowInstance;

    const flowDef = definitionContext.getSequenceFlowById(sequenceFlowId);
    if (!flowDef) return null;
    return upsertSequenceFlow(flowDef);
  }

  function getInboundSequenceFlows(activityId) {
    return (definitionContext.getInboundSequenceFlows(activityId) || []).map((flow) => upsertSequenceFlow(flow));
  }

  function getOutboundSequenceFlows(activityId) {
    return (definitionContext.getOutboundSequenceFlows(activityId) || []).map((flow) => upsertSequenceFlow(flow));
  }

  function getInboundAssociations(activityId) {
    return (definitionContext.getInboundAssociations(activityId) || []).map((association) => upsertAssociation(association));
  }

  function getOutboundAssociations(activityId) {
    return (definitionContext.getOutboundAssociations(activityId) || []).map((association) => upsertAssociation(association));
  }

  function getActivities(scopeId) {
    return (definitionContext.getActivities(scopeId) || []).map((activityDef) => upsertActivity(activityDef));
  }

  function getSequenceFlows(scopeId) {
    return (definitionContext.getSequenceFlows(scopeId) || []).map((flow) => upsertSequenceFlow(flow));
  }

  function upsertSequenceFlow(flowDefinition) {
    let flowInstance = sequenceFlowRefs[flowDefinition.id];
    if (flowInstance) return flowInstance;

    flowInstance = sequenceFlowRefs[flowDefinition.id] = flowDefinition.Behaviour(flowDefinition, context);
    sequenceFlows.push(flowInstance);

    return flowInstance;
  }

  function getAssociations(scopeId) {
    return (definitionContext.getAssociations(scopeId) || []).map((association) => upsertAssociation(association));
  }

  function upsertAssociation(associationDefinition) {
    let instance = associationRefs[associationDefinition.id];
    if (instance) return instance;

    instance = associationRefs[associationDefinition.id] = associationDefinition.Behaviour(associationDefinition, context);

    return instance;
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
    return definitionContext.getProcesses().map(({id: processId}) => getProcessById(processId));
  }

  function getExecutableProcesses() {
    return definitionContext.getExecutableProcesses().map(({id: processId}) => getProcessById(processId));
  }

  function getMessageFlows(sourceId) {
    if (!messageFlows.length) {
      const flows = definitionContext.getMessageFlows() || [];
      messageFlows.push(...flows.map((flow) => flow.Behaviour(flow, context)));
    }

    return messageFlows.filter((flow) => flow.source.processId === sourceId);
  }

  function getDataObjectById(referenceId) {
    let dataObject;
    if ((dataObject = dataObjectRefs[referenceId])) return dataObject;

    const dataObjectDef = definitionContext.getDataObjectById(referenceId);
    if (!dataObjectDef) return;

    dataObject = dataObjectRefs[dataObjectDef.id] = dataObjectDef.Behaviour(dataObjectDef, context);

    return dataObject;
  }

  function getDataStoreById(referenceId) {
    let dataStore;
    if ((dataStore = dataStoreRefs[referenceId])) return dataStore;

    const dataStoreDef = definitionContext.getDataStoreById(referenceId) || definitionContext.getDataStoreReferenceById(referenceId);
    if (!dataStoreDef) return;

    dataStore = dataStoreRefs[dataStoreDef.id] = dataStoreDef.Behaviour(dataStoreDef, context);

    return dataStore;
  }

  function getStartActivities(filterOptions, scopeId) {
    const {referenceId, referenceType = 'unknown'} = filterOptions || {};
    return getActivities().filter((activity) => {
      if (!activity.isStart) return false;
      if (scopeId && activity.parent.id !== scopeId) return false;
      if (!filterOptions) return true;

      if (!activity.behaviour.eventDefinitions && !activity.behaviour.eventDefinitions) return false;

      return activity.eventDefinitions.some((ed) => {
        return ed.reference && ed.reference.id === referenceId && ed.reference.referenceType === referenceType;
      });
    });
  }

  function loadExtensions(activity) {
    return extensionsMapper.get(activity);
  }
}

