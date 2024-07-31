"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "BoundaryEvent", {
  enumerable: true,
  get: function () {
    return _BoundaryEvent.default;
  }
});
Object.defineProperty(exports, "BoundaryEventBehaviour", {
  enumerable: true,
  get: function () {
    return _BoundaryEvent.BoundaryEventBehaviour;
  }
});
Object.defineProperty(exports, "EndEvent", {
  enumerable: true,
  get: function () {
    return _EndEvent.default;
  }
});
Object.defineProperty(exports, "EndEventBehaviour", {
  enumerable: true,
  get: function () {
    return _EndEvent.EndEventBehaviour;
  }
});
Object.defineProperty(exports, "IntermediateCatchEvent", {
  enumerable: true,
  get: function () {
    return _IntermediateCatchEvent.default;
  }
});
Object.defineProperty(exports, "IntermediateCatchEventBehaviour", {
  enumerable: true,
  get: function () {
    return _IntermediateCatchEvent.IntermediateCatchEventBehaviour;
  }
});
Object.defineProperty(exports, "IntermediateThrowEvent", {
  enumerable: true,
  get: function () {
    return _IntermediateThrowEvent.default;
  }
});
Object.defineProperty(exports, "IntermediateThrowEventBehaviour", {
  enumerable: true,
  get: function () {
    return _IntermediateThrowEvent.IntermediateThrowEventBehaviour;
  }
});
Object.defineProperty(exports, "StartEvent", {
  enumerable: true,
  get: function () {
    return _StartEvent.default;
  }
});
Object.defineProperty(exports, "StartEventBehaviour", {
  enumerable: true,
  get: function () {
    return _StartEvent.StartEventBehaviour;
  }
});
var _BoundaryEvent = _interopRequireWildcard(require("./BoundaryEvent.js"));
var _EndEvent = _interopRequireWildcard(require("./EndEvent.js"));
var _IntermediateCatchEvent = _interopRequireWildcard(require("./IntermediateCatchEvent.js"));
var _IntermediateThrowEvent = _interopRequireWildcard(require("./IntermediateThrowEvent.js"));
var _StartEvent = _interopRequireWildcard(require("./StartEvent.js"));
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }