"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ServiceImplementation;
var _ExecutionScope = _interopRequireDefault(require("../activity/ExecutionScope.js"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ServiceImplementation(activity) {
  this.type = `${activity.type}:implementation`;
  this.implementation = activity.behaviour.implementation;
  this.activity = activity;
}
ServiceImplementation.prototype.execute = function execute(executionMessage, callback) {
  const activity = this.activity;
  const implementation = this.implementation;
  const serviceFn = activity.environment.resolveExpression(implementation, executionMessage);
  if (typeof serviceFn !== 'function') return callback(new Error(`Implementation ${implementation} did not resolve to a function`));
  serviceFn.call(activity, (0, _ExecutionScope.default)(activity, executionMessage), (err, ...args) => {
    callback(err, args);
  });
};