'use strict';

process.env.NODE_ENV = 'test';
Error.stackTraceLimit = 20;
global.expect = require('chai').expect;

module.exports = {
  reporter: 'spec',
  recursive: true,
  require: ['@babel/register'],
  timeout: 1000,
  ui: 'mocha-cakes-2',
};
