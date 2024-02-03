"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _EventBasedGateway = require("./EventBasedGateway.js");
Object.keys(_EventBasedGateway).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _EventBasedGateway[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _EventBasedGateway[key];
    }
  });
});
var _ExclusiveGateway = require("./ExclusiveGateway.js");
Object.keys(_ExclusiveGateway).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _ExclusiveGateway[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _ExclusiveGateway[key];
    }
  });
});
var _InclusiveGateway = require("./InclusiveGateway.js");
Object.keys(_InclusiveGateway).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _InclusiveGateway[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _InclusiveGateway[key];
    }
  });
});
var _ParallelGateway = require("./ParallelGateway.js");
Object.keys(_ParallelGateway).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _ParallelGateway[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _ParallelGateway[key];
    }
  });
});