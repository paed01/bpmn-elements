"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = DummyActivity;

var _messageHelper = require("../messageHelper");

function DummyActivity(activityDef) {
  const {
    id,
    type = 'dummy',
    name,
    parent: originalParent = {},
    behaviour = {}
  } = activityDef;
  return {
    id,
    type,
    name,
    behaviour: { ...behaviour
    },
    parent: (0, _messageHelper.cloneParent)(originalParent),
    placeholder: true
  };
}