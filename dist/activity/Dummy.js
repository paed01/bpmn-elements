"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DummyActivity = DummyActivity;
var _messageHelper = require("../messageHelper.js");
/**
 * Placeholder activity for non-executable elements (text annotations, groups, categories).
 * @param {import('moddle-context-serializer').Activity} activityDef
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