"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ExtensionsMapper;
const kActivated = Symbol.for('activated');
function ExtensionsMapper(context) {
  this.context = context;
}
ExtensionsMapper.prototype.get = function get(activity) {
  return new Extensions(activity, this.context, this._getExtensions());
};
ExtensionsMapper.prototype._getExtensions = function getExtensions() {
  let extensions;
  if (!(extensions = this.context.environment.extensions)) return [];
  return Object.values(extensions);
};
function Extensions(activity, context, extensions) {
  const result = this.extensions = [];
  for (const Extension of extensions) {
    const extension = Extension(activity, context);
    if (extension) result.push(extension);
  }
  this[kActivated] = false;
}
Object.defineProperty(Extensions.prototype, 'count', {
  get() {
    return this.extensions.length;
  }
});
Extensions.prototype.activate = function activate(message) {
  if (this[kActivated]) return;
  this[kActivated] = true;
  for (const extension of this.extensions) extension.activate(message);
};
Extensions.prototype.deactivate = function deactivate(message) {
  if (!this[kActivated]) return;
  this[kActivated] = false;
  for (const extension of this.extensions) extension.deactivate(message);
};