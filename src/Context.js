import Environment from './Environment';
import ExtensionsMapper from './ExtensionsMapper';
import SequenceFlow from './flows/SequenceFlow';
import MessageFlow from './flows/MessageFlow';
import {getUniqueId} from './shared';

export default function Context(definitionContext, environment) {
  environment = environment ? environment.clone() : Environment();
  return ContextInstance(definitionContext, environment);
}

function ContextInstance(definitionContext, environment) {
  const {id = 'Def', name, type = 'context'} = definitionContext;
  const sid = getUniqueId(id);

  const activityRefs = {}, dataObjectRefs = {}, messageFlows = [], processes = [], processRefs = {}, sequenceFlowRefs = {}, sequenceFlows = [];

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
    getErrorById,
    getExecutableProcesses,
    getDataObjectById,
    getMessageFlows,
    getProcessById,
    getProcesses,
    getSequenceFlowById,
    getSequenceFlows,
    getInboundSequenceFlows,
    getOutboundSequenceFlows,
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

  function getErrorById(errorId) {
    const error = definitionContext.getErrorById(errorId);
    if (!error) return;

    return error.Behaviour(error, context);
  }

  function getSequenceFlowById(sequenceFlowId) {
    let flowInstance = sequenceFlowRefs[sequenceFlowId];
    if (flowInstance) return flowInstance;

    const flow = definitionContext.getSequenceFlowById(sequenceFlowId);
    if (!flow) return null;
    flowInstance = sequenceFlowRefs[sequenceFlowId] = SequenceFlow(flow, context);
    sequenceFlows.push(flow);

    return flowInstance;
  }

  function getInboundSequenceFlows(activityId) {
    return definitionContext.getInboundSequenceFlows(activityId).map((flow) => upsertSequenceFlow(flow));
  }

  function getOutboundSequenceFlows(activityId) {
    return definitionContext.getOutboundSequenceFlows(activityId).map((flow) => upsertSequenceFlow(flow));
  }

  function getActivities(scopeId) {
    const activities = definitionContext.getActivities(scopeId);
    return activities.map((activityDef) => upsertActivity(activityDef));
  }

  function getSequenceFlows(scopeId) {
    return definitionContext.getSequenceFlows(scopeId).map((flow) => upsertSequenceFlow(flow));
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
    return definitionContext.getProcesses().map(({id: processId}) => getProcessById(processId));
  }

  function getExecutableProcesses() {
    return definitionContext.getExecutableProcesses().map(({id: processId}) => getProcessById(processId));
  }

  function getMessageFlows(sourceId) {
    if (!messageFlows.length) {
      const flows = definitionContext.getMessageFlows();
      messageFlows.push(...flows.map((flow) => MessageFlow(flow, context)));
    }

    return messageFlows.filter((flow) => flow.source.processId === sourceId);
  }

  function getDataObjectById(dataObjectId) {
    let dataObject;
    if ((dataObject = dataObjectRefs[dataObjectId])) return dataObject;

    const dataObjectDef = definitionContext.getDataObjectById(dataObjectId);
    if (!dataObjectDef) return;

    dataObject = dataObjectRefs[dataObjectDef.id] = dataObjectDef.Behaviour(dataObjectDef, context);

    return dataObject;
  }

  function loadExtensions(activity) {
    return extensionsMapper.get(activity);
  }
}

