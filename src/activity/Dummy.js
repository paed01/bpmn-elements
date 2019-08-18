import {cloneParent} from '../messageHelper';

export default function DummyActivity(activityDef) {
  const {id, type = 'dummy', name, parent: originalParent = {}, behaviour = {}} = activityDef;
  return {
    id,
    type,
    name,
    behaviour: {...behaviour},
    parent: cloneParent(originalParent),
    placeholder: true,
  };
}
