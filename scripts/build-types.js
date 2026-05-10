import { readFileSync, writeFileSync } from 'node:fs';
import { createBundle } from 'dts-buddy';

const output = 'types/index.d.ts';
const augmentations = 'types/augmentations.d.ts';

createBundle({
  project: 'tsconfig.json',
  output,
  modules: {
    'bpmn-elements': 'src/index.js',
    'bpmn-elements/errors': 'src/error/Errors.js',
    'bpmn-elements/events': 'src/events/index.js',
    'bpmn-elements/eventDefinitions': 'src/eventDefinitions/index.js',
    'bpmn-elements/flows': 'src/flows/index.js',
    'bpmn-elements/gateways': 'src/gateways/index.js',
    'bpmn-elements/tasks': 'src/tasks/index.js',
  },
})
  .then(() => {
    let bundle = readFileSync(output, 'utf8');

    // tsc emits both `export function Foo(...): Foo;` AND `export class Foo { ... }`
    // for constructor functions in JS. The function declaration overshadows the class
    // for type-level constructor checks (`Foo extends new (...args) => any`), so strip it.
    bundle = bundle.replace(
      /^(\s*)(?:export )?function (\w+)\([^)]*\)[^;]*;\n(\s*)((?:export )?class \2\b)/gm,
      '$1$3$4'
    );

    // Object.defineProperties getters can't be inferred from constructor functions,
    // so the augmentation file declares them as interface members that merge with
    // the dts-buddy-emitted classes.
    bundle += '\n' + readFileSync(augmentations, 'utf8');

    writeFileSync(output, bundle);
  })
  .catch((err) => {
    throw err;
  });
