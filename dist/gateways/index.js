"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "EventBasedGateway", {
  enumerable: true,
  get: function () {
    return _EventBasedGateway.default;
  }
});
Object.defineProperty(exports, "EventBasedGatewayBehaviour", {
  enumerable: true,
  get: function () {
    return _EventBasedGateway.EventBasedGatewayBehaviour;
  }
});
Object.defineProperty(exports, "ExclusiveGateway", {
  enumerable: true,
  get: function () {
    return _ExclusiveGateway.default;
  }
});
Object.defineProperty(exports, "ExclusiveGatewayBehaviour", {
  enumerable: true,
  get: function () {
    return _ExclusiveGateway.ExclusiveGatewayBehaviour;
  }
});
Object.defineProperty(exports, "InclusiveGateway", {
  enumerable: true,
  get: function () {
    return _InclusiveGateway.default;
  }
});
Object.defineProperty(exports, "InclusiveGatewayBehaviour", {
  enumerable: true,
  get: function () {
    return _InclusiveGateway.InclusiveGatewayBehaviour;
  }
});
Object.defineProperty(exports, "ParallelGateway", {
  enumerable: true,
  get: function () {
    return _ParallelGateway.default;
  }
});
Object.defineProperty(exports, "ParallelGatewayBehaviour", {
  enumerable: true,
  get: function () {
    return _ParallelGateway.ParallelGatewayBehaviour;
  }
});
var _EventBasedGateway = _interopRequireWildcard(require("./EventBasedGateway.js"));
var _ExclusiveGateway = _interopRequireWildcard(require("./ExclusiveGateway.js"));
var _InclusiveGateway = _interopRequireWildcard(require("./InclusiveGateway.js"));
var _ParallelGateway = _interopRequireWildcard(require("./ParallelGateway.js"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }