"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.generateId = generateId;
exports.brokerSafeId = brokerSafeId;
exports.getUniqueId = getUniqueId;
exports.filterUndefined = filterUndefined;
exports.getOptionsAndCallback = getOptionsAndCallback;
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

function filterUndefined(obj) {
  return Object.keys(obj).reduce((filtered, key) => {
    const objValue = obj[key];
    if (objValue !== undefined) filtered[key] = objValue;
    return filtered;
  }, {});
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