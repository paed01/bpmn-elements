"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = StandardLoopCharacteristics;
var _LoopCharacteristics = _interopRequireDefault(require("./LoopCharacteristics.js"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function StandardLoopCharacteristics(activity, loopCharacteristics) {
  let {
    behaviour
  } = loopCharacteristics;
  behaviour = {
    ...behaviour,
    isSequential: true
  };
  return new _LoopCharacteristics.default(activity, {
    ...loopCharacteristics,
    behaviour
  });
}