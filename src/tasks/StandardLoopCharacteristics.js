import { LoopCharacteristics } from './LoopCharacteristics.js';
/**
 * Standard loop characteristics
 * @param {import('#types').Activity} activity
 * @param {import('moddle-context-serializer').SerializableElement} loopCharacteristics
 */
export function StandardLoopCharacteristics(activity, loopCharacteristics) {
  let { behaviour } = loopCharacteristics;
  behaviour = { ...behaviour, isSequential: true };
  return new LoopCharacteristics(activity, { ...loopCharacteristics, behaviour });
}
