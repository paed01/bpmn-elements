/// <reference path="../node_modules/mocha-cakes-2/mocha-cakes.d.ts" />

// Side-effect imports keep the task modules augmented by types/interfaces.d.ts
// in the test program even when no test imports them directly.
import '../src/tasks/UserTask.js';
import '../src/tasks/ManualTask.js';
import '../src/tasks/SendTask.js';
import '../src/tasks/BusinessRuleTask.js';

declare global {
  const expect: typeof import('chai').expect;
}

export {};
