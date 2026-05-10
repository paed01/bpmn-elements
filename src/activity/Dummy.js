import { cloneParent } from '../messageHelper.js';

export function DummyActivity(activityDef) {
  const { id, type = 'dummy', name, parent, behaviour } = activityDef;
  return {
    id,
    type,
    name,
    behaviour: { ...behaviour },
    parent: cloneParent(parent),
    placeholder: true,
  };
}
