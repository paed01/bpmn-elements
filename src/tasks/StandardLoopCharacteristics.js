import LoopCharacteristics from './LoopCharacteristics';

export default function StandardLoopCharacteristics(activity, loopCharacteristics) {
  let {behaviour = {}} = loopCharacteristics;
  behaviour = {...behaviour, isSequential: true};
  return LoopCharacteristics(activity, {...loopCharacteristics, behaviour});
}

