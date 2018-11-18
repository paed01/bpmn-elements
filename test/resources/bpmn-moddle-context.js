import {
  BoundaryEvent,
  BpmnError,
  DataObject,
  Dummy,
  EndEvent,
  ErrorEventDefinition,
  ExclusiveGateway,
  InclusiveGateway,
  IntermediateCatchEvent,
  IoSpecification,
  MessageEventDefinition,
  MessageFlow,
  MultiInstanceLoopCharacteristics,
  ParallelGateway,
  ScriptTask,
  SequenceFlow,
  ServiceImplementation,
  ServiceTask,
  SignalTask,
  StartEvent,
  SubProcess,
  Task,
  TerminateEventDefinition,
  TimerEventDefinition,
} from '../../index';

const activityTypes = {};

activityTypes['bpmn:BoundaryEvent'] = BoundaryEvent;
activityTypes['bpmn:DataObjectReference'] = Dummy;
activityTypes['bpmn:DataObject'] = DataObject;
activityTypes['bpmn:EndEvent'] = EndEvent;
activityTypes['bpmn:Error'] = BpmnError;
activityTypes['bpmn:ErrorEventDefinition'] = ErrorEventDefinition;
activityTypes['bpmn:ExclusiveGateway'] = ExclusiveGateway;
activityTypes['bpmn:InclusiveGateway'] = InclusiveGateway;
activityTypes['bpmn:IntermediateCatchEvent'] = IntermediateCatchEvent;
activityTypes['bpmn:ManualTask'] = SignalTask;
activityTypes['bpmn:MessageEventDefinition'] = MessageEventDefinition;
activityTypes['bpmn:MessageFlow'] = MessageFlow;
activityTypes['bpmn:ParallelGateway'] = ParallelGateway;
activityTypes['bpmn:ReceiveTask'] = SignalTask;
activityTypes['bpmn:ScriptTask'] = ScriptTask;
activityTypes['bpmn:SendTask'] = ServiceTask;
activityTypes['bpmn:SequenceFlow'] = SequenceFlow;
activityTypes['bpmn:ServiceTask'] = ServiceTask;
activityTypes['bpmn:StartEvent'] = StartEvent;
activityTypes['bpmn:SubProcess'] = SubProcess;
activityTypes['bpmn:Task'] = Task;
activityTypes['bpmn:TerminateEventDefinition'] = TerminateEventDefinition;
activityTypes['bpmn:TimerEventDefinition'] = TimerEventDefinition;
activityTypes['bpmn:UserTask'] = SignalTask;
activityTypes['bpmn:MultiInstanceLoopCharacteristics'] = MultiInstanceLoopCharacteristics;
activityTypes['bpmn:InputOutputSpecification'] = IoSpecification;

export default function context(moddleContext) {
  const {elementsById, references, rootHandler, warnings} = moddleContext;

  const definition = {
    id: rootHandler.element.id,
    type: rootHandler.element.$type,
    name: rootHandler.element.name,
    targetNamespace: rootHandler.element.targetNamespace,
    exporter: rootHandler.element.exporter,
    exporterVersion: rootHandler.element.exporterVersion,
  };

  const {
    attachedToRefs,
    dataInputAssociations,
    dataInputRefs,
    dataObjectRefs,
    dataOutputAssociations,
    dataOutputRefs,
    errorRefs,
    flowRefs,
    sourceRefs,
    targetRefs,
  } = prepareReferences();

  const {
    activities,
    dataObjects,
    errors,
    messageFlows,
    processes,
    sequenceFlows,
  } = prepareElements(definition, rootHandler.element.rootElements);

  const definitionId = rootHandler.element.id || 'anonymous';

  return {
    id: definition.id,
    type: definition.type,
    name: definition.name,
    moddleContext,
    clone,
    getActivities,
    getActivityById,
    getActivityIOReferences,
    getAttachedToActivity,
    getDataObjectReferences,
    getDataObjects,
    getDefinitionId,
    getErrorById,
    getSequenceFlowById,
    getMessageFlows,

    getExecutableProcessId,
    getInboundSequenceFlows,
    getInboundMessageFlows,
    getOutboundMessageFlows,
    getOutboundSequenceFlows,
    getProcessById,
    getProcesses,
    getSequenceFlows,
  };

  function getDefinitionId() {
    return definitionId;
  }

  function getProcessById(processId) {
    return processes.find(({id}) => id === processId);
  }

  function getProcesses() {
    return rootHandler.element.rootElements.filter((e) => e.$type === 'bpmn:Process');
  }

  function getExecutableProcessId() {
    const executable = rootHandler.element.rootElements.find((e) => e.$type === 'bpmn:Process' && e.isExecutable);
    return executable && executable.id;
  }

  function getInboundSequenceFlows(activityId) {
    return sequenceFlows.filter((flow) => flow.targetId === activityId);
  }

  function getOutboundSequenceFlows(activityId) {
    return sequenceFlows.filter((flow) => flow.sourceId === activityId);
  }

  function getMessageFlows() {
    return messageFlows;
  }

  function getInboundMessageFlows(activityId) {
    return (targetRefs[activityId] || []).filter((r) => r.$type === 'bpmn:MessageFlow');
  }

  function getOutboundMessageFlows(activityId) {
    return (sourceRefs[activityId] || []).filter((r) => r.$type === 'bpmn:MessageFlow');
  }

  function getSequenceFlows(scopeActivityId) {
    if (!scopeActivityId) return sequenceFlows;
    return sequenceFlows.filter((flow) => flow.parent.id === scopeActivityId);
  }

  function getSequenceFlowById(flowId) {
    return sequenceFlows.find(({id}) => id === flowId);
  }

  function getActivities(scopeActivityId) {
    if (!scopeActivityId) return activities;
    return activities.filter((activity) => activity.parent.id === scopeActivityId);
  }

  function getDataObjects() {
    return dataObjects;
  }

  function getErrorById(errorId) {
    return errors.find(({id}) => id === errorId);
  }

  function clone() {
    const clonedContext = {
      rootHandler: {
        element: JSON.parse(JSON.stringify(rootHandler.element)),
      },
      elementsById: JSON.parse(JSON.stringify(elementsById)),
      references: JSON.parse(JSON.stringify(references)),
      warnings: warnings.slice(),
    };
    return clonedContext;
  }

  function prepareReferences() {
    return references.reduce((result, r) => {
      const {property, element} = r;

      switch (property) {
        case 'bpmn:attachedToRef':
          result.attachedToRefs.push(r);
          break;
        case 'bpmn:errorRef':
          result.errorRefs.push(r);
          break;
        case 'bpmn:sourceRef': {
          const flow = upsertFlowRef(element.id, {
            id: element.id,
            $type: element.$type,
            sourceId: r.id,
            element: elementsById[element.id],
          });
          const outbound = result.sourceRefs[r.id] = result.sourceRefs[r.id] || [];
          outbound.push(flow);
          break;
        }
        case 'bpmn:targetRef': {
          const flow = upsertFlowRef(element.id, {
            targetId: r.id,
          });
          const inbound = result.targetRefs[r.id] = result.targetRefs[r.id] || [];
          inbound.push(flow);
          break;
        }
        case 'bpmn:default':
          upsertFlowRef(r.id, {isDefault: true});
          break;
        case 'bpmn:dataObjectRef':
          result.dataObjectRefs.push(r);
          // result.dataObjects.push(elementsById[r.id]);
          break;
        case 'bpmn:dataInputRefs':
          result.dataInputRefs.push(r);
          break;
        case 'bpmn:dataOutputRefs':
          result.dataOutputRefs.push(r);
          break;
      }

      switch (element.$type) {
        case 'bpmn:OutputSet':
        case 'bpmn:InputSet': {
          break;
        }
        case 'bpmn:DataInputAssociation':
          result.dataInputAssociations.push(r);
          break;
        case 'bpmn:DataOutputAssociation':
          result.dataOutputAssociations.push(r);
          break;
      }

      return result;

      function upsertFlowRef(id, value) {
        const flow = result.flowRefs[id] = result.flowRefs[id] || {};
        Object.assign(flow, value);
        return flow;
      }
    }, {
      attachedToRefs: [],
      dataInputAssociations: [],
      dataInputRefs: [],
      dataObjectRefs: [],
      dataOutputAssociations: [],
      dataOutputRefs: [],
      errorRefs: [],
      flowRefs: {},
      sourceRefs: {},
      targetRefs: {},
    });
  }

  function prepareElements(parent, elements) {
    if (!elements) return {};

    return elements.reduce((result, element) => {
      const {id, $type: type, name} = element;

      let attachedTo, Behaviour;
      switch (element.$type) {
        case 'bpmn:DataObjectReference':
        case 'bpmn:Message':
          break;
        case 'bpmn:Collaboration': {
          const {messageFlows: flows} = prepareElements(parent, element.messageFlows);
          result.messageFlows = result.messageFlows.concat(flows);
          break;
        }
        case 'bpmn:MessageFlow': {
          const flowRef = flowRefs[element.id];
          result.messageFlows.push({
            ...flowRef,
            id,
            type,
            name,
            source: {
              processId: getElementProcessId(flowRef.sourceId),
              id: flowRef.sourceId,
            },
            target: {
              processId: getElementProcessId(flowRef.targetId),
              id: flowRef.targetId,
            },
            behaviour: {...element},
          });
          break;
        }
        case 'bpmn:Error': {
          result.errors.push({
            id,
            type,
            name,
            Behaviour: getBehaviourFromType(type),
            parent: {
              id: parent.id,
              type: parent.type,
            },
            behaviour: {...element},
          });
          break;
        }
        case 'bpmn:DataObject': {
          result.dataObjects.push({
            id,
            name,
            type,
            Behaviour: getBehaviourFromType(type),
            parent: {
              id: parent.id,
              type: parent.type,
            },
            references: prepareDataObjectReferences(),
            behaviour: {...element},
          });
          break;
        }
        case 'bpmn:SequenceFlow': {
          const flowRef = flowRefs[element.id];
          result.sequenceFlows.push({
            id,
            type,
            name,
            parent: {
              id: parent.id,
              type: parent.type,
            },
            isDefault: flowRef.isDefault,
            targetId: flowRef.targetId,
            sourceId: flowRef.sourceId,
            behaviour: {...element},
          });
          break;
        }
        case 'bpmn:SubProcess':
          Behaviour = getBehaviourFromType(type);
        case 'bpmn:Process': {
          const bp = {
            id,
            type,
            name,
            Behaviour,
            parent: {
              id: parent.id,
              type: parent.type,
            },
            behaviour: prepareActivityBehaviour(),
          };
          result.processes.push(bp);
          result.activities.push(bp);

          const subElements = prepareElements({id, type}, element.flowElements);
          if (subElements.activities) {
            result.activities = result.activities.concat(subElements.activities);
          }
          if (subElements.sequenceFlows) {
            result.sequenceFlows = result.sequenceFlows.concat(subElements.sequenceFlows);
          }
          if (subElements.dataObjects) {
            result.dataObjects = result.dataObjects.concat(subElements.dataObjects);
          }

          break;
        }
        case 'bpmn:BoundaryEvent': {
          attachedTo = attachedToRefs.find((r) => r.element.id === id);
          result.activities.push(prepareActivity({attachedTo}));
          break;
        }
        case 'bpmn:SendTask':
        case 'bpmn:ServiceTask': {
          result.activities.push(prepareActivity({Service: element.implementation && ServiceImplementation}));
          break;
        }
        default: {
          result.activities.push(prepareActivity());
        }
      }

      return result;

      function prepareActivity(behaviour) {
        return {
          id,
          type,
          name,
          Behaviour: getBehaviourFromType(type),
          parent: {
            id: parent.id,
            type: parent.type,
          },
          behaviour: prepareActivityBehaviour(behaviour),
        };
      }

      function prepareActivityBehaviour(behaviour) {
        return {
          ...behaviour,
          ...element,
          eventDefinitions: element.eventDefinitions && element.eventDefinitions.map(mapActivityBehaviour),
          loopCharacteristics: element.loopCharacteristics && mapActivityBehaviour(element.loopCharacteristics),
          ioSpecification: element.ioSpecification && mapActivityBehaviour(element.ioSpecification),
        };
      }

      function prepareDataObjectReferences() {
        const objectRefs = dataObjectRefs.filter((objectRef) => objectRef.id === element.id);

        return objectRefs.map((objectRef) => {
          return {
            id: objectRef.element.id,
            type: objectRef.element.$type,
            behaviour: {...objectRef.element},
          };
        });
      }
    }, {
      activities: [],
      dataObjects: [],
      errors: [],
      messageFlows: [],
      processes: [],
      sequenceFlows: [],
    });
  }

  function getElementProcessId(elementId) {
    const bp = rootHandler.element.rootElements.find((e) => e.$type === 'bpmn:Process' && e.flowElements.find((ce) => ce.id === elementId));
    return bp.id;
  }

  function mapActivityBehaviour(ed) {
    if (!ed) return;

    let Behaviour;
    const {$type: type} = ed;
    let behaviour = {...ed};

    switch (type) {
      case 'bpmn:InputOutputSpecification': {
        Behaviour = getBehaviourFromType(ed.$type, false);
        behaviour = prepareIoSpecificationBehaviour(ed);
        break;
      }
      case 'bpmn:MultiInstanceLoopCharacteristics': {
        Behaviour = getBehaviourFromType(ed.$type, false);
        behaviour.loopCardinality = ed.loopCardinality && ed.loopCardinality.body;
        behaviour.completionCondition = ed.completionCondition && ed.completionCondition.body;
        break;
      }
      case 'bpmn:TimerEventDefinition': {
        behaviour.timeDuration = ed.timeDuration && ed.timeDuration.body;
      }
      case 'bpmn:ErrorEventDefinition': {
        const errorRef = errorRefs.find((r) => r.element === ed);
        behaviour.errorRef = errorRef && {...errorRef};
      }
      default: {
        Behaviour = getBehaviourFromType(ed.$type, false);
      }
    }

    return {
      type: ed.$type,
      Behaviour,
      behaviour,
    };
  }

  function prepareIoSpecificationBehaviour(ioSpecificationDef) {
    const {dataInputs, dataOutputs} = ioSpecificationDef;

    return {
      dataInputs: dataInputs && dataInputs.map((dataDef) => {
        return {
          ...dataDef,
          type: dataDef.$type,
          behaviour: getDataInputBehaviour(dataDef.id),
        };
      }),
      dataOutputs: dataOutputs && dataOutputs.map((dataDef) => {
        return {
          ...dataDef,
          type: dataDef.$type,
          behaviour: getDataOutputBehaviour(dataDef.id),
        };
      }),
    };
  }

  function getDataInputBehaviour(dataInputId) {
    const target = dataInputAssociations.find((assoc) => assoc.property === 'bpmn:targetRef' && assoc.id === dataInputId && assoc.element);
    const source = target && dataInputAssociations.find((assoc) => assoc.property === 'bpmn:sourceRef' && assoc.element && assoc.element.id === target.element.id);

    return {
      association: {
        source: source && {...source, dataObject: getDataObjectRef(source.id)},
        target: target && {...target},
      },
    };
  }

  function getDataObjectRef(dataObjectReferenceId) {
    const dataObjectRef = dataObjectRefs.find((dor) => dor.element && dor.element.id === dataObjectReferenceId);
    if (!dataObjectRef) return;
    return {...dataObjectRef};
  }

  function getDataOutputBehaviour(dataOutputId) {
    const source = dataOutputAssociations.find((assoc) => assoc.property === 'bpmn:sourceRef' && assoc.id === dataOutputId && assoc.element);
    const target = source && dataOutputAssociations.find((assoc) => assoc.property === 'bpmn:targetRef' && assoc.element && assoc.element.id === source.element.id);

    return {
      association: {
        source: source && {...source},
        target: target && {...target, dataObject: getDataObjectRef(target.id)},
      },
    };
  }

  /* ---------------- */

  function getActivityIOReferences(ioSpecification) {
    const inputSet = ioSpecification.inputSets && ioSpecification.inputSets.reduce((result, {id}) => {
      result = result.concat(dataInputRefs.filter(({element}) => element.id === id));
      return result;
    }, []);

    const outputSet = ioSpecification.outputSets && ioSpecification.outputSets.reduce((result, {id}) => {
      result = result.concat(dataOutputRefs.filter(({element}) => element.id === id));
      return result;
    }, []);

    return {
      inputSet,
      outputSet,
    };
  }

  function getDataObjectReferences() {
    return {
      dataInputAssociations,
      dataObjectRefs,
      dataOutputAssociations,
    };
  }

  function getAttachedToActivity(actvitiyId) {
    return attachedToRefs.find((r) => r.element.id === actvitiyId);
  }

  function getActivityById(actvitiyId) {
    return activities.find((activity) => activity.id === actvitiyId);
  }
}

function getBehaviourFromType(type) {
  const activityType = activityTypes[type];

  if (!activityType) {
    throw new Error(`Unknown activity type ${type}`);
  }

  return activityType;
}
