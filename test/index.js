'use strict'

var assert = require('assert').strict || require('assert')
var Mocha = require('mocha')
var map = require('..')

Mocha.describe('multiprocess-map', function () {
  this.timeout(10 * 1000)
  after(function () {
    setTimeout(function () {
      process.exit(0)
    })
  })
  Mocha.it('runs sync map functions', function () {
    return map([1, 2, 3], function (n) {
      return n * 2
    }).then(function (values) {
      assert.deepEqual(values, [2, 4, 6])
    })
  })
})
