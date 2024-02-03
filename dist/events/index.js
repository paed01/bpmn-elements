"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _BoundaryEvent = require("./BoundaryEvent.js");
Object.keys(_BoundaryEvent).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _BoundaryEvent[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _BoundaryEvent[key];
    }
  });
});
var _EndEvent = require("./EndEvent.js");
Object.keys(_EndEvent).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _EndEvent[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _EndEvent[key];
    }
  });
});
var _IntermediateCatchEvent = require("./IntermediateCatchEvent.js");
Object.keys(_IntermediateCatchEvent).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _IntermediateCatchEvent[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _IntermediateCatchEvent[key];
    }
  });
});
var _IntermediateThrowEvent = require("./IntermediateThrowEvent.js");
Object.keys(_IntermediateThrowEvent).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _IntermediateThrowEvent[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _IntermediateThrowEvent[key];
    }
  });
});
var _StartEvent = require("./StartEvent.js");
Object.keys(_StartEvent).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _StartEvent[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _StartEvent[key];
    }
  });
});