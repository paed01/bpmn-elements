export default function BpmnIO(activity, context) {
  const {ioSpecification: ioSpecificationDef, properties: propertiesDef} = activity.behaviour;

  const ioSpecification = ioSpecificationDef && new ioSpecificationDef.Behaviour(activity, ioSpecificationDef, context);
  const bpmnProperties = propertiesDef && new propertiesDef.Behaviour(activity, propertiesDef, context);

  if (!ioSpecification && !bpmnProperties) return;

  return {
    activate(message) {
      if (bpmnProperties) bpmnProperties.activate(message);
      if (ioSpecification) ioSpecification.activate(message);
    },
    deactivate(message) {
      if (bpmnProperties) bpmnProperties.deactivate(message);
      if (ioSpecification) ioSpecification.deactivate(message);
    },
  };
}
