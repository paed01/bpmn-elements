import { cloneParent } from '../messageHelper.js';

/**
 * Placeholder activity for non-executable elements (text annotations, groups, categories).
 * @param {import('#types').ActivityDefinition} activityDef
 * @returns {{ id: string, type: string, name: string | undefined, behaviour: Record<string, any>, parent: import('#types').ElementParent, placeholder: true }}
 */
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

/**
 * Text annotation placeholder. Distinct factory identity sharing the dummy implementation.
 * @param {import('#types').ActivityDefinition} activityDef
 */
export function TextAnnotation(activityDef) {
  return DummyActivity(activityDef);
}

/**
 * Group placeholder. Distinct factory identity sharing the dummy implementation.
 * @param {import('#types').ActivityDefinition} activityDef
 */
export function Group(activityDef) {
  return DummyActivity(activityDef);
}

/**
 * Category placeholder. Distinct factory identity sharing the dummy implementation.
 * @param {import('#types').ActivityDefinition} activityDef
 */
export function Category(activityDef) {
  return DummyActivity(activityDef);
}
