"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = getOptionsAndCallback;

function getOptionsAndCallback(optionsOrCallback, callback, defaultOptions) {
  let options;

  if (typeof optionsOrCallback === 'function') {
    callback = optionsOrCallback;
    options = defaultOptions;
  } else {
    options = defaultOptions ? Object.assign(defaultOptions, optionsOrCallback) : optionsOrCallback;
  }

  return [options, callback];
}