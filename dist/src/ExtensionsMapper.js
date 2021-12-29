"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ExtensionsMapper;

function ExtensionsMapper(context) {
  const {
    extensions: envExtensions
  } = context.environment;
  const extensions = getExtensions();
  return {
    get
  };

  function get(activity) {
    const activityExtensions = extensions.reduce(applyExtension, []);
    return {
      activate,
      deactivate
    };

    function applyExtension(result, Extension) {
      const extension = Extension(activity, context);
      if (extension) result.push(extension);
      return result;
    }

    function activate(message) {
      for (const extension of activityExtensions) extension.activate(message);
    }

    function deactivate(message) {
      for (const extension of activityExtensions) extension.deactivate(message);
    }
  }

  function getExtensions() {
    const result = [];
    if (!envExtensions) return result;

    for (const key in envExtensions) {
      const extension = envExtensions[key];

      if (extension) {
        result.push(extension);
      }
    }

    return result;
  }
}