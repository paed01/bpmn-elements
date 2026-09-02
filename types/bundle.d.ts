// Hand-written entry for dts-buddy. Star-exports the public runtime surface
// once from `src/index.js` plus the shared interfaces, so the emitted bundle
// has a single declaration per name (no `_1` aliases, no per-module
// duplicates) and new `src/index.js` exports flow into the types
// automatically.
//
// Submodule type entries (`bpmn-elements/events`, `…/tasks`, etc.) are
// emitted as trivial re-export blocks by `scripts/build-types.js`, so every
// public name needs a home here — the events/gateways/tasks stars pick up
// the Behaviour classes that `src/index.js` does not re-export, and the
// execution orchestrators are typed although the runtime does not export
// them.
export * from '../src/index.js';
export * from './interfaces.js';
export { ActivityExecution } from '../src/activity/ActivityExecution.js';
export { DefinitionExecution } from '../src/definition/DefinitionExecution.js';
export * from '../src/events/index.js';
export * from '../src/gateways/index.js';
export * from '../src/tasks/index.js';
