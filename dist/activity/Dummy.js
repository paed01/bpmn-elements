"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Category = Category;
exports.DummyActivity = DummyActivity;
exports.Group = Group;
exports.TextAnnotation = TextAnnotation;
var _messageHelper = require("../messageHelper.js");
/**
 * Placeholder activity for non-executable elements (text annotations, groups, categories).
 * @param {import('#types').ActivityDefinition} activityDef
 * @returns {{ id: string, type: string, name: string | undefined, behaviour: Record<string, any>, parent: import('#types').ElementParent, placeholder: true }}
 */
function DummyActivity(activityDef) {
  const {
    id,
    type = 'dummy',
    name,
    parent,
    behaviour
  } = activityDef;
  return {
    id,
    type,
    name,
    behaviour: {
      ...behaviour
    },
    parent: (0, _messageHelper.cloneParent)(parent),
    placeholder: true
  };
}

/**
 * Text annotation placeholder. Distinct factory identity sharing the dummy implementation.
 * @param {import('#types').ActivityDefinition} activityDef
 */
function TextAnnotation(activityDef) {
  return DummyActivity(activityDef);
}

/**
 * Group placeholder. Distinct factory identity sharing the dummy implementation.
 * @param {import('#types').ActivityDefinition} activityDef
 */
function Group(activityDef) {
  return DummyActivity(activityDef);
}

/**
 * Category placeholder. Distinct factory identity sharing the dummy implementation.
 * @param {import('#types').ActivityDefinition} activityDef
 */
function Category(activityDef) {
  return DummyActivity(activityDef);
}