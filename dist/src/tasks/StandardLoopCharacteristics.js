"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = StandardLoopCharacteristics;
var _LoopCharacteristics = _interopRequireDefault(require("./LoopCharacteristics"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
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