"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.StandardLoopCharacteristics = StandardLoopCharacteristics;
var _LoopCharacteristics = require("./LoopCharacteristics.js");
function StandardLoopCharacteristics(activity, loopCharacteristics) {
  let {
    behaviour
  } = loopCharacteristics;
  behaviour = {
    ...behaviour,
    isSequential: true
  };
  return new _LoopCharacteristics.LoopCharacteristics(activity, {
    ...loopCharacteristics,
    behaviour
  });
}