"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = DummyActivity;
var _messageHelper = require("../messageHelper.js");
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