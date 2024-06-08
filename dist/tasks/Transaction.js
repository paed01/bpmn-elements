"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Transaction;
var _SubProcess = _interopRequireDefault(require("./SubProcess.js"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function Transaction(activityDef, context) {
  const transaction = {
    type: 'transaction',
    ...activityDef,
    isTransaction: true
  };
  const activity = (0, _SubProcess.default)(transaction, context);
  return activity;
}