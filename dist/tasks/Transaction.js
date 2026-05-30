"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Transaction = Transaction;
var _SubProcess = require("./SubProcess.js");
/**
 * Transaction
 * @param {import('moddle-context-serializer').Activity} activityDef
 * @param {import('#types').ContextInstance} context
 */
function Transaction(activityDef, context) {
  const transaction = {
    type: 'transaction',
    ...activityDef,
    isTransaction: true
  };
  const activity = (0, _SubProcess.SubProcess)(transaction, context);
  return activity;
}