"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.StandardLoopCharacteristics = StandardLoopCharacteristics;
var _LoopCharacteristics = require("./LoopCharacteristics.js");
/**
 * Standard loop characteristics
 * @param {import('#types').Activity} activity
 * @param {import('#types').SerializableElement} loopCharacteristics
 */
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