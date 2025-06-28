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
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }