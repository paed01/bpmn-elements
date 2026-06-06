"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ExpressionCondition = ExpressionCondition;
exports.ScriptCondition = ScriptCondition;
var _ExecutionScope = require("./activity/ExecutionScope.js");
/**
 * Script condition
 * @param {import('#types').ElementBase} owner
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
    return this._script.execute((0, _ExecutionScope.ExecutionScope)(owner, message), callback);
  } catch (err) {
    if (!callback) throw err;
    owner.logger.error(`<${owner.id}>`, err);
    callback(err);
  }
};

/**
 * Expression condition
 * @param {import('#types').ElementBase} owner
 * @param {string} expression
 */
function ExpressionCondition(owner, expression) {
  this.type = 'expression';
  this.expression = expression;
  this._owner = owner;
}

/**
 * Execute
 * @param {import('#types').ElementBrokerMessage} message
 * @param {CallableFunction} callback
 */
ExpressionCondition.prototype.execute = function execute(message, callback) {
  const owner = this._owner;
  try {
    const result = owner.environment.resolveExpression(this.expression, message);
    if (typeof result === 'function') {
      const scope = (0, _ExecutionScope.ExecutionScope)(owner, message);
      if (callback && result.length > 1) return result.call(owner, scope, callback);
      const conditionResult = result.call(owner, scope);
      if (callback) return callback(null, conditionResult);
      return conditionResult;
    }
    if (callback) return callback(null, result);
    return result;
  } catch (err) {
    if (callback) return callback(err);
    throw err;
  }
};