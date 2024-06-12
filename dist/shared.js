"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.brokerSafeId = brokerSafeId;
exports.generateId = generateId;
exports.getOptionsAndCallback = getOptionsAndCallback;
exports.getUniqueId = getUniqueId;
const safePattern = /[./\\#*:\s]/g;
function generateId() {
  return Math.random().toString(16).substring(2, 12);
}
function brokerSafeId(id) {
  return id.replace(safePattern, '_');
}
function getUniqueId(prefix) {
  return `${brokerSafeId(prefix)}_${generateId()}`;
}
function getOptionsAndCallback(optionsOrCallback, callback) {
  let options;
  if (typeof optionsOrCallback === 'function') {
    callback = optionsOrCallback;
  } else {
    options = optionsOrCallback;
  }
  return [options, callback];
}