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
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }