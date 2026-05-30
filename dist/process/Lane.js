"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Lane = Lane;
const K_PROCESS = Symbol.for('process');

/**
 * Process lane. Wraps a `<bpmn:lane>` definition and points back to its owning process;
 * activities reference their lane through `Activity.lane`.
 * @param {import('#types').Process} process
 * @param {import('moddle-context-serializer').SerializableElement} laneDefinition
 */
function Lane(process, laneDefinition) {
  const {
    broker,
    environment
  } = process;
  const {
    id,
    type,
    behaviour
  } = laneDefinition;
  this[K_PROCESS] = process;
  this.id = id;
  this.type = type;
  /** @type {string} */
  this.name = behaviour.name;
  /** @type {import('moddle-context-serializer').Parent} */
  this.parent = {
    id: process.id,
    type: process.type
  };
  /** @type {Record<string, any>} */
  this.behaviour = {
    ...behaviour
  };
  this.environment = environment;
  this.broker = broker;
  this.context = process.context;
  this.logger = environment.Logger(type.toLowerCase());
}
Object.defineProperty(Lane.prototype, 'process', {
  /** @returns {import('#types').Process} */
  get() {
    return this[K_PROCESS];
  }
});