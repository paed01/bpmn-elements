"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ExpressionCondition = ExpressionCondition;
exports.ScriptCondition = ScriptCondition;
var _ExecutionScope = _interopRequireDefault(require("./activity/ExecutionScope.js"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Script condition
 * @param {import('types').ElementBase} owner
 * @param {any} script
 * @param {string} language
 */
function ScriptCondition(owner, script, language) {
  this.type = 'script';
  this.language = language;
  this._owner = owner;
  this._script = script;
}

/**
 * Execute
 * @param {any} message
 * @param {CallableFunction} callback
 */
ScriptCondition.prototype.execute = function execute(message, callback) {
  const owner = this._owner;
  try {
    return this._script.execute((0, _ExecutionScope.default)(owner, message), callback);
  } catch (err) {
    if (!callback) throw err;
    owner.logger.error(`<${owner.id}>`, err);
    callback(err);
  }
};

/**
 * Expression condition
 * @param {import('types').ElementBase} owner
 * @param {string} expression
 */
function ExpressionCondition(owner, expression) {
  this.type = 'expression';
  this.expression = expression;
  this._owner = owner;
}

/**
 * Execute
 * @param {any} message
 * @param {CallableFunction} callback
 */
ExpressionCondition.prototype.execute = function execute(message, callback) {
  const owner = this._owner;
  try {
    const result = owner.environment.resolveExpression(this.expression, message);
    if (callback) return callback(null, result);
    return result;
  } catch (err) {
    if (callback) return callback(err);
    throw err;
  }
};