import { LoopCharacteristics } from './LoopCharacteristics.js';
export function StandardLoopCharacteristics(activity, loopCharacteristics) {
  let { behaviour } = loopCharacteristics;
  behaviour = { ...behaviour, isSequential: true };
  return new LoopCharacteristics(activity, { ...loopCharacteristics, behaviour });
}
