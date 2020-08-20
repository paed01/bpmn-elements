"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Transaction;

var _SubProcess = _interopRequireDefault(require("./SubProcess"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function Transaction(activityDef, context) {
  const transaction = {
    type: 'transaction',
    ...activityDef,
    isTransaction: true
  };
  const activity = (0, _SubProcess.default)(transaction, context);
  return activity;
}