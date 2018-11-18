"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ServiceImplementation;

var _ExecutionScope = _interopRequireDefault(require("../activity/ExecutionScope"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ServiceImplementation(activity) {
  const {
    type: atype,
    behaviour,
    environment
  } = activity;
  const implementation = behaviour.implementation;
  const type = `${atype}:implementation`;
  return {
    type,
    implementation,
    execute
  };

  function execute(executionMessage, callback) {
    const serviceFn = environment.resolveExpression(implementation, executionMessage);
    if (typeof serviceFn !== 'function') return callback(new Error(`Implementation ${implementation} did not resolve to a function`));
    serviceFn.call(activity, (0, _ExecutionScope.default)(activity, executionMessage), (err, ...args) => {
      callback(err, args);
    });
  }
}