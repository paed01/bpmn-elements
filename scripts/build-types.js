import { readFileSync, appendFileSync } from 'node:fs';
import { createBundle } from 'dts-buddy';

const output = 'types/index.d.ts';
const augmentations = 'types/augmentations.d.ts';

createBundle({
  project: 'tsconfig.json',
  output,
  modules: {
    'bpmn-elements': 'src/index.js',
    'bpmn-elements/events': 'src/events/index.js',
    'bpmn-elements/eventDefinitions': 'src/eventDefinitions/index.js',
    'bpmn-elements/flows': 'src/flows/index.js',
    'bpmn-elements/gateways': 'src/gateways/index.js',
    'bpmn-elements/tasks': 'src/tasks/index.js',
  },
})
  .then(() => {
    // Object.defineProperties getters can't be inferred from constructor functions,
    // so the augmentation file declares them as interface members that merge with
    // the dts-buddy-emitted classes.
    appendFileSync(output, '\n' + readFileSync(augmentations, 'utf8'));
  })
  .catch((err) => {
    throw err;
  });
